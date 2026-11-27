import { getPaymentConfig } from "@/lib/payment-config";

export async function GET(request: Request) {
  const { pathname } = new URL(request.url);
  if (!pathname.endsWith("/api/payments/methods")) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { settings, bkash, stripe } = await getPaymentConfig();
    const methods = [];
    if (settings.codEnabled) {
      methods.push({
        id: "COD",
        label: "Cash on Delivery",
        description: "Pay cash when your order arrives",
      });
    }
    if (bkash) {
      methods.push({
        id: "BKASH",
        label: "bKash",
        description: "Pay securely with bKash",
      });
    }
    if (stripe) {
      methods.push({
        id: "CARD",
        label: "Card",
        description: "Pay securely with Stripe Checkout",
      });
    }
    return Response.json(
      { methods },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/payments/methods error:", error);
    return Response.json(
      { error: "Unable to load payment methods" },
      { status: 500 },
    );
  }
}
