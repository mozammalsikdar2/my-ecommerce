"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  variantInfo: string | null;
  product: { name: string };
}

interface OrderRecord {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  deliveryAddress: string;
  deliveryZone: string;
  subtotal: number;
  discountAmount: number;
  couponCode: string | null;
  deliveryCharge: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  courierProvider: string | null;
  consignmentId: string | null;
  trackingCode: string | null;
  courierStatus: string | null;
  createdAt: string;
  items: OrderItem[];
}

interface OrderStats {
  totalOrders: number;
  pendingOrders: number;
  confirmedOrders: number;
  totalRevenue: number;
}

const allowedTransitions: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: ["PENDING"],
};

const statusTabs = [
  "ALL",
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
] as const;

type OrderStatusFilter = (typeof statusTabs)[number];

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  CONFIRMED: "bg-blue-100 text-blue-800 border-blue-200",
  SHIPPED: "bg-purple-100 text-purple-800 border-purple-200",
  DELIVERED: "bg-green-100 text-green-800 border-green-200",
  RETURNED: "bg-orange-100 text-orange-800 border-orange-200",
  CANCELLED: "bg-red-100 text-red-800 border-red-200",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOrder(value: unknown): value is OrderRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.orderNumber === "string" &&
    typeof value.customerName === "string" &&
    typeof value.customerPhone === "string" &&
    (typeof value.customerEmail === "string" || value.customerEmail === null) &&
    typeof value.deliveryAddress === "string" &&
    typeof value.deliveryZone === "string" &&
    typeof value.subtotal === "number" &&
    typeof value.discountAmount === "number" &&
    (typeof value.couponCode === "string" || value.couponCode === null) &&
    typeof value.deliveryCharge === "number" &&
    typeof value.totalAmount === "number" &&
    typeof value.paymentMethod === "string" &&
    typeof value.paymentStatus === "string" &&
    typeof value.orderStatus === "string" &&
    (value.courierProvider === null ||
      value.courierProvider === "STEADFAST" ||
      value.courierProvider === "PATHAO") &&
    (typeof value.consignmentId === "string" || value.consignmentId === null) &&
    (typeof value.trackingCode === "string" || value.trackingCode === null) &&
    (typeof value.courierStatus === "string" || value.courierStatus === null) &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.quantity === "number" &&
        typeof item.price === "number" &&
        (typeof item.variantInfo === "string" || item.variantInfo === null) &&
        isRecord(item.product) &&
        typeof item.product.name === "string",
    )
  );
}

