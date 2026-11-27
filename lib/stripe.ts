type JsonRecord = Record<string, unknown>;

export interface StripeCredentials {
  secretKey: string;
  currency: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

async function stripeFetch(
  credentials: StripeCredentials,
  path: string,
  init?: RequestInit,
  idempotencyKey?: string,
) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${credentials.secretKey}`,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("Stripe returned an invalid response");
  }
  if (!isRecord(result)) {
    throw new Error("Stripe returned an invalid response");
  }
  if (!response.ok) {
    throw new Error(`Stripe request failed (${response.status})`);
  }
  return result;
}

export function getPublicAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  }
  const url = new URL(configuredUrl);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS");
  }
  return url.origin;
}

export async function createStripeCheckoutSession(
  credentials: StripeCredentials,
  order: {
    id: string;
    orderNumber: string;
    customerEmail: string | null;
    totalAmount: number;
  },
  idempotencyKey: string,
) {
  if (credentials.currency !== "bdt") {
    throw new Error("Stripe Checkout currency must be BDT");
  }
  const amount = Math.round(order.totalAmount * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Order amount is invalid for Stripe Checkout");
  }
  const appUrl = getPublicAppUrl();
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": credentials.currency,
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": `Order ${order.orderNumber}`,
    "line_items[0][quantity]": "1",
    client_reference_id: order.orderNumber,
    "metadata[orderNumber]": order.orderNumber,
    success_url: `${appUrl}/checkout/payment-result?provider=stripe&order=${encodeURIComponent(
      order.orderNumber,
    )}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/checkout/payment-result?provider=stripe&status=cancelled&order=${encodeURIComponent(
      order.orderNumber,
    )}`,
  });
  if (order.customerEmail) params.set("customer_email", order.customerEmail);

  const result = await stripeFetch(
    credentials,
    "checkout/sessions",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    },
    idempotencyKey,
  );
  if (
    typeof result.id !== "string" ||
    typeof result.url !== "string" ||
    !result.url.startsWith("https://checkout.stripe.com/")
  ) {
    throw new Error("Stripe Checkout session response is invalid");
  }

  return { id: result.id, url: result.url };
}

export async function retrieveStripeCheckoutSession(
  credentials: StripeCredentials,
  sessionId: string,
) {
  const result = await stripeFetch(
    credentials,
    `checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
  return result;
}
