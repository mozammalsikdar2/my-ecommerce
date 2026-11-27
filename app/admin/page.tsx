"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgePercent,
  Clock3,
  CreditCard,
  CircleDollarSign,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

const orderStatuses: readonly OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

const allowedOrderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: ["PENDING"],
};

interface DashboardSummary {
  totalOrders: number;
  pendingOrders: number;
  confirmedOrders: number;
  totalRevenue: number;
  lowStockCount: number;
  paidRevenue: number;
  unpaidRevenue: number;
  totalDiscounts: number;
  totalCustomers: number;
  activeOrders: number;
}

interface DailySale {
  date: string;
  label: string;
  orderCount: number;
  revenue: number;
}

interface LowStockProduct {
  id: string;
  name: string;
  slug: string;
  image: string;
  stock: number;
  price: number;
}

interface TopProduct {
  id: string;
  name: string;
  image: string;
  unitsSold: number;
  revenue: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryZone: string;
  totalAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: "UNPAID" | "PAID";
  paymentMethod: string;
  createdAt: string;
  items: Array<{
    id: string;
    quantity: number;
    variantInfo: string | null;
    product: { name: string };
  }>;
}

interface DashboardData {
  generatedAt: string;
  range: "7d" | "30d" | "all";
  summary: DashboardSummary;
  statusCounts: Record<
    "PENDING" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED",
    number
  >;
  dailySales: DailySale[];
  topProducts: TopProduct[];
  lowStockProducts: LowStockProduct[];
  recentOrders: RecentOrder[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStatusCounts(
  value: unknown,
): value is DashboardData["statusCounts"] {
  return (
    isRecord(value) &&
    (
      [
        "PENDING",
        "CONFIRMED",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
      ] as const
    ).every((status) => typeof value[status] === "number")
  );
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    orderStatuses.some((status) => status === value)
  );
}

function isDashboardData(value: unknown): value is DashboardData {
  return (
    isRecord(value) &&
    typeof value.generatedAt === "string" &&
    (value.range === "7d" || value.range === "30d" || value.range === "all") &&
    isRecord(value.summary) &&
    typeof value.summary.totalOrders === "number" &&
    typeof value.summary.pendingOrders === "number" &&
    typeof value.summary.confirmedOrders === "number" &&
    typeof value.summary.totalRevenue === "number" &&
    typeof value.summary.lowStockCount === "number" &&
    typeof value.summary.paidRevenue === "number" &&
    typeof value.summary.unpaidRevenue === "number" &&
    typeof value.summary.totalDiscounts === "number" &&
    typeof value.summary.totalCustomers === "number" &&
    typeof value.summary.activeOrders === "number" &&
    isStatusCounts(value.statusCounts) &&
    Array.isArray(value.dailySales) &&
    value.dailySales.every(
      (day) =>
        isRecord(day) &&
        typeof day.date === "string" &&
        typeof day.label === "string" &&
        typeof day.orderCount === "number" &&
        typeof day.revenue === "number",
    ) &&
    Array.isArray(value.topProducts) &&
    value.topProducts.every(
      (product) =>
        isRecord(product) &&
        typeof product.id === "string" &&
        typeof product.name === "string" &&
        typeof product.image === "string" &&
        typeof product.unitsSold === "number" &&
        typeof product.revenue === "number",
    ) &&
    Array.isArray(value.lowStockProducts) &&
    value.lowStockProducts.every(
      (product) =>
        isRecord(product) &&
        typeof product.id === "string" &&
        typeof product.name === "string" &&
        typeof product.slug === "string" &&
        typeof product.image === "string" &&
        typeof product.stock === "number" &&
        typeof product.price === "number",
    ) &&
    Array.isArray(value.recentOrders) &&
    value.recentOrders.every(
      (order) =>
        isRecord(order) &&
        typeof order.id === "string" &&
        typeof order.orderNumber === "string" &&
        typeof order.customerName === "string" &&
        typeof order.customerPhone === "string" &&
        typeof order.deliveryZone === "string" &&
        typeof order.totalAmount === "number" &&
        isOrderStatus(order.orderStatus) &&
        (order.paymentStatus === "UNPAID" ||
          order.paymentStatus === "PAID") &&
        typeof order.paymentMethod === "string" &&
        typeof order.createdAt === "string" &&
        Array.isArray(order.items) &&
        order.items.every(
          (item) =>
            isRecord(item) &&
            typeof item.id === "string" &&
            typeof item.quantity === "number" &&
            (item.variantInfo === null ||
              typeof item.variantInfo === "string") &&
            isRecord(item.product) &&
            typeof item.product.name === "string",
        ),
    )
  );
}

function formatMoney(value: number) {
  return `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

async function readError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string") return body.error;
  } catch {
    // The response may not contain JSON.
  }
  return `Request failed (${response.status})`;
}

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderActionError, setOrderActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [range, setRange] = useState<DashboardData["range"]>("30d");
  const [orderSearch, setOrderSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();

    async function refreshDashboard() {
      setIsRefreshing(true);
      try {
        const response = await fetch(
          `/api/admin/dashboard?range=${range}`,
          {
          cache: "no-store",
          signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error(await readError(response));
        const data: unknown = await response.json();
        if (!isDashboardData(data)) {
          throw new Error("Dashboard API returned invalid data");
        }
        if (active) {
          setDashboard(data);
          setError(null);
        }
      } catch (loadError) {
        if (active && !controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load dashboard",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
          setIsRefreshing(false);
          timer = setTimeout(() => void refreshDashboard(), 15_000);
        }
      }
    }

    void refreshDashboard();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [range, refreshKey]);

  async function updateOrder(
    order: RecentOrder,
    change: { orderStatus: OrderStatus } | { paymentStatus: "UNPAID" | "PAID" },
  ) {
    if (
      "orderStatus" in change &&
      change.orderStatus === "CANCELLED" &&
      !window.confirm(
        `Cancel ${order.orderNumber}? Its reserved inventory will be restored.`,
      )
    ) {
      return;
    }
    if (
      order.orderStatus === "CANCELLED" &&
      "orderStatus" in change &&
      change.orderStatus === "PENDING" &&
      !window.confirm(
        `Reopen ${order.orderNumber}? Inventory will be reserved again.`,
      )
    ) {
      return;
    }

    setUpdatingOrderId(order.id);
    setOrderActionError(null);
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!response.ok) throw new Error(await readError(response));
      setRefreshKey((key) => key + 1);
    } catch (updateError) {
      setOrderActionError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update order",
      );
    } finally {
      setUpdatingOrderId(null);
    }
  }

  const normalizedOrderSearch = orderSearch.trim().toLowerCase();
  const filteredOrders =
    dashboard?.recentOrders.filter((order) => {
      const matchesStatus =
        statusFilter === "ALL" || order.orderStatus === statusFilter;
      const matchesSearch =
        !normalizedOrderSearch ||
        [
          order.orderNumber,
          order.customerName,
          order.customerPhone,
          ...order.items.map((item) => item.product.name),
        ].some((value) => value.toLowerCase().includes(normalizedOrderSearch));
      return matchesStatus && matchesSearch;
    }) ?? [];

  const maxRevenue = Math.max(
    0,
    ...(dashboard?.dailySales.map((day) => day.revenue) ?? []),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-700">Overview</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Sales dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Store performance, inventory alerts, and recent orders.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/payments"
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <CreditCard className="h-4 w-4" />
            Payments
          </Link>
          <Link
            href="/admin/logistics"
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Truck className="h-4 w-4" />
            Logistics
          </Link>
          <span className="hidden text-xs text-slate-500 sm:inline">
            Live updates every 15 seconds
          </span>
          <label className="sr-only" htmlFor="dashboard-range">
            Analytics date range
          </label>
          <select
            id="dashboard-range"
            value={range}
            onChange={(event) =>
              setRange(event.target.value as DashboardData["range"])
            }
            className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Dashboard data could not be refreshed.</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {isLoading && !dashboard ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
          Loading sales and inventory data...
        </div>
      ) : dashboard ? (
        <>
          <section
            aria-label="Sales and order summary"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5"
          >
            <SummaryCard
              label="Net sales"
              value={formatMoney(dashboard.summary.totalRevenue)}
              detail={`${range === "all" ? "All time" : range === "7d" ? "Last 7 days" : "Last 30 days"} · excludes cancelled`}
              icon={Wallet}
              tone="teal"
            />
            <SummaryCard
              label="Paid revenue"
              value={formatMoney(dashboard.summary.paidRevenue)}
              detail="Paid, non-cancelled orders"
              icon={CreditCard}
              tone="emerald"
            />
            <SummaryCard
              label="Unpaid revenue"
              value={formatMoney(dashboard.summary.unpaidRevenue)}
              detail="Unpaid, non-cancelled orders"
              icon={CircleDollarSign}
              tone="indigo"
            />
            <SummaryCard
              label="Discounts applied"
              value={formatMoney(dashboard.summary.totalDiscounts)}
              detail="Non-cancelled orders"
              icon={BadgePercent}
              tone="rose"
            />
            <SummaryCard
              label="Total orders"
              value={dashboard.summary.totalOrders.toLocaleString()}
              detail={`${dashboard.summary.confirmedOrders} confirmed`}
              icon={ShoppingBag}
              tone="blue"
            />
            <SummaryCard
              label="Pending orders"
              value={dashboard.summary.pendingOrders.toLocaleString()}
              detail="Awaiting processing"
              icon={Clock3}
              tone="amber"
            />
            <SummaryCard
              label="Active orders"
              value={dashboard.summary.activeOrders.toLocaleString()}
              detail="Pending, confirmed, or shipped"
              icon={Truck}
              tone="blue"
            />
            <SummaryCard
              label="Customers"
              value={dashboard.summary.totalCustomers.toLocaleString()}
              detail="Registered customer accounts"
              icon={Users}
              tone="teal"
            />
            <SummaryCard
              label="Low-stock products"
              value={dashboard.summary.lowStockCount.toLocaleString()}
              detail="Active items with 5 or fewer units"
              icon={Package}
              tone="rose"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Daily sales
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Recent daily revenue, excluding cancelled orders
                  </p>
                </div>
                <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                  {dashboard.dailySales.length} days
                </span>
              </div>
              <div className="flex h-56 items-end gap-2 border-b border-l px-2 sm:gap-4">
                {dashboard.dailySales.map((day) => {
                  const height =
                    maxRevenue > 0
                      ? Math.max(4, (day.revenue / maxRevenue) * 100)
                      : 0;
                  return (
                    <div
                      key={day.date}
                      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                      title={`${day.orderCount} orders · ${formatMoney(day.revenue)}`}
                    >
                      <span className="hidden text-[10px] text-slate-500 sm:block">
                        {day.revenue > 0 ? formatMoney(day.revenue) : ""}
                      </span>
                      <div className="flex h-[72%] w-full items-end justify-center">
                        <div
                          className="w-full max-w-12 rounded-t-md bg-teal-500 transition-all"
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span className="pb-2 text-[10px] font-medium text-slate-500 sm:text-xs">
                        {day.label || formatDay(day.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>Orders include cancelled purchases</span>
                <span>
                  {dashboard.dailySales.reduce(
                    (total, day) => total + day.orderCount,
                    0,
                  )}{" "}
                  orders
                </span>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Stock alerts
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Products at or below 5 units
                  </p>
                </div>
                <Link
                  href="/admin/products"
                  className="text-xs font-semibold text-teal-800 hover:underline"
                >
                  Manage products
                </Link>
              </div>
              {dashboard.lowStockProducts.length === 0 ? (
                <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
                  All active products have healthy stock.
                </div>
              ) : (
                <ul className="divide-y">
                  {dashboard.lowStockProducts.map((product) => (
                    <li
                      key={product.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {product.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {product.slug}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                          product.stock === 0
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {product.stock} left
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {dashboard.summary.lowStockCount >
                dashboard.lowStockProducts.length && (
                <p className="mt-3 text-xs text-slate-500">
                  Showing {dashboard.lowStockProducts.length} of{" "}
                  {dashboard.summary.lowStockCount} low-stock products.
                </p>
              )}
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Top-selling products
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    By sales revenue in the selected range
                  </p>
                </div>
                <Link
                  href="/admin/products"
                  className="text-xs font-semibold text-teal-800 hover:underline"
                >
                  Products
                </Link>
              </div>
              {dashboard.topProducts.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                  No product sales in this date range.
                </p>
              ) : (
                <ul className="divide-y">
                  {dashboard.topProducts.map((product, index) => (
                    <li
                      key={product.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {product.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {product.unitsSold.toLocaleString()} units sold
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-slate-800">
                        {formatMoney(product.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-slate-900">
                Order pipeline
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Status counts in the selected date range
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  aria-pressed={statusFilter === "ALL"}
                  onClick={() => setStatusFilter("ALL")}
                  className={`rounded-lg p-3 text-left transition ${
                    statusFilter === "ALL"
                      ? "bg-teal-50 ring-1 ring-teal-300"
                      : "bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <p className="text-xs font-medium text-slate-500">
                    All statuses
                  </p>
                  <p className="mt-1 text-xl font-bold text-slate-800">
                    {dashboard.summary.totalOrders.toLocaleString()}
                  </p>
                </button>
                {(
                  [
                    ["PENDING", "Pending", "text-amber-700"],
                    ["CONFIRMED", "Confirmed", "text-blue-700"],
                    ["SHIPPED", "Shipped", "text-indigo-700"],
                    ["DELIVERED", "Delivered", "text-emerald-700"],
                    ["CANCELLED", "Cancelled", "text-red-700"],
                  ] as const
                ).map(([key, label, color]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={statusFilter === key}
                    onClick={() =>
                      setStatusFilter((current) =>
                        current === key ? "ALL" : key,
                      )
                    }
                    className={`rounded-lg p-3 text-left transition ${
                      statusFilter === key
                        ? "bg-teal-50 ring-1 ring-teal-300"
                        : "bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className={`mt-1 text-xl font-bold ${color}`}>
                      {dashboard.statusCounts[key].toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Live order tracker
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Search, filter, and update the latest orders
                </p>
              </div>
              <Link
                href="/admin/orders"
                className="inline-flex items-center gap-1 text-sm font-semibold text-teal-800 hover:underline"
              >
                View all orders <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex flex-wrap gap-3 border-b px-5 py-4">
              <label className="relative min-w-56 flex-1">
                <span className="sr-only">Search recent orders</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={orderSearch}
                  onChange={(event) => setOrderSearch(event.target.value)}
                  placeholder="Search order, customer, phone, or product"
                  className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400"
                />
              </label>
              <label>
                <span className="sr-only">Filter orders by status</span>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as OrderStatus | "ALL")
                  }
                  className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="ALL">All statuses</option>
                  {orderStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {orderActionError && (
              <div
                role="alert"
                className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {orderActionError}
              </div>
            )}
            {dashboard.recentOrders.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                No orders have been placed yet.
              </p>
            ) : filteredOrders.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                No recent orders match your search and status filter.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Order</th>
                      <th className="px-5 py-3 font-semibold">Customer</th>
                      <th className="px-5 py-3 font-semibold">Items</th>
                      <th className="px-5 py-3 font-semibold">Order status</th>
                      <th className="px-5 py-3 font-semibold">Payment</th>
                      <th className="px-5 py-3 text-right font-semibold">
                        Total
                      </th>
                      <th className="px-5 py-3 font-semibold">Placed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((order) => {
                      const transitions =
                        allowedOrderTransitions[order.orderStatus];
                      return (
                        <tr key={order.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">
                            {order.orderNumber}
                          </td>
                          <td className="px-5 py-4 text-slate-700">
                            <p className="font-medium">{order.customerName}</p>
                            <p className="text-xs text-slate-500">
                              {order.customerPhone}
                            </p>
                            <p className="text-xs text-slate-500">
                              {order.deliveryZone === "INSIDE_DHAKA"
                                ? "Inside Dhaka"
                                : "Outside Dhaka"}
                            </p>
                          </td>
                          <td className="max-w-64 px-5 py-4 text-slate-600">
                            <span className="line-clamp-1">
                              {order.items
                                .map(
                                  (item) =>
                                    `${item.product.name}${item.variantInfo ? ` (${item.variantInfo})` : ""} × ${item.quantity}`,
                                )
                                .join(", ")}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <label>
                              <span className="sr-only">
                                Update order status for {order.orderNumber}
                              </span>
                              <select
                                value={order.orderStatus}
                                disabled={updatingOrderId !== null}
                                onChange={(event) =>
                                  updateOrder(order, {
                                    orderStatus: event.target.value as OrderStatus,
                                  })
                                }
                                className="rounded-lg border bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                              >
                                <option value={order.orderStatus}>
                                  {order.orderStatus}
                                </option>
                                {transitions.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <label>
                              <span className="sr-only">
                                Update payment status for {order.orderNumber}
                              </span>
                              <select
                                value={order.paymentStatus}
                                disabled={updatingOrderId !== null}
                                onChange={(event) =>
                                  updateOrder(order, {
                                    paymentStatus: event.target.value as
                                      | "UNPAID"
                                      | "PAID",
                                  })
                                }
                                className="rounded-lg border bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                              >
                                <option value="UNPAID">
                                  UNPAID · {order.paymentMethod}
                                </option>
                                <option value="PAID">
                                  PAID · {order.paymentMethod}
                                </option>
                              </select>
                            </label>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-right font-semibold">
                            {formatMoney(order.totalAmount)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                            {formatDate(order.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="text-right text-xs text-slate-500">
            Data last updated {formatDate(dashboard.generatedAt)}
          </p>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Wallet;
  tone: "teal" | "blue" | "amber" | "rose" | "emerald" | "indigo";
}) {
  const tones = {
    teal: "bg-teal-50 text-teal-800",
    blue: "bg-blue-50 text-blue-800",
    amber: "bg-amber-50 text-amber-800",
    rose: "bg-rose-50 text-rose-800",
    emerald: "bg-emerald-50 text-emerald-800",
    indigo: "bg-indigo-50 text-indigo-800",
  };
  return (
    <article className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {value}
          </p>
        </div>
        <span className={`rounded-lg p-2.5 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

