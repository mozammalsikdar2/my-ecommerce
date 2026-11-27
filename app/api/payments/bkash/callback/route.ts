import { NextResponse } from "next/server";
import { bkashRequest } from "@/lib/bkash";
import {
  getStoredBkashCredentials,
} from "@/lib/payment-config";
import { getPublicAppUrl } from "@/lib/stripe";
import { scheduleMetaPurchase } from "@/lib/meta-purchase";
import { prisma } from "@/lib/prisma";

function paymentResultUrl(orderNumber: string, status: string) {
  const url = new URL("/checkout/payment-result", getPublicAppUrl());
  url.searchParams.set("provider", "bkash");
  url.searchParams.set("order", orderNumber);
  url.searchParams.set("status", status);
  return url;
}

function matchesAmount(value: unknown, expected: number) {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const actualAmount = Number(value);
  return (
    Number.isFinite(actualAmount) &&
    Math.round(actualAmount * 100) === Math.round(expected * 100)
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderNumber = searchParams.get("order")?.trim() ?? "";
  const paymentId = searchParams.get("paymentID")?.trim() ?? "";
  const callbackStatus = searchParams.get("status")?.toLowerCase();

  if (!orderNumber) {
    return NextResponse.redirect(paymentResultUrl("", "failed"));
  }
  if (callbackStatus !== "success" || !paymentId) {
    return NextResponse.redirect(
      paymentResultUrl(orderNumber, callbackStatus === "cancel" ? "cancelled" : "failed"),
    );
  }

  try {
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        paymentMethod: true,
        paymentSessionId: true,
        paymentStatus: true,
        orderStatus: true,
      },
    });
    if (
      !order ||
      order.paymentMethod !== "BKASH" ||
      order.paymentSessionId !== paymentId ||
      order.orderStatus === "CANCELLED"
    ) {
      return NextResponse.redirect(paymentResultUrl(orderNumber, "failed"));
    }
    if (order.paymentStatus === "PAID") {
      return NextResponse.redirect(paymentResultUrl(orderNumber, "success"));
    }

    const settings = await prisma.paymentSettings.findUnique({
      where: { id: 1 },
    });
    const credentials = settings ? getStoredBkashCredentials(settings) : null;
    if (!credentials) {
      throw new Error("Stored bKash credentials are unavailable");
    }

    let payment: Record<string, unknown>;
    try {
      payment = await bkashRequest(
        credentials,
        "tokenized-checkout/payment/execute",
        { paymentID: paymentId },
      );
    } catch (executeError) {
      console.error("bKash execute request failed; querying payment:", executeError);
      payment = await bkashRequest(
        credentials,
        "tokenized-checkout/payment/query",
        { paymentID: paymentId },
      );
    }
    if (
      payment.transactionStatus !== "Completed" ||
      payment.paymentID !== paymentId ||
      payment.merchantInvoiceNumber !== order.orderNumber ||
      payment.currency !== "BDT" ||
      !matchesAmount(payment.amount, order.totalAmount) ||
      typeof payment.trxID !== "string" ||
      !payment.trxID
    ) {
      return NextResponse.redirect(paymentResultUrl(orderNumber, "failed"));
    }

    const updated = await prisma.order.updateMany({
      where: {
        id: order.id,
        paymentMethod: "BKASH",
        paymentSessionId: paymentId,
        paymentStatus: "UNPAID",
        orderStatus: { not: "CANCELLED" },
      },
      data: {
        paymentStatus: "PAID",
        transactionId: payment.trxID,
      },
    });
    if (updated.count !== 1) {
      const current = await prisma.order.findUnique({
        where: { id: order.id },
        select: { paymentStatus: true, paymentSessionId: true },
      });
      if (current?.paymentStatus !== "PAID" || current.paymentSessionId !== paymentId) {
        return NextResponse.redirect(paymentResultUrl(orderNumber, "failed"));
      }
    } else {
      scheduleMetaPurchase(order.id, { includeRequestContext: false });
    }

    return NextResponse.redirect(paymentResultUrl(orderNumber, "success"));
  } catch (error) {
    console.error("GET /api/payments/bkash/callback error:", error);
    return NextResponse.redirect(paymentResultUrl(orderNumber, "failed"));
  }
}
