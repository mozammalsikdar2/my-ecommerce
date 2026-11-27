"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import Ga4PurchaseEvent from "@/components/Ga4PurchaseEvent";
import MetaPurchaseEvent from "@/components/MetaPurchaseEvent";

interface PaymentStatus {
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function PaymentResultContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("order") ?? "";
  const provider = searchParams.get("provider") ?? "";
  const sessionId = searchParams.get("session_id") ?? "";
  const callbackStatus = searchParams.get("status") ?? "";
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function verifyPayment() {
      try {
        if (!orderNumber) throw new Error("Order number is missing.");

        let verificationWarning: string | null = null;
        if (provider === "stripe" && sessionId) {
          try {
            const response = await fetch(
              `/api/payments/stripe/verify?order=${encodeURIComponent(
                orderNumber,
              )}&session_id=${encodeURIComponent(sessionId)}`,
              { cache: "no-store" },
            );
            const result: unknown = await response.json();
            if (
              !response.ok &&
              (!isRecord(result) || result.status !== "PENDING")
            ) {
              verificationWarning =
                isRecord(result) && typeof result.error === "string"
                  ? result.error
                  : "Payment verification failed.";
            }
          } catch {
            verificationWarning =
              "Payment verification is temporarily unavailable.";
          }
        }

        const statusResponse = await fetch(
          `/api/payments/status?order=${encodeURIComponent(orderNumber)}`,
          { cache: "no-store" },
        );
        const statusResult: unknown = await statusResponse.json();
        if (!statusResponse.ok || !isRecord(statusResult)) {
          throw new Error(
            isRecord(statusResult) && typeof statusResult.error === "string"
              ? statusResult.error
              : "Unable to load payment status.",
          );
        }
        if (
          typeof statusResult.paymentMethod !== "string" ||
          typeof statusResult.paymentStatus !== "string" ||
          typeof statusResult.orderStatus !== "string"
        ) {
          throw new Error("Payment status response is invalid.");
        }
        if (active) {
          setPayment({
            paymentMethod: statusResult.paymentMethod,
            paymentStatus: statusResult.paymentStatus,
            orderStatus: statusResult.orderStatus,
          });
          setError(
            statusResult.paymentStatus === "PAID" ? null : verificationWarning,
          );
        }
      } catch (verificationError) {
        if (active) {
          setError(
            verificationError instanceof Error
              ? verificationError.message
              : "Unable to verify payment.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void verifyPayment();
    return () => {
      active = false;
    };
  }, [orderNumber, provider, sessionId]);

  async function retryPayment() {
    if (!orderNumber) return;
    setRetrying(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        !isRecord(result) ||
        typeof result.checkoutUrl !== "string"
      ) {
        throw new Error(
          isRecord(result) && typeof result.error === "string"
            ? result.error
            : "Unable to retry payment.",
        );
      }
      window.location.assign(result.checkoutUrl);
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : "Unable to retry payment.",
      );
    } finally {
      setRetrying(false);
    }
  }

  const paid = payment?.paymentStatus === "PAID";
  const cancelled = payment?.orderStatus === "CANCELLED";

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      {paid && !cancelled && orderNumber && (
        <>
          <MetaPurchaseEvent orderNumber={orderNumber} />
          <Ga4PurchaseEvent orderNumber={orderNumber} />
        </>
      )}
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        {loading ? (
          <>
            <LoaderCircle className="mx-auto h-12 w-12 animate-spin text-teal-700" />
            <h1 className="mt-4 text-xl font-bold text-slate-900">
              Verifying your payment
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Please keep this page open while we confirm with the provider.
            </p>
          </>
        ) : paid && !cancelled ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
              Payment confirmed
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Your order {orderNumber} is paid and being processed.
            </p>
          </>
        ) : (
          <>
            <CircleAlert className="mx-auto h-12 w-12 text-amber-600" />
            <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
              {cancelled
                ? "This order was cancelled"
                : callbackStatus === "cancelled"
                  ? "Payment was not completed"
                  : "Payment is not confirmed yet"}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {cancelled
                ? "Contact support if you believe this is a mistake."
                : "Your order remains unpaid. You can try the payment again."}
            </p>
          </>
        )}

        {orderNumber && (
          <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
            {orderNumber}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {!loading &&
          !paid &&
          !cancelled &&
          payment &&
          (payment.paymentMethod === "CARD" ||
            payment.paymentMethod === "BKASH") && (
          <button
            type="button"
            onClick={() => void retryPayment()}
            disabled={retrying}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-teal-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`}
            />
            {retrying ? "Preparing payment..." : "Retry payment"}
          </button>
        )}
        <div className="mt-6 flex justify-center gap-3">
          {orderNumber && (
            <Link
              href={`/track-order?order=${encodeURIComponent(orderNumber)}`}
              className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Track order
            </Link>
          )}
          <Link
            href="/"
            className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Store home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-slate-500">
          Loading payment result...
        </div>
      }
    >
      <PaymentResultContent />
    </Suspense>
  );
}
