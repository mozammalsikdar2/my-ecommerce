import type { LogisticsSettings } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isRecord, readLimitedTextBody } from "@/lib/api-utils";
import {
  CourierProviderError,
  requestCourierJson,
} from "@/lib/courier-api";
import { processCourierWebhookUpdate } from "@/lib/courier-webhook";
import { decryptPaymentSecret } from "@/lib/payment-secrets";
import { prisma } from "@/lib/prisma";

const MAX_BODY_LENGTH = 64 * 1024;
const PATHAO_VERIFICATION_HEADER =
  "X-Pathao-Merchant-Webhook-Integration-Secret";
const PATHAO_VERIFICATION_VALUE = "f3992ecc-59da-4cbe-a049-a13da2018d51";

function pathaoResponse(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      [PATHAO_VERIFICATION_HEADER]: PATHAO_VERIFICATION_VALUE,
      "Cache-Control": "no-store",
    },
  });
}

function isSecretMatch(received: string, expected: string) {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

function isPathaoSignatureMatch(
  received: string,
  expectedSecret: string,
  rawBody: string,
) {
  if (isSecretMatch(received, expectedSecret)) return true;
  if (!/^[\da-f]{64}$/i.test(received)) return false;

  const expectedSignature = createHmac("sha256", expectedSecret)
    .update(rawBody)
    .digest("hex");
  return isSecretMatch(received.toLowerCase(), expectedSignature);
}

function readIdentifier(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const identifier = String(value).trim();
  return identifier && identifier.length <= 100 ? identifier : null;
}

function normalizeStatus(status: string) {
  return status.toLowerCase().trim().replace(/[_-]+/g, " ");
}

function getOutcome(event: string, status: string) {
  const normalized = normalizeStatus(status);
  if (
    ["delivered", "delivered to customer", "delivered successfully"].includes(
      normalized,
    )
  ) {
    return "DELIVERED" as const;
  }
  if (
    event === "order.returned-to-merchant" &&
    ["return", "returned", "returned to merchant", "returned to sender"].includes(
      normalized,
    )
  ) {
    return "RETURNED" as const;
  }
  return "IN_TRANSIT" as const;
}

async function getLiveOrderStatus(
  settings: Pick<
    LogisticsSettings,
    | "pathaoClientId"
    | "pathaoClientSecret"
    | "pathaoUsername"
    | "pathaoPassword"
    | "pathaoSandbox"
  >,
  consignmentId: string,
) {
  let clientId: string;
  let clientSecret: string;
  let username: string;
  let password: string;
  try {
    clientId = decryptPaymentSecret(settings.pathaoClientId);
    clientSecret = decryptPaymentSecret(settings.pathaoClientSecret);
    username = decryptPaymentSecret(settings.pathaoUsername);
    password = decryptPaymentSecret(settings.pathaoPassword);
  } catch {
    throw new CourierProviderError("Pathao credentials could not be decrypted");
  }

  if (!clientId || !clientSecret || !username || !password) {
    throw new CourierProviderError("Pathao credentials are missing");
  }

  const baseUrl = settings.pathaoSandbox
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
    4000,
  );
  if (
    typeof tokenData.access_token !== "string" ||
    !tokenData.access_token
  ) {
    throw new CourierProviderError("Pathao did not return an access token");
  }

  const infoData = await requestCourierJson(
    `${baseUrl}/aladdin/api/v1/orders/${encodeURIComponent(consignmentId)}/info`,
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    },
    4000,
  );
  if (
    !isRecord(infoData.data) ||
    typeof infoData.data.order_status !== "string" ||
    !infoData.data.order_status.trim()
  ) {
    throw new CourierProviderError("Pathao order status is unavailable");
  }
  return infoData.data.order_status.trim().slice(0, 200);
}

