import { isRecord, readJsonBody } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth-guard";
import {
  CourierProviderError,
  requestCourierJson,
} from "@/lib/courier-api";
import { decryptPaymentSecret } from "@/lib/payment-secrets";
import { validateBangladeshiPhone } from "@/lib/bd-phone";
import { prisma } from "@/lib/prisma";
import { sendOrderSms } from "@/lib/sms";

type Courier = "STEADFAST" | "PATHAO";

function isCourier(value: unknown): value is Courier {
  return value === "STEADFAST" || value === "PATHAO";
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
  const unknownFields = Object.keys(body).filter(
    (field) => !["orderId", "courier", "note", "cityId", "zoneId"].includes(field),
  );
  if (unknownFields.length > 0) {
    return Response.json(
      { error: `Unsupported fields: ${unknownFields.join(", ")}` },
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
  if (!isCourier(body.courier)) {
    return Response.json(
      { error: "courier must be STEADFAST or PATHAO" },
      { status: 400 },
    );
  }
  if (
    body.note !== undefined &&
    (typeof body.note !== "string" || body.note.length > 500)
  ) {
    return Response.json(
      { error: "note must be a string of at most 500 characters" },
      { status: 400 },
    );
  }
  for (const field of ["cityId", "zoneId"] as const) {
    if (
      body[field] !== undefined &&
      (typeof body[field] !== "number" ||
        !Number.isSafeInteger(body[field]) ||
        body[field] <= 0)
    ) {
      return Response.json(
        { error: `${field} must be a positive integer` },
        { status: 400 },
      );
    }
  }

  const orderId = body.orderId.trim();
  const courier = body.courier;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  let bookingAccepted = false;
  let claimTaken = false;
  let previousCourierProvider: string | null = null;
  let previousCourierStatus: string | null = null;

  async function releaseClaim() {
    if (!claimTaken || bookingAccepted) return;
    await prisma.order.updateMany({
      where: {
        id: orderId,
        orderStatus: "CONFIRMED",
        courierProvider: courier,
        courierStatus: "BOOKING",
        consignmentId: null,
      },
      data: {
        courierProvider: previousCourierProvider,
        courierStatus: previousCourierStatus,
      },
    });
  }

  try {
    const [order, config] = await Promise.all([
      prisma.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true } } },
      }),
      prisma.logisticsSettings.findUnique({ where: { id: 1 } }),
    ]);

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    if (!config) {
      return Response.json(
        { error: "Courier settings are not configured" },
        { status: 400 },
      );
    }
    if (order.orderStatus !== "CONFIRMED") {
      return Response.json(
        { error: "Only confirmed orders can be dispatched" },
        { status: 409 },
      );
    }
    if (
      order.courierProvider &&
      order.courierProvider !== courier
    ) {
      return Response.json(
        { error: "Order is already assigned to a different courier" },
        { status: 409 },
      );
    }
    if (order.consignmentId || order.trackingCode) {
      return Response.json(
        { error: "Order already has courier tracking information" },
        { status: 409 },
      );
    }
    if (
      order.paymentMethod !== "COD" &&
      order.paymentStatus !== "PAID"
    ) {
      return Response.json(
        { error: "Online payment must be verified before dispatch" },
        { status: 409 },
      );
    }
    if (order.items.length === 0) {
      return Response.json(
        { error: "Cannot dispatch an order without items" },
        { status: 400 },
      );
    }

    const phoneValidation = validateBangladeshiPhone(order.customerPhone);
    if (!phoneValidation.valid || !phoneValidation.normalized) {
      return Response.json(
        { error: "Order has an invalid Bangladesh phone number" },
        { status: 400 },
      );
    }
    const recipientPhone = phoneValidation.normalized;

    if (courier === "STEADFAST") {
      if (!config.steadfastEnabled) {
        return Response.json(
          { error: "Steadfast is disabled" },
          { status: 400 },
        );
      }
      if (!config.steadfastApiKey || !config.steadfastSecretKey) {
        return Response.json(
          { error: "Steadfast credentials are missing" },
          { status: 400 },
        );
      }
    } else {
      if (!config.pathaoEnabled) {
        return Response.json(
          { error: "Pathao is disabled" },
          { status: 400 },
        );
      }
      if (
        !config.pathaoClientId ||
        !config.pathaoClientSecret ||
        !config.pathaoUsername ||
        !config.pathaoPassword ||
        config.pathaoStoreId <= 0
      ) {
        return Response.json(
          { error: "Pathao credentials or store ID are missing" },
          { status: 400 },
        );
      }
    }

    const bookingTimeout = new Date(Date.now() - 3 * 60 * 1000);
    if (
      order.courierStatus === "BOOKING" &&
      order.updatedAt >= bookingTimeout
    ) {
      return Response.json(
        { error: "A courier booking is already in progress" },
        { status: 409 },
      );
    }

    previousCourierProvider = order.courierProvider;
    previousCourierStatus = order.courierStatus;
    const claim = await prisma.order.updateMany({
      where: {
        id: order.id,
        orderStatus: "CONFIRMED",
        courierProvider: order.courierProvider,
        consignmentId: null,
        trackingCode: null,
        OR: [
          { courierStatus: null },
          { courierStatus: { not: "BOOKING" } },
          { courierStatus: "BOOKING", updatedAt: { lt: bookingTimeout } },
        ],
      },
      data: { courierProvider: courier, courierStatus: "BOOKING" },
    });
    if (claim.count !== 1) {
      return Response.json(
        { error: "Order changed or another courier booking is in progress" },
        { status: 409 },
      );
    }
    claimTaken = true;

    const codAmount =
      order.paymentMethod === "COD" && order.paymentStatus !== "PAID"
        ? Math.round(order.totalAmount)
        : 0;
    const shipmentNote = note || `Order ${order.orderNumber}`;

    let consignmentId: string;
    let trackingCode: string;
    let courierStatus: string;

    if (courier === "STEADFAST") {
      let apiKey: string;
      let secretKey: string;
      try {
        apiKey = decryptPaymentSecret(config.steadfastApiKey);
        secretKey = decryptPaymentSecret(config.steadfastSecretKey);
      } catch {
        await releaseClaim();
        return Response.json(
          { error: "Unable to decrypt Steadfast credentials" },
          { status: 503 },
        );
      }

      const data = await requestCourierJson(
        "https://portal.packzy.com/api/v1/create_order",
        {
          method: "POST",
          headers: {
            "Api-Key": apiKey,
            "Secret-Key": secretKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            invoice: order.orderNumber,
            recipient_name: order.customerName.slice(0, 100),
            recipient_phone: recipientPhone,
            recipient_address: order.deliveryAddress.slice(0, 250),
            cod_amount: codAmount,
            note: shipmentNote,
          }),
        },
      );
      if (
        data.status !== 200 ||
        !isRecord(data.consignment) ||
        data.consignment.consignment_id === undefined ||
        data.consignment.consignment_id === null
      ) {
        throw new CourierProviderError();
      }
      consignmentId = String(data.consignment.consignment_id);
      trackingCode = String(data.consignment.tracking_code || consignmentId);
      courierStatus =
        typeof data.consignment.status === "string"
          ? data.consignment.status.slice(0, 200)
          : "in_review";
    } else {
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
        await releaseClaim();
        return Response.json(
          { error: "Unable to decrypt Pathao credentials" },
          { status: 503 },
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

      const totalQuantity = order.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const itemDescription = order.items
        .map((item) => `${item.quantity}x ${item.product.name}`)
        .join(", ")
        .slice(0, 200);
      const createData = await requestCourierJson(
        `${baseUrl}/aladdin/api/v1/orders`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            store_id: config.pathaoStoreId,
            merchant_order_id: order.orderNumber,
            recipient_name: order.customerName.slice(0, 100),
            recipient_phone: recipientPhone,
            recipient_address: order.deliveryAddress.slice(0, 250),
            recipient_city:
              typeof body.cityId === "number"
                ? body.cityId
                : config.pathaoDefaultCityId,
            recipient_zone:
              typeof body.zoneId === "number"
                ? body.zoneId
                : config.pathaoDefaultZoneId,
            delivery_type: 48,
            item_type: 2,
            special_instruction: note,
            item_quantity: Math.max(1, totalQuantity),
            item_weight: 0.5,
            amount_to_collect: codAmount,
            item_description: itemDescription,
          }),
        },
      );
      if (
        !isRecord(createData.data) ||
        createData.data.consignment_id === undefined ||
        createData.data.consignment_id === null
      ) {
        throw new CourierProviderError();
      }
      consignmentId = String(createData.data.consignment_id);
      trackingCode = consignmentId;
      courierStatus =
        typeof createData.data.order_status === "string"
          ? createData.data.order_status.slice(0, 200)
          : "Pending";
    }

    bookingAccepted = true;
    const update = await prisma.order.updateMany({
      where: {
        id: order.id,
        orderStatus: "CONFIRMED",
        courierProvider: courier,
        courierStatus: "BOOKING",
        consignmentId: null,
      },
      data: {
        orderStatus: "SHIPPED",
        courierProvider: courier,
        consignmentId,
        trackingCode,
        courierStatus,
      },
    });
    if (update.count !== 1) {
      console.error("Courier booking succeeded but order update conflicted", {
        orderNumber: order.orderNumber,
        courier,
      });
      return Response.json(
        {
          error:
            "Courier booking succeeded, but order tracking could not be saved. Contact an administrator before retrying.",
        },
        { status: 500 },
      );
    }

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });
    if (!updatedOrder) {
      return Response.json(
        {
          error:
            "Courier booking succeeded, but the updated order could not be loaded",
        },
        { status: 500 },
      );
    }

    try {
      const smsResult = await sendOrderSms({
        phone: order.customerPhone,
        type: "SHIPPED",
        variables: {
          customerName: order.customerName,
          orderNumber: order.orderNumber,
          courier: courier === "STEADFAST" ? "Steadfast" : "Pathao",
          trackingCode,
        },
      });
      if (!smsResult.sent && smsResult.reason !== "SMS gateway is disabled") {
        console.warn("Courier dispatch SMS was not sent", {
          orderNumber: order.orderNumber,
          courier,
          reason: smsResult.reason,
        });
      }
    } catch (error) {
      console.error("Courier booking succeeded but shipment SMS failed", {
        orderNumber: order.orderNumber,
        courier,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }

    return Response.json({
      message: `Parcel booked with ${courier === "STEADFAST" ? "Steadfast" : "Pathao"}.`,
      order: updatedOrder,
    });
  } catch (error) {
    try {
      await releaseClaim();
    } catch (releaseError) {
      console.error("Failed to release courier booking claim", {
        orderId,
        errorName:
          releaseError instanceof Error ? releaseError.name : "UnknownError",
      });
    }
    console.error("Courier dispatch failed", {
      orderId,
      courier,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      {
        error:
          error instanceof CourierProviderError
            ? "Courier provider rejected the booking request"
            : "Courier dispatch failed",
      },
      {
        status: error instanceof CourierProviderError ? 502 : 500,
      },
    );
  }
}
