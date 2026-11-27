"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  MapPin,
  ShieldCheck,
  Tag,
  Truck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useSettings } from "@/context/SettingsContext";
import { validateBangladeshiPhone } from "@/lib/bd-phone";
import Ga4PurchaseEvent from "@/components/Ga4PurchaseEvent";
import MetaPurchaseEvent from "@/components/MetaPurchaseEvent";
import { trackGa4BeginCheckout } from "@/lib/ga4";
import {
  isGa4PurchaseSnapshot,
  saveGa4PurchaseSnapshot,
  type Ga4PurchaseSnapshot,
} from "@/lib/ga4-purchase-browser";
import {
  isPurchaseSnapshot,
  savePurchaseSnapshot,
  type PurchaseSnapshot,
} from "@/lib/meta-purchase-browser";

interface AppliedCoupon {
  code: string;
  discountAmount: number;
  subtotal: number;
  cartFingerprint: string;
}

interface CheckoutPaymentMethod {
  id: string;
  label: string;
  description: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCheckoutPaymentMethod(value: unknown): value is CheckoutPaymentMethod {
  return (
    isRecord(value) &&
    (value.id === "COD" || value.id === "BKASH" || value.id === "CARD") &&
    typeof value.label === "string" &&
    typeof value.description === "string"
  );
}

async function getApiError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string") return body.error;
  } catch {
    // Keep the status-based message for non-JSON responses.
  }
  return `Request failed (${response.status})`;
}

