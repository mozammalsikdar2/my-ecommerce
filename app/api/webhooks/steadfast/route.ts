import { timingSafeEqual } from "node:crypto";
import { isRecord, readLimitedTextBody } from "@/lib/api-utils";
import { processCourierWebhookUpdate } from "@/lib/courier-webhook";
import { decryptPaymentSecret } from "@/lib/payment-secrets";
import { prisma } from "@/lib/prisma";

const MAX_BODY_LENGTH = 64 * 1024;

function isSecretMatch(received: string, expected: string) {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

function readBearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1].trim() || null;
}

function readIdentifier(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const identifier = String(value).trim();
  return identifier && identifier.length <= 100 ? identifier : null;
}

function normalizeOutcome(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "delivered") {
    return "DELIVERED" as const;
  }
  if (
    normalized === "cancelled" ||
    normalized === "returned" ||
    normalized === "partial_delivered_returned" ||
    normalized.includes("return")
  ) {
    return "RETURNED" as const;
  }
  return "IN_TRANSIT" as const;
}

export async function POST(request: Request) {
  let settings;
  try {
    settings = await prisma.logisticsSettings.findUnique({
      where: { id: 1 },
    });
  } catch (error) {
    console.error("Steadfast webhook settings lookup failed:", error);
    return Response.json({ error: "Webhook is unavailable" }, { status: 500 });
  }

  if (!settings?.steadfastEnabled) {
    return Response.json(
      { error: "Steadfast webhook is disabled" },
      { status: 503 },
    );
  }
  if (!settings.steadfastWebhookSecret) {
    return Response.json(
      { error: "Steadfast webhook authentication is not configured" },
      { status: 503 },
    );
  }

  let expectedSecret: string;
  try {
    expectedSecret = decryptPaymentSecret(settings.steadfastWebhookSecret);
  } catch (error) {
    console.error("Steadfast webhook secret decryption failed:", error);
    return Response.json({ error: "Webhook is unavailable" }, { status: 503 });
  }

  const receivedToken = readBearerToken(request.headers.get("authorization"));
  if (!receivedToken || !isSecretMatch(receivedToken, expectedSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readLimitedTextBody(request, MAX_BODY_LENGTH);
  if (!body.ok) {
    return Response.json({ error: body.error }, { status: body.status });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }
  if (!isRecord(payload)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  const rawStatus =
    typeof payload.status === "string" && payload.status.trim()
      ? payload.status.trim()
      : typeof payload.delivery_status === "string" &&
          payload.delivery_status.trim()
        ? payload.delivery_status.trim()
        : "updated";
  const trackingMessage =
    typeof payload.tracking_message === "string" &&
    payload.tracking_message.trim()
      ? `${rawStatus} (${payload.tracking_message.trim()})`
      : rawStatus;
  const consignmentId = readIdentifier(payload.consignment_id);
  const orderNumber = readIdentifier(
    payload.merchant_order_id ?? payload.order_number ?? payload.invoice,
  );

  if (trackingMessage.length > 180) {
    return Response.json(
      { error: "Webhook status is missing or invalid" },
      { status: 400 },
    );
  }
  if (!consignmentId && !orderNumber) {
    return Response.json(
      { error: "Webhook requires a consignment ID or order number" },
      { status: 400 },
    );
  }

  try {
    const result = await processCourierWebhookUpdate({
      provider: "STEADFAST",
      consignmentId,
      orderNumber,
      rawCourierStatus: trackingMessage,
      outcome: normalizeOutcome(rawStatus),
    });
    if (!result.ok) {
      return Response.json(
        { status: "error", message: result.message },
        { status: result.status },
      );
    }

    return Response.json({
      status: "success",
      message: "Webhook received successfully.",
      orderNumber: result.orderNumber,
      orderStatus: result.orderStatus,
      stockRestored: result.stockRestored,
    });
  } catch (error) {
    console.error("Steadfast webhook processing failed:", error);
    return Response.json(
      { error: "Failed to process webhook" },
      { status: 500 },
    );
  }
}
