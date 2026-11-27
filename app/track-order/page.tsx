"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  PackageCheck,
  Search,
  Truck,
  XCircle,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

interface TrackedOrderItem {
  quantity: number;
  price: number;
  variantInfo: string | null;
  product: { name: string; image: string };
}

interface TrackedOrder {
  orderNumber: string;
  customerName: string;
  deliveryAddress: string;
  deliveryZone: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: number;
  discountAmount: number;
  couponCode: string | null;
  deliveryCharge: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  items: TrackedOrderItem[];
}

interface TrackingCredentials {
  orderNumber: string;
  phone: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrackedOrder(value: unknown): value is TrackedOrder {
  return (
    isRecord(value) &&
    typeof value.orderNumber === "string" &&
    typeof value.customerName === "string" &&
    typeof value.deliveryAddress === "string" &&
    typeof value.deliveryZone === "string" &&
    typeof value.orderStatus === "string" &&
    typeof value.paymentStatus === "string" &&
    typeof value.paymentMethod === "string" &&
    typeof value.subtotal === "number" &&
    typeof value.discountAmount === "number" &&
    (typeof value.couponCode === "string" || value.couponCode === null) &&
    typeof value.deliveryCharge === "number" &&
    typeof value.totalAmount === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.quantity === "number" &&
        typeof item.price === "number" &&
        (typeof item.variantInfo === "string" || item.variantInfo === null) &&
        isRecord(item.product) &&
        typeof item.product.name === "string" &&
        typeof item.product.image === "string",
    )
  );
}

async function fetchTrackedOrder(credentials: TrackingCredentials) {
  const response = await fetch(
    `/api/orders/${encodeURIComponent(credentials.orderNumber)}?phone=${encodeURIComponent(credentials.phone)}`,
    { cache: "no-store" },
  );
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : `Unable to find order (${response.status})`,
    );
  }
  if (!isTrackedOrder(data)) {
    throw new Error("Order tracking endpoint returned invalid data");
  }
  return data;
}

