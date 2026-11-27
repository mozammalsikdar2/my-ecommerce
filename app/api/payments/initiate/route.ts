import { randomUUID } from "node:crypto";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { bkashRequest } from "@/lib/bkash";
import { getPaymentConfig } from "@/lib/payment-config";
import {
  createStripeCheckoutSession,
  getPublicAppUrl,
} from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

class PaymentRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isCheckoutUrlSafe(paymentMethod: string, value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (paymentMethod === "CARD") {
      return url.hostname === "checkout.stripe.com";
    }
    return (
      url.hostname === "bka.sh" || url.hostname.endsWith(".bka.sh")
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (
    !isRecord(body) ||
    typeof body.orderNumber !== "string" ||
    !body.orderNumber.trim()
  ) {
    return Response.json(
      { error: "orderNumber is required" },
      { status: 400 },
    );
  }

  try {
    const orderNumber = body.orderNumber.trim();
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        orderNumber: true,
        customerEmail: true,
        totalAmount: true,
        paymentMethod: true,
        paymentSessionId: true,
        paymentCheckoutUrl: true,
        paymentStatus: true,
        orderStatus: true,
      },
    });
    if (!order) throw new PaymentRequestError("Order not found", 404);
    if (order.paymentStatus === "PAID") {
      throw new PaymentRequestError("This order has already been paid", 409);
    }
    if (order.orderStatus === "CANCELLED") {
      throw new PaymentRequestError("This order has been cancelled", 409);
    }

    const pendingStripeAttempt =
      order.paymentMethod === "CARD" &&
      order.paymentSessionId?.startsWith("pending:")
        ? order.paymentSessionId
        : null;
    if (order.paymentSessionId && !pendingStripeAttempt) {
      if (
        order.paymentCheckoutUrl &&
        isCheckoutUrlSafe(order.paymentMethod, order.paymentCheckoutUrl)
      ) {
        return Response.json({ checkoutUrl: order.paymentCheckoutUrl });
      }
      throw new PaymentRequestError(
        "A payment attempt is already being prepared. Please refresh the payment status.",
        409,
      );
    }

    const config = await getPaymentConfig();
    if (order.paymentMethod === "BKASH" && !config.bkash) {
      throw new PaymentRequestError(
        "bKash payments are currently unavailable",
        503,
      );
    }
    if (order.paymentMethod === "CARD" && !config.stripe) {
      throw new PaymentRequestError(
        "Card payments are currently unavailable",
        503,
      );
    }
    if (order.paymentMethod !== "BKASH" && order.paymentMethod !== "CARD") {
      throw new PaymentRequestError(
        "This order does not support online payment",
        400,
      );
    }

    const attemptId = pendingStripeAttempt ?? `pending:${randomUUID()}`;
    if (!pendingStripeAttempt) {
      const claimed = await prisma.order.updateMany({
        where: {
          id: order.id,
          paymentMethod: order.paymentMethod,
          paymentStatus: "UNPAID",
          paymentSessionId: null,
          orderStatus: { not: "CANCELLED" },
        },
        data: { paymentSessionId: attemptId },
      });
      if (claimed.count !== 1) {
        throw new PaymentRequestError(
          "A payment attempt is already being prepared. Please refresh the payment status.",
          409,
        );
      }
    }

    if (order.paymentMethod === "BKASH") {
      const bkash = config.bkash;
      if (!bkash) {
        throw new PaymentRequestError(
          "bKash payments are currently unavailable",
          503,
        );
      }
      const callbackUrl = new URL(
        "/api/payments/bkash/callback",
        getPublicAppUrl(),
      );
      callbackUrl.searchParams.set("order", order.orderNumber);
      const payment = await bkashRequest(
        bkash,
        "tokenized-checkout/payment/create",
        {
          mode: "0011",
          payerReference: order.orderNumber,
          callbackURL: callbackUrl.toString(),
          amount: order.totalAmount.toFixed(2),
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: order.orderNumber,
        },
      );

      const paymentId =
        typeof payment.paymentID === "string" ? payment.paymentID : "";
      const redirectUrl =
        typeof payment.bkashURL === "string"
          ? payment.bkashURL
          : typeof payment.bKashURL === "string"
            ? payment.bKashURL
            : "";
      let parsedRedirect: URL | null = null;
      try {
        parsedRedirect = new URL(redirectUrl);
      } catch {
        parsedRedirect = null;
      }
      if (
        !paymentId ||
        !parsedRedirect ||
        parsedRedirect.protocol !== "https:" ||
        !(
          parsedRedirect.hostname === "bka.sh" ||
          parsedRedirect.hostname.endsWith(".bka.sh")
        )
      ) {
        throw new Error("bKash checkout response is invalid");
      }

      const updated = await prisma.order.updateMany({
        where: {
          id: order.id,
          paymentMethod: "BKASH",
          paymentStatus: "UNPAID",
          paymentSessionId: attemptId,
          orderStatus: { not: "CANCELLED" },
        },
        data: {
          paymentSessionId: paymentId,
          paymentCheckoutUrl: parsedRedirect.toString(),
        },
      });
      if (updated.count !== 1) {
        throw new PaymentRequestError("Order is no longer available", 409);
      }
      return Response.json({ checkoutUrl: parsedRedirect.toString() });
    }

    if (order.paymentMethod === "CARD") {
      const stripe = config.stripe;
      if (!stripe) {
        throw new PaymentRequestError(
          "Card payments are currently unavailable",
          503,
        );
      }
      const session = await createStripeCheckoutSession(
        stripe,
        order,
        `ecommerce_${order.id}_${attemptId.slice("pending:".length)}`,
      );
      const updated = await prisma.order.updateMany({
        where: {
          id: order.id,
          paymentMethod: "CARD",
          paymentStatus: "UNPAID",
          paymentSessionId: attemptId,
          orderStatus: { not: "CANCELLED" },
        },
        data: {
          paymentSessionId: session.id,
          paymentCheckoutUrl: session.url,
        },
      });
      if (updated.count !== 1) {
        throw new PaymentRequestError("Order is no longer available", 409);
      }
      return Response.json({ checkoutUrl: session.url });
    }

    throw new PaymentRequestError(
      "This order does not support online payment",
      400,
    );
  } catch (error) {
    if (error instanceof PaymentRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/payments/initiate error:", error);
    return Response.json(
      { error: "Unable to initiate payment. Please try again." },
      { status: 502 },
    );
  }
}
