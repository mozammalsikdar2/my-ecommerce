import { isRecord, readJsonBody } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth-guard";
import {
  CourierProviderError,
  requestCourierJson,
} from "@/lib/courier-api";
import { decryptPaymentSecret } from "@/lib/payment-secrets";
import { prisma } from "@/lib/prisma";

type Courier = "STEADFAST" | "PATHAO";

function isCourier(value: string | null): value is Courier {
  return value === "STEADFAST" || value === "PATHAO";
}

function isDeliveredStatus(status: string) {
  const normalized = status.toLowerCase().trim().replace(/[_-]+/g, " ");
  return [
    "delivered",
    "delivered to customer",
    "delivered successfully",
  ].includes(normalized);
}

export async function POST(request: Request) {
  const { errorResponse } = await requireRole(["ADMIN", "MODERATOR"], request);
  if (errorResponse) return errorResponse;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }
  if (Object.keys(body).some((field) => field !== "orderId")) {
    return Response.json(
      { error: "Only orderId is supported" },
      { status: 400 },
    );
  }
  if (
    typeof body.orderId !== "string" ||
    !body.orderId.trim() ||
    body.orderId.length > 100
  ) {
    return Response.json(
      { error: "orderId must be a non-empty string" },
      { status: 400 },
    );
  }

  const orderId = body.orderId.trim();
  try {
    const [order, config] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId } }),
      prisma.logisticsSettings.findUnique({ where: { id: 1 } }),
    ]);

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    if (!order.consignmentId || !isCourier(order.courierProvider)) {
      return Response.json(
        { error: "Order has not been dispatched to a supported courier" },
        { status: 400 },
      );
    }
    if (!config) {
      return Response.json(
        { error: "Courier settings are not configured" },
        { status: 400 },
      );
    }
    if (order.orderStatus !== "SHIPPED" && order.orderStatus !== "DELIVERED") {
      return Response.json(
        { error: "Only shipped orders can sync courier status" },
        { status: 409 },
      );
    }

    let liveStatus: string | undefined;
    if (order.courierProvider === "STEADFAST") {
      if (!config.steadfastEnabled) {
        return Response.json(
          { error: "Steadfast is disabled" },
          { status: 400 },
        );
      }

      let apiKey: string;
      let secretKey: string;
      try {
        apiKey = decryptPaymentSecret(config.steadfastApiKey);
        secretKey = decryptPaymentSecret(config.steadfastSecretKey);
      } catch {
        return Response.json(
          { error: "Unable to decrypt Steadfast credentials" },
          { status: 503 },
        );
      }
      if (!apiKey || !secretKey) {
        return Response.json(
          { error: "Steadfast credentials are missing" },
          { status: 400 },
        );
      }

      const data = await requestCourierJson(
        `https://portal.packzy.com/api/v1/status_by_cid/${encodeURIComponent(order.consignmentId)}`,
        {
          headers: {
            "Api-Key": apiKey,
            "Secret-Key": secretKey,
          },
        },
      );
      if (typeof data.delivery_status === "string") {
        liveStatus = data.delivery_status.trim().slice(0, 200);
      }
    } else {
      if (!config.pathaoEnabled) {
        return Response.json(
          { error: "Pathao is disabled" },
          { status: 400 },
        );
      }

      let clientId: string;
      let clientSecret: string;
      let username: string;
      let password: string;
      try {
        clientId = decryptPaymentSecret(config.pathaoClientId);
        clientSecret = decryptPaymentSecret(config.pathaoClientSecret);
        username = decryptPaymentSecret(config.pathaoUsername);
        password = decryptPaymentSecret(config.pathaoPassword);
      } catch {
        return Response.json(
          { error: "Unable to decrypt Pathao credentials" },
          { status: 503 },
        );
      }
      if (!clientId || !clientSecret || !username || !password) {
        return Response.json(
          { error: "Pathao credentials are missing" },
          { status: 400 },
        );
      }

      const baseUrl = config.pathaoSandbox
        ? "https://courier-api-sandbox.pathao.com"
        : "https://api-hermes.pathao.com";
      const tokenData = await requestCourierJson(
        `${baseUrl}/aladdin/api/v1/issue-token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            username,
            password,
            grant_type: "password",
          }),
        },
      );
      if (
        typeof tokenData.access_token !== "string" ||
        !tokenData.access_token
      ) {
        throw new CourierProviderError();
      }

      const infoData = await requestCourierJson(
        `${baseUrl}/aladdin/api/v1/orders/${encodeURIComponent(order.consignmentId)}/info`,
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: "application/json",
          },
        },
      );
      if (
        isRecord(infoData.data) &&
        typeof infoData.data.order_status === "string"
      ) {
        liveStatus = infoData.data.order_status.trim().slice(0, 200);
      }
    }

    if (!liveStatus) {
      throw new CourierProviderError();
    }

    const delivered =
      order.orderStatus === "SHIPPED" && isDeliveredStatus(liveStatus);
    const update = await prisma.order.updateMany({
      where: {
        id: order.id,
        courierProvider: order.courierProvider,
        consignmentId: order.consignmentId,
        orderStatus: { in: ["SHIPPED", "DELIVERED"] },
      },
      data: {
        courierStatus: liveStatus,
        ...(delivered
          ? {
              orderStatus: "DELIVERED",
              ...(order.paymentMethod === "COD"
                ? { paymentStatus: "PAID" }
                : {}),
            }
          : {}),
      },
    });
    if (update.count !== 1) {
      return Response.json(
        { error: "Order changed while courier status was syncing" },
        { status: 409 },
      );
    }

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });
    if (!updatedOrder) {
      return Response.json(
        { error: "Courier status was synced but the order could not be loaded" },
        { status: 500 },
      );
    }

    return Response.json({
      courierStatus: liveStatus,
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Courier status sync failed", {
      orderId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      {
        error:
          error instanceof CourierProviderError
            ? "Courier provider status request failed"
            : "Failed to sync courier status",
      },
      { status: error instanceof CourierProviderError ? 502 : 500 },
    );
  }
}