function isOrderStats(value: unknown): value is OrderStats {
  return (
    isRecord(value) &&
    typeof value.totalOrders === "number" &&
    typeof value.pendingOrders === "number" &&
    typeof value.confirmedOrders === "number" &&
    typeof value.totalRevenue === "number"
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

export default function AdminOrdersPage() {
  const { settings } = useSettings();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] =
    useState<OrderStatusFilter>("ALL");
  const filteredOrders =
    selectedStatus === "ALL"
      ? orders
      : orders.filter((order) => order.orderStatus === selectedStatus);

  useEffect(() => {
    const controller = new AbortController();
    async function loadOrders() {
      try {
        const response = await fetch("/api/orders", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await getApiError(response));
        const data: unknown = await response.json();
        if (
          !isRecord(data) ||
          !Array.isArray(data.orders) ||
          !data.orders.every(isOrder) ||
          !isOrderStats(data.stats)
        ) {
          throw new Error("Orders API returned invalid data");
        }
        setOrders(data.orders);
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load orders",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    void loadOrders();
    return () => controller.abort();
  }, [refreshKey]);

  async function handleCourierDispatch(
    orderId: string,
    courier: "STEADFAST" | "PATHAO",
  ) {
    setPendingId(orderId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/logistics/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, courier }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : `Request failed (${response.status})`,
        );
      }
      if (!isRecord(data) || typeof data.message !== "string") {
        throw new Error("Courier dispatch response is invalid");
      }
      setMessage(data.message);
      setRefreshKey((current) => current + 1);
    } catch (dispatchError) {
      setError(
        dispatchError instanceof Error
          ? dispatchError.message
          : "Failed to book courier parcel",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleSyncCourierStatus(orderId: string) {
    setPendingId(orderId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/logistics/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : `Request failed (${response.status})`,
        );
      }
      if (!isRecord(data) || typeof data.courierStatus !== "string") {
        throw new Error("Courier sync response is invalid");
      }
      setMessage(`Courier status updated: ${data.courierStatus}`);
      setRefreshKey((current) => current + 1);
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Failed to sync courier status",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function updateOrder(
    order: OrderRecord,
    change: {
      orderStatus?: string;
      paymentStatus?: string;
      courierProvider?: string | null;
      consignmentId?: string | null;
      trackingCode?: string | null;
    },
  ) {
    if (
      change.orderStatus === "CANCELLED" &&
      !window.confirm(
        `Cancel ${order.orderNumber}? Its reserved inventory will be restored.`,
      )
    ) {
      return;
    }
    if (
      order.orderStatus === "CANCELLED" &&
      change.orderStatus === "PENDING" &&
      !window.confirm(
        `Reopen ${order.orderNumber}? Inventory will be reserved again.`,
      )
    ) {
      return;
    }

    setPendingId(order.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const data: unknown = await response.json();
      if (!isOrder(data)) throw new Error("Orders API returned invalid data");
      setOrders((current) =>
        current.map((item) => (item.id === order.id ? data : item)),
      );
      setMessage(`Order ${order.orderNumber} updated.`);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update order",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleBlockCustomerPhone(order: OrderRecord) {
    if (
      !window.confirm(
        `Block ${order.customerPhone} from placing future orders and cancel any pending orders from this number?`,
      )
    ) {
      return;
    }

    setPendingId(order.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: order.customerPhone,
          orderNumber: order.orderNumber,
          reason: `Fake order reported on ${order.orderNumber}`,
          cancelPendingOrders: true,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : `Request failed (${response.status})`,
        );
      }
      if (!isRecord(data) || typeof data.message !== "string") {
        throw new Error("Security API returned an invalid response");
      }

      setMessage(data.message);
      setRefreshKey((current) => current + 1);
    } catch (blockError) {
      setError(
        blockError instanceof Error
          ? blockError.message
          : "Failed to block phone number",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <Link
        href="/admin/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-black"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin Settings
      </Link>
      <div className="mb-6 flex items-center gap-2">
        <ShoppingBag
          className="h-6 w-6"
          style={{ color: settings.primaryColor }}
        />
        <h1 className="text-2xl font-bold text-gray-900">
          Customer Orders ({orders.length})
        </h1>
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {message}
        </p>
      )}

      <div
        role="group"
        aria-label="Filter orders by status"
        className="mb-5 flex flex-wrap gap-2"
      >
        {statusTabs.map((status) => {
          const isSelected = selectedStatus === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedStatus(status)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                isSelected
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {status}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
            Loading orders...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
            {orders.length === 0
              ? "No orders have been placed yet."
              : `No ${selectedStatus.toLowerCase()} orders found.`}
          </div>
        ) : (
          filteredOrders.map((order) => {
            const transitions = allowedTransitions[order.orderStatus] ?? [];
            return (
              <article
                key={order.id}
                className="rounded-xl border bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold">{order.orderNumber}</h2>
                    <span
                      className={`rounded border px-2 py-0.5 text-xs font-bold ${
                        statusColors[order.orderStatus] ??
                        "border-gray-200 bg-gray-100 text-gray-700"
                      }`}
                    >
                      {order.orderStatus}
                    </span>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                      {order.deliveryZone === "INSIDE_DHAKA"
                        ? "Inside Dhaka"
                        : "Outside Dhaka"}
                    </span>
                    {order.couponCode && (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                        Coupon: {order.couponCode} (-{money(order.discountAmount)})
                      </span>
                    )}
                    <p className="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="text-xs font-semibold text-gray-600">
                      Order status
                      <select
                        value={order.orderStatus}
                        disabled={pendingId === order.id}
                        onChange={(event) =>
                          updateOrder(order, { orderStatus: event.target.value })
                        }
                        className="mt-1 block rounded border px-2 py-1.5 text-sm text-gray-900"
                      >
                        <option value={order.orderStatus}>
                          {order.orderStatus}
                        </option>
                        {transitions
                          .filter((status) => status !== order.orderStatus)
                          .map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-gray-600">
                      Payment
                      <select
                        value={order.paymentStatus}
                        disabled={pendingId === order.id}
                        onChange={(event) =>
                          updateOrder(order, {
                            paymentStatus: event.target.value,
                          })
                        }
                        className="mt-1 block rounded border px-2 py-1.5 text-sm text-gray-900"
                      >
                        <option value="UNPAID">
                          UNPAID ({order.paymentMethod})
                        </option>
                        <option value="PAID">PAID ({order.paymentMethod})</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t py-3">
                  {order.consignmentId ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-gray-50 px-2.5 py-1.5 text-xs">
                        <span className="font-bold text-gray-800">
                          {order.courierProvider ?? "Courier"}:{" "}
                          {order.trackingCode ?? order.consignmentId}
                        </span>
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                          {order.courierStatus ?? "Status unavailable"}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={
                          pendingId === order.id ||
                          !order.courierProvider ||
                          (order.orderStatus !== "SHIPPED" &&
                            order.orderStatus !== "DELIVERED")
                        }
                        onClick={() => void handleSyncCourierStatus(order.id)}
                        className="rounded-lg border px-3 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                      >
                        {pendingId === order.id ? "Syncing..." : "Sync courier"}
                      </button>
                    </>
                  ) : order.orderStatus === "CONFIRMED" &&
                    !order.trackingCode ? (
                    <>
                      <button
                        type="button"
                        disabled={pendingId === order.id}
                        onClick={() =>
                          void handleCourierDispatch(order.id, "STEADFAST")
                        }
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {pendingId === order.id
                          ? "Booking..."
                          : "Send to Steadfast"}
                      </button>
                      <button
                        type="button"
                        disabled={pendingId === order.id}
                        onClick={() =>
                          void handleCourierDispatch(order.id, "PATHAO")
                        }
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {pendingId === order.id ? "Booking..." : "Send to Pathao"}
                      </button>
                    </>
                  ) : order.trackingCode ? (
                    <span className="rounded-lg border bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700">
                      Tracking code: {order.trackingCode}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      Confirm this order before dispatching it.
                    </span>
                  )}
                </div>

                <div className="grid gap-5 py-4 md:grid-cols-[1fr_1.2fr_auto]">
                  <div className="text-sm">
                    <p className="font-bold">{order.customerName}</p>
                    <p>{order.customerPhone}</p>
                    <button
                      type="button"
                      disabled={pendingId === order.id}
                      onClick={() => void handleBlockCustomerPhone(order)}
                      className="mt-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {pendingId === order.id ? "Blocking..." : "Block Number"}
                    </button>
                    {order.customerEmail && (
                      <p className="text-gray-500">{order.customerEmail}</p>
                    )}
                    <p className="mt-2 text-gray-600">
                      {order.deliveryAddress}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {order.deliveryZone.replaceAll("_", " ")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {order.items.map((item) => (
                      <div key={item.id} className="text-sm">
                        <span className="font-medium">{item.product.name}</span>
                        {item.variantInfo && (
                          <span className="text-gray-500">
                            {" "}
                            · {item.variantInfo}
                          </span>
                        )}
                        <span className="text-gray-500">
                          {" "}
                          × {item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>

                  <dl className="space-y-1 text-sm md:text-right">
                    <div className="flex justify-between gap-5 md:justify-end">
                      <dt>Subtotal</dt>
                      <dd>{money(order.subtotal)}</dd>
                    </div>
                    {order.discountAmount > 0 && (
                      <div className="flex justify-between gap-5 text-green-700 md:justify-end">
                        <dt>
                          Discount
                          {order.couponCode ? ` (${order.couponCode})` : ""}
                        </dt>
                        <dd>-{money(order.discountAmount)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-5 md:justify-end">
                      <dt>Delivery</dt>
                      <dd>{money(order.deliveryCharge)}</dd>
                    </div>
                    <div
                      className="flex justify-between gap-5 border-t pt-1 font-bold md:justify-end"
                      style={{ color: settings.primaryColor }}
                    >
                      <dt>Total</dt>
                      <dd>{money(order.totalAmount)}</dd>
                    </div>
                    <p className="pt-1 text-xs text-gray-500">
                      {order.paymentMethod} · {order.paymentStatus}
                    </p>
                  </dl>
                </div>

                <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
                  <label className="text-xs font-semibold text-gray-600">
                    Courier
                    <select
                      value={order.courierProvider ?? ""}
                      disabled={pendingId === order.id}
                      onChange={(event) =>
                        void updateOrder(order, {
                          courierProvider: event.target.value || null,
                        })
                      }
                      className="mt-1 block w-full rounded border bg-white px-2 py-2 text-sm text-gray-900"
                    >
                      <option value="">Not selected</option>
                      <option value="STEADFAST">Steadfast</option>
                      <option value="PATHAO">Pathao</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-gray-600">
                    Consignment ID
                    <input
                      key={`${order.id}-consignment-${order.consignmentId ?? ""}`}
                      type="text"
                      defaultValue={order.consignmentId ?? ""}
                      maxLength={200}
                      disabled={pendingId === order.id}
                      onBlur={(event) => {
                        const value = event.currentTarget.value.trim() || null;
                        if (value !== order.consignmentId) {
                          void updateOrder(order, { consignmentId: value });
                        }
                      }}
                      className="mt-1 block w-full rounded border px-2 py-2 text-sm font-normal text-gray-900"
                    />
                  </label>
                  <label className="text-xs font-semibold text-gray-600">
                    Tracking code
                    <input
                      key={`${order.id}-tracking-${order.trackingCode ?? ""}`}
                      type="text"
                      defaultValue={order.trackingCode ?? ""}
                      maxLength={200}
                      disabled={pendingId === order.id}
                      onBlur={(event) => {
                        const value = event.currentTarget.value.trim() || null;
                        if (value !== order.trackingCode) {
                          void updateOrder(order, { trackingCode: value });
                        }
                      }}
                      className="mt-1 block w-full rounded border px-2 py-2 text-sm font-normal text-gray-900"
                    />
                  </label>
                </div>
                {order.courierStatus && (
                  <p className="mt-2 text-xs text-gray-500">
                    Courier status: {order.courierStatus}
                  </p>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
