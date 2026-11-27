import { confirmStripeCheckoutSession } from "@/lib/stripe-settlement";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderNumber = searchParams.get("order")?.trim() ?? "";
  const sessionId = searchParams.get("session_id")?.trim() ?? "";
  if (!orderNumber || !sessionId) {
    return Response.json(
      { error: "order and session_id are required" },
      { status: 400 },
    );
  }

  try {
    const result = await confirmStripeCheckoutSession(sessionId, orderNumber);
    if (result.status === "INVALID") {
      return Response.json(
        { error: "Unable to verify this payment" },
        { status: 400 },
      );
    }
    return Response.json({ status: result.status });
  } catch (error) {
    console.error("GET /api/payments/stripe/verify error:", error);
    return Response.json(
      { error: "Unable to verify payment right now" },
      { status: 502 },
    );
  }
}