export async function POST(request: Request) {
  let settings;
  try {
    settings = await prisma.logisticsSettings.findUnique({
      where: { id: 1 },
    });
  } catch (error) {
    console.error("Pathao webhook settings lookup failed:", error);
    return pathaoResponse({ error: "Webhook is unavailable" }, 500);
  }

  if (!settings?.pathaoEnabled) {
    return pathaoResponse({ error: "Pathao webhook is disabled" }, 503);
  }
  if (!settings.pathaoWebhookSecret) {
    return pathaoResponse(
      { error: "Pathao webhook authentication is not configured" },
      503,
    );
  }

  let expectedSecret: string;
  try {
    expectedSecret = decryptPaymentSecret(settings.pathaoWebhookSecret);
  } catch (error) {
    console.error("Pathao webhook secret decryption failed:", error);
    return pathaoResponse({ error: "Webhook is unavailable" }, 503);
  }

  const body = await readLimitedTextBody(request, MAX_BODY_LENGTH);
  if (!body.ok) {
    return pathaoResponse({ error: body.error }, body.status);
  }

  const receivedSecret = request.headers.get("x-pathao-signature")?.trim();
  if (
    !receivedSecret ||
    !isPathaoSignatureMatch(receivedSecret, expectedSecret, body.text)
  ) {
    return pathaoResponse({ error: "Unauthorized" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return pathaoResponse(
      { error: "Request body must be valid JSON" },
      400,
    );
  }
  if (!isRecord(payload) || typeof payload.event !== "string") {
    return pathaoResponse(
      { error: "Request body must include a webhook event" },
      400,
    );
  }

  if (payload.event === "webhook_integration") {
    return pathaoResponse(
      { status: 202, message: "Webhook integration verified" },
      202,
    );
  }
  if (!payload.event.startsWith("order.")) {
    return pathaoResponse({ status: 202, message: "Event ignored" }, 202);
  }

  const consignmentId = readIdentifier(payload.consignment_id);
  const orderNumber = readIdentifier(payload.merchant_order_id);
  if (!consignmentId && !orderNumber) {
    return pathaoResponse(
      { error: "Webhook requires a consignment ID or merchant order ID" },
      400,
    );
  }

  try {
    const matches = await prisma.order.findMany({
      where: {
        courierProvider: "PATHAO",
        OR: [
          ...(consignmentId ? [{ consignmentId }] : []),
          ...(orderNumber ? [{ orderNumber }] : []),
        ],
      },
      select: {
        consignmentId: true,
        orderNumber: true,
      },
      take: 2,
    });
    if (matches.length === 0) {
      return pathaoResponse({ error: "No matching Pathao order found" }, 404);
    }
    if (matches.length > 1) {
      return pathaoResponse(
        { error: "Webhook identifiers match more than one order" },
        409,
      );
    }

    const order = matches[0];
    if (
      !order.consignmentId ||
      (consignmentId && order.consignmentId !== consignmentId) ||
      (orderNumber && order.orderNumber !== orderNumber)
    ) {
      return pathaoResponse(
        { error: "Webhook identifiers do not match the stored order" },
        409,
      );
    }

    const rawStatus = await getLiveOrderStatus(settings, order.consignmentId);
    const result = await processCourierWebhookUpdate({
      provider: "PATHAO",
      consignmentId: order.consignmentId,
      orderNumber: order.orderNumber,
      rawCourierStatus: rawStatus,
      outcome: getOutcome(payload.event, rawStatus),
    });
    if (!result.ok) {
      return pathaoResponse({ error: result.message }, result.status);
    }

    return pathaoResponse(
      {
        message: "Pathao webhook processed",
        orderNumber: result.orderNumber,
        orderStatus: result.orderStatus,
        stockRestored: result.stockRestored,
      },
      202,
    );
  } catch (error) {
    console.error("Pathao webhook processing failed:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return pathaoResponse(
      {
        error:
          error instanceof CourierProviderError
            ? "Unable to verify live Pathao order status"
            : "Failed to process webhook",
      },
      error instanceof CourierProviderError ? 502 : 500,
    );
  }
}