function money(value: number) {
  return `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

export default function CheckoutPage() {
  const { items, subtotal, isLoaded, clearCart } = useCart();
  const { settings } = useSettings();
  const { user } = useAuth();
  const [deliveryZone, setDeliveryZone] = useState<
    "INSIDE_DHAKA" | "OUTSIDE_DHAKA"
  >("INSIDE_DHAKA");
  const [customer, setCustomer] = useState<{
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    deliveryAddress?: string;
  }>({});
  const [honeypot, setHoneypot] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingCoupon, setIsCheckingCoupon] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [paymentMethods, setPaymentMethods] = useState<
    CheckoutPaymentMethod[]
  >([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(true);
  const [paymentMethodsError, setPaymentMethodsError] = useState<string | null>(
    null,
  );
  const [paymentStartError, setPaymentStartError] = useState<string | null>(
    null,
  );
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [purchaseSnapshot, setPurchaseSnapshot] =
    useState<PurchaseSnapshot | null>(null);
  const [ga4PurchaseSnapshot, setGa4PurchaseSnapshot] =
    useState<Ga4PurchaseSnapshot | null>(null);
  const checkoutTracked = useRef(false);
  const phoneInput = customer.customerPhone ?? user?.phone ?? "";
  const phoneValidation = phoneInput
    ? validateBangladeshiPhone(phoneInput)
    : null;

  useEffect(() => {
    if (!isLoaded || items.length === 0 || checkoutTracked.current || orderNumber) return;
    checkoutTracked.current = true;
    trackGa4BeginCheckout({
      value: subtotal,
      items: items.map((item) => ({
        item_id: item.productId,
        item_name: item.name,
        item_variant: item.variantLabel ?? item.variantInfo ?? undefined,
        price: item.price,
        quantity: item.quantity,
      })),
    });
  }, [isLoaded, items, subtotal, orderNumber]);

  useEffect(() => {
    let active = true;
    async function loadPaymentMethods() {
      try {
        const response = await fetch("/api/payments/methods", {
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (
          !response.ok ||
          !isRecord(result) ||
          !Array.isArray(result.methods) ||
          !result.methods.every(isCheckoutPaymentMethod)
        ) {
          throw new Error("Unable to load payment methods");
        }
        if (!active) return;
        const methods = result.methods;
        setPaymentMethods(methods);
        if (methods.length > 0) setPaymentMethod(methods[0].id);
      } catch (methodsError) {
        if (active) {
          setPaymentMethodsError(
            methodsError instanceof Error
              ? methodsError.message
              : "Unable to load payment methods",
          );
        }
      } finally {
        if (active) setPaymentMethodsLoading(false);
      }
    }
    void loadPaymentMethods();
    return () => {
      active = false;
    };
  }, []);
  const fingerprint = JSON.stringify(
    items.map(({ productId, variantId, quantity }) => [
      productId,
      variantId,
      quantity,
    ]),
  );
  const usableCoupon =
    appliedCoupon?.cartFingerprint === fingerprint ? appliedCoupon : null;
  const discountAmount = usableCoupon?.discountAmount ?? 0;
  const displaySubtotal = usableCoupon?.subtotal ?? subtotal;
  const deliveryCharge =
    deliveryZone === "INSIDE_DHAKA"
      ? settings.deliveryChargeInside
      : settings.deliveryChargeOutside;
  const total = Math.max(
    0,
    displaySubtotal - discountAmount + deliveryCharge,
  );

  async function applyCoupon() {
    setCouponMessage(null);
    setError(null);
    if (!couponInput.trim()) {
      setCouponMessage("Enter a coupon code.");
      return;
    }
    if (items.length === 0) {
      setCouponMessage("Add products to your cart first.");
      return;
    }

    setIsCheckingCoupon(true);
    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponInput.trim(),
          items: items.map(({ productId, variantId, quantity }) => ({
            productId,
            variantId,
            quantity,
          })),
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));

      const data: unknown = await response.json();
      if (
        !isRecord(data) ||
        typeof data.code !== "string" ||
        typeof data.discountAmount !== "number" ||
        !Number.isFinite(data.discountAmount) ||
        typeof data.subtotal !== "number" ||
        !Number.isFinite(data.subtotal)
      ) {
        throw new Error("Coupon validation returned invalid data");
      }
      setAppliedCoupon({
        code: data.code,
        discountAmount: data.discountAmount,
        subtotal: data.subtotal,
        cartFingerprint: fingerprint,
      });
      setCouponMessage(
        typeof data.message === "string"
          ? data.message
          : `Coupon ${data.code} applied.`,
      );
    } catch (couponError) {
      setAppliedCoupon(null);
      setCouponMessage(
        couponError instanceof Error
          ? couponError.message
          : "Unable to validate coupon",
      );
    } finally {
      setIsCheckingCoupon(false);
    }
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const phoneValue = formData.get("customerPhone");
    const phoneValidation =
      typeof phoneValue === "string"
        ? validateBangladeshiPhone(phoneValue)
        : { valid: false, error: "Mobile number is required." };
    if (!phoneValidation.valid) {
      setError(phoneValidation.error ?? "Enter a valid mobile number.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: formData.get("customerName"),
          customerPhone: phoneValidation.normalized,
          customerEmail: formData.get("customerEmail") || undefined,
          companyWebsite: honeypot,
          deliveryAddress: formData.get("deliveryAddress"),
          deliveryZone,
          paymentMethod,
          couponCode: usableCoupon?.code,
          items: items.map(({ productId, variantId, quantity }) => ({
            productId,
            variantId,
            quantity,
          })),
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));

      const result: unknown = await response.json();
      if (!isRecord(result) || typeof result.orderNumber !== "string") {
        throw new Error("Order endpoint returned invalid data");
      }
      if (isPurchaseSnapshot(result)) {
        setPurchaseSnapshot(result);
        if (paymentMethod !== "COD") savePurchaseSnapshot(result);
      } else {
        console.error("Order endpoint returned invalid purchase tracking data");
      }
      if (isGa4PurchaseSnapshot(result)) {
        setGa4PurchaseSnapshot(result);
        if (paymentMethod !== "COD") saveGa4PurchaseSnapshot(result);
      } else {
        console.error("Order endpoint returned invalid GA4 purchase tracking data");
      }
      setOrderNumber(result.orderNumber);
      clearCart();
      setAppliedCoupon(null);
      if (paymentMethod !== "COD") {
        const paymentResponse = await fetch("/api/payments/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderNumber: result.orderNumber }),
        });
        const paymentResult: unknown = await paymentResponse.json();
        if (
          !paymentResponse.ok ||
          !isRecord(paymentResult) ||
          typeof paymentResult.checkoutUrl !== "string"
        ) {
          throw new Error(
            isRecord(paymentResult) && typeof paymentResult.error === "string"
              ? paymentResult.error
              : "Order was created, but payment could not be started.",
          );
        }
        window.location.assign(paymentResult.checkoutUrl);
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to place order";
      if (orderNumber || paymentMethod !== "COD") {
        setPaymentStartError(message);
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoaded) {
    return <div className="py-20 text-center text-gray-500">Loading cart...</div>;
  }

  if (orderNumber) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        {paymentMethod === "COD" && purchaseSnapshot && (
          <MetaPurchaseEvent orderNumber={orderNumber} snapshot={purchaseSnapshot} />
        )}
        {paymentMethod === "COD" && ga4PurchaseSnapshot && (
          <Ga4PurchaseEvent orderNumber={orderNumber} snapshot={ga4PurchaseSnapshot} />
        )}
        <div className="rounded-2xl border bg-white p-8 shadow-sm">
          {paymentMethod === "COD" ? (
            <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
          ) : (
            <CreditCard className="mx-auto h-14 w-14 text-amber-600" />
          )}
          <h1 className="mt-4 text-2xl font-extrabold text-gray-900">
            {paymentMethod === "COD"
              ? "Order confirmed!"
              : "Complete your payment"}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {paymentMethod === "COD"
              ? `Thank you for shopping with ${settings.storeName}. Your tracking ID is:`
              : "Your order is reserved. Payment must be confirmed before it can be processed."}
          </p>
          <div className="my-4 rounded-lg bg-gray-100 py-3 font-mono text-lg font-bold text-gray-900">
            {orderNumber}
          </div>
          {paymentStartError && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {paymentStartError}
            </p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            {paymentMethod !== "COD" && (
              <Link
                href={`/checkout/payment-result?order=${encodeURIComponent(
                  orderNumber,
                )}&provider=${encodeURIComponent(paymentMethod.toLowerCase())}`}
                style={{ backgroundColor: settings.primaryColor }}
                className="rounded-lg px-5 py-2.5 text-sm font-bold text-white"
              >
                Continue to payment
              </Link>
            )}
            <Link
              href={`/track-order?order=${encodeURIComponent(orderNumber)}`}
              className="rounded-lg border px-5 py-2.5 text-sm font-semibold text-gray-700"
            >
              Track order
            </Link>
            <Link
              href="/products"
              className="rounded-lg border px-5 py-2.5 text-sm font-semibold text-gray-700"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="rounded-2xl border bg-white p-8 shadow-sm">
          <h1 className="text-xl font-extrabold text-gray-900">
            No items in your cart to checkout
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Add products to your cart before completing checkout.
          </p>
          <Link
            href="/products"
            style={{ backgroundColor: settings.primaryColor }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white"
          >
            Browse Products <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-black"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Shopping Cart</span>
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold text-gray-900 sm:text-3xl">
          Checkout &amp; Order Confirmation
        </h1>
      </div>

      <form
        onSubmit={submitOrder}
        className="grid grid-cols-1 gap-8 lg:grid-cols-3"
      >
        <label
          aria-hidden="true"
          className="absolute -left-[9999px] h-px w-px overflow-hidden"
        >
          Website
          <input
            type="text"
            name="companyWebsite"
            autoComplete="off"
            tabIndex={-1}
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
        </label>
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 border-b pb-3">
              <MapPin
                style={{ color: settings.primaryColor }}
                className="h-5 w-5"
              />
              <h2 className="text-lg font-bold text-gray-900">
                1. Shipping Details
              </h2>
            </div>

            {error && (
              <p
                role="alert"
                className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700"
              >
                {error}
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-gray-700">
                Full Name *
                <input
                  name="customerName"
                  type="text"
                  required
                  autoComplete="name"
                  maxLength={120}
                  placeholder="Enter your full name"
                  value={customer.customerName ?? user?.name ?? ""}
                  onChange={(event) =>
                    setCustomer({ ...customer, customerName: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border p-2.5 text-sm font-normal"
                />
              </label>
              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="customer-phone"
                    className="block text-xs font-bold text-gray-700"
                  >
                    Bangladeshi Mobile Number (11 Digits) *
                  </label>
                  {phoneValidation?.valid && phoneValidation.operator && (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                      Valid ({phoneValidation.operator})
                    </span>
                  )}
                </div>
                <input
                  id="customer-phone"
                  name="customerPhone"
                  type="tel"
                  required
                  autoComplete="tel"
                  maxLength={14}
                  aria-invalid={phoneValidation ? !phoneValidation.valid : false}
                  placeholder="017XXXXXXXX"
                  value={phoneInput}
                  onChange={(event) =>
                    setCustomer({ ...customer, customerPhone: event.target.value })
                  }
                  className={`mt-1 w-full rounded-xl border p-2.5 text-sm font-normal ${
                    phoneValidation && !phoneValidation.valid
                      ? "border-red-400 bg-red-50/40"
                      : ""
                  }`}
                />
                {phoneValidation && !phoneValidation.valid && (
                  <p className="mt-1 text-[11px] font-semibold text-red-600">
                    {phoneValidation.error}
                  </p>
                )}
              </div>
              <label className="text-xs font-bold text-gray-700 sm:col-span-2">
                Email Address (Optional)
                <input
                  name="customerEmail"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="you@example.com"
                  value={customer.customerEmail ?? user?.email ?? ""}
                  onChange={(event) =>
                    setCustomer({ ...customer, customerEmail: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border p-2.5 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-gray-700 sm:col-span-2">
                Full Delivery Address *
                <textarea
                  name="deliveryAddress"
                  rows={3}
                  required
                  autoComplete="street-address"
                  maxLength={1000}
                  placeholder="House/Flat No, Road, Area, Thana, District..."
                  value={customer.deliveryAddress ?? user?.address ?? ""}
                  onChange={(event) =>
                    setCustomer({
                      ...customer,
                      deliveryAddress: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-xl border p-2.5 text-sm font-normal"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 border-b pb-3">
              <Truck
                style={{ color: settings.primaryColor }}
                className="h-5 w-5"
              />
              <h2 className="text-lg font-bold text-gray-900">
                2. Delivery Location
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  [
                    "INSIDE_DHAKA",
                    "Inside Dhaka City",
                    "Estimated delivery: 24–48 hours",
                    settings.deliveryChargeInside,
                  ],
                  [
                    "OUTSIDE_DHAKA",
                    "Outside Dhaka (All Bangladesh)",
                    "Estimated delivery: 2–4 business days",
                    settings.deliveryChargeOutside,
                  ],
                ] as const
              ).map(([zone, title, eta, fee]) => (
                <button
                  key={zone}
                  type="button"
                  aria-pressed={deliveryZone === zone}
                  onClick={() => setDeliveryZone(zone)}
                  style={
                    deliveryZone === zone
                      ? { borderColor: settings.primaryColor }
                      : {}
                  }
                  className={`flex items-center justify-between rounded-xl border-2 p-4 text-left transition ${
                    deliveryZone === zone
                      ? "bg-gray-50 shadow-sm"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-extrabold text-gray-900">
                      {title}
                    </span>
                    <span className="text-xs text-gray-500">{eta}</span>
                  </span>
                  <span
                    style={{ color: settings.primaryColor }}
                    className="text-base font-extrabold"
                  >
                    {money(fee)}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 border-b pb-3">
              <CreditCard
                style={{ color: settings.primaryColor }}
                className="h-5 w-5"
              />
              <h2 className="text-lg font-bold text-gray-900">
                3. Payment Method
              </h2>
            </div>
            {paymentMethodsError && (
              <p
                role="alert"
                className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {paymentMethodsError}
              </p>
            )}
            {paymentMethodsLoading ? (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                Loading available payment methods...
              </p>
            ) : paymentMethods.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                No payment methods are currently available.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {paymentMethods.map(({ id, label, description }) => {
                const selected = paymentMethod === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPaymentMethod(id)}
                    style={
                      selected
                        ? {
                            borderColor: settings.primaryColor,
                            backgroundColor: settings.primaryColor,
                            color: "#ffffff",
                          }
                        : {}
                    }
                    className={`rounded-xl border p-3.5 text-left transition ${
                      selected
                        ? "shadow-md"
                        : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                    }`}
                  >
                    <span className="block text-sm font-extrabold">{label}</span>
                    <span
                      className={`mt-1 block text-[11px] ${
                        selected ? "text-white/85" : "text-gray-500"
                      }`}
                    >
                      {description}
                    </span>
                  </button>
                );
              })}
              </div>
            )}
          </section>
        </div>

        <aside className="h-fit space-y-5 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-lg font-extrabold text-gray-900">Your Order</h2>
            <Link
              href="/cart"
              className="text-xs font-bold text-gray-500 hover:underline"
            >
              Edit Cart
            </Link>
          </div>

          <div className="max-h-64 space-y-3 overflow-y-auto border-b pb-4">
            {items.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Image
                    src={item.image}
                    alt={item.name}
                    width={44}
                    height={44}
                    unoptimized
                    className="h-11 w-11 shrink-0 rounded-lg border object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-gray-900">
                      {item.name}
                    </p>
                    {(item.variantLabel || item.variantInfo) && (
                      <p className="truncate text-gray-400">
                        {item.variantLabel || item.variantInfo}
                      </p>
                    )}
                    <p className="text-gray-500">Qty: {item.quantity}</p>
                  </div>
                </div>
                <span className="shrink-0 font-extrabold text-gray-900">
                  {money(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-b pb-4">
            <label
              htmlFor="coupon-code"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-gray-700"
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Promo / Discount Code</span>
            </label>
            <div className="flex gap-2">
              <input
                id="coupon-code"
                type="text"
                placeholder="e.g., SAVE15"
                value={couponInput}
                maxLength={40}
                onChange={(event) => {
                  setCouponInput(event.target.value);
                  setAppliedCoupon(null);
                  setCouponMessage(null);
                }}
                className="w-full min-w-0 rounded-lg border p-2 text-xs font-semibold uppercase"
              />
              <button
                type="button"
                disabled={isCheckingCoupon || isSubmitting}
                onClick={applyCoupon}
                className="rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {isCheckingCoupon ? "Checking..." : "Apply"}
              </button>
            </div>
            {couponMessage && (
              <p
                role="status"
                className={`mt-1.5 text-xs ${
                  usableCoupon ? "font-bold text-green-700" : "text-red-600"
                }`}
              >
                {couponMessage}
              </p>
            )}
            {appliedCoupon && !usableCoupon && (
              <p role="status" className="mt-1.5 text-xs text-amber-700">
                Cart changed. Reapply the coupon to update your discount.
              </p>
            )}
          </div>

          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-semibold text-gray-900">
                {money(displaySubtotal)}
              </span>
            </div>
            {usableCoupon && (
              <div className="flex justify-between font-bold text-green-700">
                <span>Discount ({usableCoupon.code})</span>
                <span>-{money(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>
                Delivery (
                {deliveryZone === "INSIDE_DHAKA"
                  ? "Inside Dhaka"
                  : "Outside Dhaka"}
                )
              </span>
              <span className="font-semibold text-gray-900">
                {money(deliveryCharge)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-3 text-base font-extrabold text-gray-900">
              <span>Total Payable</span>
              <span style={{ color: settings.primaryColor }}>{money(total)}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={
              isSubmitting ||
              items.length === 0 ||
              paymentMethodsLoading ||
              paymentMethods.length === 0
            }
            style={{ backgroundColor: settings.primaryColor }}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Submitting Order..." : `Place Order • ${money(total)}`}
            {!isSubmitting && <ArrowRight className="h-4 w-4" />}
          </button>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Prices, coupons, and inventory are verified at checkout</span>
          </div>
        </aside>
      </form>
    </div>
  );
}