function money(value: number) {
  return `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

const orderSteps = [
  { key: "PENDING", label: "Order Placed", icon: Clock },
  { key: "CONFIRMED", label: "Confirmed", icon: PackageCheck },
  { key: "SHIPPED", label: "Shipped", icon: Truck },
  { key: "DELIVERED", label: "Delivered", icon: CheckCircle2 },
];

function TrackOrderContent() {
  const { settings } = useSettings();
  const searchParams = useSearchParams();
  const initialOrderNumber = searchParams.get("order") ?? "";
  const [credentials, setCredentials] = useState<TrackingCredentials | null>(
    null,
  );
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [orderNumberInput, setOrderNumberInput] = useState(initialOrderNumber);
  const [phoneInput, setPhoneInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function loadOrder(nextCredentials: TrackingCredentials) {
    const data = await fetchTrackedOrder(nextCredentials);
    setOrder(data);
    setLastUpdated(new Date());
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCredentials = {
      orderNumber: orderNumberInput.trim(),
      phone: phoneInput.trim(),
    };
    if (!nextCredentials.orderNumber || !nextCredentials.phone) {
      setError("Enter both the order number and checkout phone number.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await loadOrder(nextCredentials);
      setCredentials(nextCredentials);
    } catch (loadError) {
      setOrder(null);
      setCredentials(null);
      setError(
        loadError instanceof Error ? loadError.message : "Unable to track order",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!credentials) return;
    const activeCredentials = credentials;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function refreshOrder() {
      try {
        const data = await fetchTrackedOrder(activeCredentials);
        if (active) {
          setOrder(data);
          setLastUpdated(new Date());
          setError(null);
        }
      } catch (refreshError) {
        if (active) {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : "Unable to refresh order status",
          );
        }
      } finally {
        if (active) timer = setTimeout(refreshOrder, 15000);
      }
    }

    timer = setTimeout(refreshOrder, 15000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [credentials]);

  const currentStep = order
    ? orderSteps.findIndex((step) => step.key === order.orderStatus)
    : -1;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
          Track Your Order
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Enter your order number and the phone number used at checkout.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row"
      >
        <label className="relative flex-1">
          <span className="sr-only">Order number</span>
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
          <input
            type="text"
            required
            aria-label="Order number"
            placeholder="Order number (e.g., ORD-123456-AB)"
            value={orderNumberInput}
            onChange={(event) => setOrderNumberInput(event.target.value)}
            autoComplete="off"
            className="w-full rounded-xl border py-2.5 pl-10 pr-4 font-mono text-sm uppercase"
          />
        </label>
        <label className="flex-1">
          <span className="sr-only">Checkout phone number</span>
          <input
            type="tel"
            required
            aria-label="Checkout phone number"
            placeholder="Phone number used at checkout"
            value={phoneInput}
            onChange={(event) => setPhoneInput(event.target.value)}
            autoComplete="tel"
            className="w-full rounded-xl border px-4 py-2.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={isLoading}
          style={{ backgroundColor: settings.primaryColor }}
          className="rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow transition hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? "Searching..." : "Track Now"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm font-semibold text-red-700"
        >
          {error}
        </div>
      )}

      {order && (
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-gray-50 px-6 py-4">
            <div>
              <div className="font-mono text-lg font-extrabold text-gray-900">
                {order.orderNumber}
              </div>
              <div className="text-xs text-gray-500">
                Customer: {order.customerName} ·{" "}
                {order.deliveryZone === "INSIDE_DHAKA"
                  ? "Inside Dhaka"
                  : "Outside Dhaka"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Total Payable</div>
              <div
                style={{ color: settings.primaryColor }}
                className="text-lg font-extrabold"
              >
                {money(order.totalAmount)} ({order.paymentStatus})
              </div>
              <div className="text-xs text-gray-500">{order.paymentMethod}</div>
            </div>
          </div>

          <div className="border-b px-6 py-6">
            {order.orderStatus === "CANCELLED" ? (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-bold text-red-700">
                <XCircle className="h-5 w-5 shrink-0" />
                <span>Order Cancelled</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {orderSteps.map((step, index) => {
                  const Icon = step.icon;
                  const completed = index <= currentStep;
                  const isCurrent = index === currentStep;
                  return (
                    <div key={step.key} className="flex items-center gap-2.5">
                      <div
                        style={
                          completed
                            ? {
                                backgroundColor: settings.primaryColor,
                                color: "#ffffff",
                              }
                            : {}
                        }
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          completed ? "shadow-sm" : "bg-gray-100 text-gray-400"
                        } ${isCurrent ? "ring-4 ring-black/10" : ""}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span
                        className={`text-xs font-bold ${
                          completed ? "text-gray-900" : "text-gray-400"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {lastUpdated && (
              <p className="mt-4 text-right text-xs text-gray-400">
                Auto-refreshes every 15 seconds · Updated{" "}
                {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 px-6 py-5 md:grid-cols-3">
            <div className="space-y-2.5 text-xs md:col-span-2">
              <div className="font-bold uppercase text-gray-400">
                Package Contents
              </div>
              {order.items.map((item, index) => (
                <div
                  key={`${item.product.name}-${index}`}
                  className="flex items-center justify-between gap-3 border-b pb-2 last:border-b-0"
                >
                  <div>
                    <p className="font-semibold text-gray-800">
                      {item.quantity}× {item.product.name}
                    </p>
                    {item.variantInfo && (
                      <p className="text-gray-500">{item.variantInfo}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-bold">
                    {money(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-gray-50 p-4 text-xs">
              <div className="font-bold uppercase text-gray-400">
                Delivery Details
              </div>
              <p className="mt-1.5 font-semibold text-gray-900">
                {order.deliveryAddress}
              </p>
              <dl className="mt-4 space-y-2 border-t pt-3">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>{money(order.subtotal)}</dd>
                </div>
                {order.discountAmount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <dt>
                      Discount
                      {order.couponCode ? ` (${order.couponCode})` : ""}
                    </dt>
                    <dd>-{money(order.discountAmount)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>Delivery Fee</dt>
                  <dd>{money(order.deliveryCharge)}</dd>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold">
                  <dt>Total</dt>
                  <dd>{money(order.totalAmount)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-gray-500">
          Loading order tracker...
        </div>
      }
    >
      <TrackOrderContent />
    </Suspense>
  );
}
