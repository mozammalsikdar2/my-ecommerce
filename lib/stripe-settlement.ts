import { getStoredStripeCredentials } from "@/lib/payment-config";
import { scheduleMetaPurchase } from "@/lib/meta-purchase";
import { prisma } from "@/lib/prisma";
import { retrieveStripeCheckoutSession } from "@/lib/stripe";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function isSessionForOrder(
  session: JsonRecord,
  orderNumber: string,
  amount: number,
  currency: string,
) {
  return (
    session.client_reference_id === orderNumber &&
    isRecord(session.metadata) &&
    session.metadata.orderNumber === orderNumber &&
    typeof session.amount_total === "number" &&
    session.amount_total === Math.round(amount * 100) &&
    session.currency === currency
  );
}

export async function confirmStripeCheckoutSession(
  sessionId: string,
  expectedOrderNumber?: string,
) {
  const settings = await prisma.paymentSettings.findUnique({
    where: { id: 1 },
  });
  const credentials = settings ? getStoredStripeCredentials(settings) : null;
  if (!credentials) {
    throw new Error("Stored Stripe credentials are unavailable");
  }

  const session = await retrieveStripeCheckoutSession(credentials, sessionId);
  const sessionOrderNumber =
    typeof session.client_reference_id === "string"
      ? session.client_reference_id
      : "";
  if (
    !sessionOrderNumber ||
    (expectedOrderNumber !== undefined &&
      sessionOrderNumber !== expectedOrderNumber)
  ) {
    return { status: "INVALID" as const };
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber: sessionOrderNumber },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      paymentSessionId: true,
      paymentMethod: true,
      paymentStatus: true,
      orderStatus: true,
    },
  });
  if (
    !order ||
    order.paymentMethod !== "CARD" ||
    order.paymentSessionId !== sessionId ||
    order.orderStatus === "CANCELLED" ||
    !isSessionForOrder(
      session,
      order.orderNumber,
      order.totalAmount,
      credentials.currency,
    )
  ) {
    return { status: "INVALID" as const };
  }
  if (order.paymentStatus === "PAID") {
    return { status: "PAID" as const };
  }
  if (session.payment_status !== "paid") {
    return { status: "PENDING" as const };
  }

  const paymentIntent = session.payment_intent;
  const transactionId =
    typeof paymentIntent === "string"
      ? paymentIntent
      : isRecord(paymentIntent) && typeof paymentIntent.id === "string"
        ? paymentIntent.id
        : sessionId;

  const updated = await prisma.order.updateMany({
    where: {
      id: order.id,
      paymentMethod: "CARD",
      paymentSessionId: sessionId,
      paymentStatus: "UNPAID",
      orderStatus: { not: "CANCELLED" },
    },
    data: { paymentStatus: "PAID", transactionId },
  });
  if (updated.count === 1) {
    scheduleMetaPurchase(order.id, { includeRequestContext: false });
    return { status: "PAID" as const };
  }

  const current = await prisma.order.findUnique({
    where: { id: order.id },
    select: { paymentStatus: true, paymentSessionId: true },
  });
  return current?.paymentStatus === "PAID" &&
    current.paymentSessionId === sessionId
    ? { status: "PAID" as const }
    : { status: "INVALID" as const };
}
