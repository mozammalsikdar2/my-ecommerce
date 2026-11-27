import { createHmac, timingSafeEqual } from "node:crypto";
import { isRecord } from "@/lib/api-utils";
import { confirmStripeCheckoutSession } from "@/lib/stripe-settlement";

function isValidSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts
    .filter(([key]) => key === "v1")
    .map(([, value]) => value)
    .filter((value): value is string => Boolean(value));
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    signatures.length === 0 ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest();
  return signatures.some((signature) => {
    if (!/^[\da-f]{64}$/i.test(signature)) return false;
    const candidate = Buffer.from(signature, "hex");
    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Stripe webhook is not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();
  if (!signature || !isValidSignature(payload, signature, secret)) {
    return Response.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
  if (!isRecord(event) || typeof event.type !== "string") {
    return Response.json({ error: "Invalid webhook event" }, { status: 400 });
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return Response.json({ received: true });
  }
  if (
    !isRecord(event.data) ||
    !isRecord(event.data.object) ||
    typeof event.data.object.id !== "string"
  ) {
    return Response.json({ error: "Invalid Checkout session event" }, { status: 400 });
  }

  try {
    const result = await confirmStripeCheckoutSession(
      event.data.object.id,
      typeof event.data.object.client_reference_id === "string"
        ? event.data.object.client_reference_id
        : undefined,
    );
    if (result.status === "INVALID") {
      return Response.json(
        { error: "Stripe session did not match an active order" },
        { status: 400 },
      );
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("POST /api/payments/stripe/webhook error:", error);
    return Response.json(
      { error: "Unable to process Stripe event" },
      { status: 500 },
    );
  }
}
