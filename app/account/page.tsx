"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Lock,
  LogOut,
  MapPin,
  Package,
  PackageCheck,
  Save,
  ShoppingBag,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";

interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  role: string;
  createdAt: string;
}

interface CustomerOrderItem {
  id: string;
  quantity: number;
  price: number;
  variantInfo: string | null;
  product: { id: string; name: string; image: string };
}

interface CustomerOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
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
  createdAt: string;
  items: CustomerOrderItem[];
}

const trackingSteps = [
  { key: "PENDING", label: "Order Placed", icon: Clock },
  { key: "CONFIRMED", label: "Confirmed", icon: PackageCheck },
  { key: "SHIPPED", label: "Out for Delivery", icon: Truck },
  { key: "DELIVERED", label: "Delivered", icon: CheckCircle2 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function isCustomerProfile(value: unknown): value is CustomerProfile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    isOptionalString(value.phone) &&
    isOptionalString(value.address) &&
    typeof value.role === "string" &&
    typeof value.createdAt === "string"
  );
}

function isCustomerOrderItem(value: unknown): value is CustomerOrderItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.quantity === "number" &&
    Number.isFinite(value.quantity) &&
    typeof value.price === "number" &&
    Number.isFinite(value.price) &&
    isOptionalString(value.variantInfo) &&
    isRecord(value.product) &&
    typeof value.product.id === "string" &&
    typeof value.product.name === "string" &&
    typeof value.product.image === "string"
  );
}

function isCustomerOrder(value: unknown): value is CustomerOrder {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.orderNumber === "string" &&
    typeof value.customerName === "string" &&
    typeof value.customerPhone === "string" &&
    typeof value.deliveryAddress === "string" &&
    typeof value.deliveryZone === "string" &&
    typeof value.subtotal === "number" &&
    Number.isFinite(value.subtotal) &&
    typeof value.discountAmount === "number" &&
    Number.isFinite(value.discountAmount) &&
    isOptionalString(value.couponCode) &&
    typeof value.deliveryCharge === "number" &&
    Number.isFinite(value.deliveryCharge) &&
    typeof value.totalAmount === "number" &&
    Number.isFinite(value.totalAmount) &&
    typeof value.paymentMethod === "string" &&
    typeof value.paymentStatus === "string" &&
    typeof value.orderStatus === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.items) &&
    value.items.every(isCustomerOrderItem)
  );
}

async function getApiError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string") return body.error;
  } catch {
    // Use the status-based message for non-JSON responses.
  }
  return `Request failed (${response.status})`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function money(value: number) {
  return `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

export default function CustomerDashboardPage() {
  const { settings } = useSettings();
  const { refreshUser, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"orders" | "profile">("orders");
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: "",
    phone: "",
    address: "",
    currentPassword: "",
    newPassword: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const response = await fetch("/api/customer/profile", {
          cache: "no-store",
        });
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) {
          throw new Error(await getApiError(response));
        }

        const data: unknown = await response.json();
        if (
          !isRecord(data) ||
          !isCustomerProfile(data.profile) ||
          !Array.isArray(data.orders) ||
          !data.orders.every(isCustomerOrder)
        ) {
          throw new Error("Customer dashboard returned invalid data");
        }

        if (!active) return;
        setProfile(data.profile);
        setOrders(data.orders);
        setProfileForm({
          name: data.profile.name,
          phone: data.profile.phone ?? "",
          address: data.profile.address ?? "",
          currentPassword: "",
          newPassword: "",
        });
      } catch (error) {
        if (active) setLoadError(errorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      active = false;
    };
  }, [router]);

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setSavingProfile(true);

    const body: Record<string, string | null> = {
      name: profileForm.name.trim(),
      phone: profileForm.phone.trim() || null,
      address: profileForm.address.trim() || null,
    };
    if (profileForm.currentPassword || profileForm.newPassword) {
      body.currentPassword = profileForm.currentPassword;
      body.newPassword = profileForm.newPassword;
    }

    try {
      const response = await fetch("/api/customer/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(await getApiError(response));
      }

      const data: unknown = await response.json();
      if (!isRecord(data) || !isCustomerProfile(data.profile)) {
        throw new Error("Profile endpoint returned invalid data");
      }

      const updatedProfile = data.profile;
      setProfile(updatedProfile);
      setProfileForm((previous) => ({
        ...previous,
        name: updatedProfile.name,
        phone: updatedProfile.phone ?? "",
        address: updatedProfile.address ?? "",
        currentPassword: "",
        newPassword: "",
      }));

      let refreshNotice = "";
      try {
        await refreshUser();
      } catch {
        refreshNotice =
          " Your profile was saved, but your session details could not be refreshed.";
      }
      setFeedback({
        type: "success",
        text:
          (typeof data.message === "string"
            ? data.message
            : "Profile updated successfully!") + refreshNotice,
      });
    } catch (error) {
      setFeedback({ type: "error", text: errorMessage(error) });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleLogout() {
    setLogoutError(null);
    try {
      await logout();
    } catch (error) {
      setLogoutError(errorMessage(error));
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 text-center text-sm text-gray-500">
        Loading your account dashboard...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800"
        >
          {loadError}
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!profile) return null;

  const activeDeliveriesCount = orders.filter((order) =>
    ["PENDING", "CONFIRMED", "SHIPPED"].includes(order.orderStatus),
  ).length;
  const totalSpent = orders
    .filter((order) => order.orderStatus !== "CANCELLED")
    .reduce((sum, order) => sum + order.totalAmount, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div
            style={{ backgroundColor: settings.primaryColor }}
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-extrabold text-white shadow"
          >
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 sm:text-2xl">
              Welcome, {profile.name}
            </h1>
            <p className="text-xs text-gray-500">
              {profile.email} {profile.phone && `• ${profile.phone}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border bg-gray-50 px-4 py-2.5 text-center">
            <div className="text-[11px] font-bold uppercase text-gray-400">
              Total Orders
            </div>
            <div className="text-base font-extrabold text-gray-900">
              {orders.length}
            </div>
          </div>
          <div className="rounded-xl border bg-gray-50 px-4 py-2.5 text-center">
            <div className="text-[11px] font-bold uppercase text-gray-400">
              In Progress
            </div>
            <div
              style={{ color: settings.primaryColor }}
              className="text-base font-extrabold"
            >
              {activeDeliveriesCount}
            </div>
          </div>
          <div className="rounded-xl border bg-gray-50 px-4 py-2.5 text-center">
            <div className="text-[11px] font-bold uppercase text-gray-400">
              Total Spent
            </div>
            <div className="text-base font-extrabold text-gray-900">
              {money(totalSpent)}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3.5 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {logoutError && (
        <p role="alert" className="text-right text-sm text-red-700">
          {logoutError}
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-b pb-3">
        <button
          type="button"
          aria-pressed={activeTab === "orders"}
          onClick={() => setActiveTab("orders")}
          style={
            activeTab === "orders"
              ? { backgroundColor: settings.primaryColor, color: "#ffffff" }
              : {}
          }
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "orders"
              ? "shadow-sm"
              : "bg-white text-gray-700 hover:bg-gray-100"
          }`}
        >
          <Package className="h-4 w-4" />
          <span>My Orders &amp; Live Tracking ({orders.length})</span>
        </button>
        <button
          type="button"
          aria-pressed={activeTab === "profile"}
          onClick={() => setActiveTab("profile")}
          style={
            activeTab === "profile"
              ? { backgroundColor: settings.primaryColor, color: "#ffffff" }
              : {}
          }
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "profile"
              ? "shadow-sm"
              : "bg-white text-gray-700 hover:bg-gray-100"
          }`}
        >
          <User className="h-4 w-4" />
          <span>Profile &amp; Delivery Address</span>
        </button>
      </div>

      {activeTab === "orders" && (
        <div className="space-y-6">
          {orders.length === 0 ? (
            <div className="rounded-2xl border bg-white p-12 text-center shadow-sm">
              <ShoppingBag className="mx-auto h-12 w-12 text-gray-300" />
              <h2 className="mt-4 text-lg font-extrabold text-gray-900">
                No orders placed yet
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Your orders and delivery status will appear here.
              </p>
              <Link
                href="/products"
                style={{ backgroundColor: settings.primaryColor }}
                className="mt-5 inline-block rounded-xl px-6 py-2.5 text-xs font-bold text-white"
              >
                Start Shopping
              </Link>
            </div>
          ) : (
            orders.map((order) => {
              const isCancelled = order.orderStatus === "CANCELLED";
              const currentStepIndex = trackingSteps.findIndex(
                (step) => step.key === order.orderStatus,
              );

              return (
                <article
                  key={order.id}
                  className="overflow-hidden rounded-2xl border bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-gray-50/70 px-6 py-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-base font-extrabold text-gray-900">
                          {order.orderNumber}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            order.paymentStatus === "PAID"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {order.paymentStatus} ({order.paymentMethod})
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        Placed on{" "}
                        {new Date(order.createdAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Order Total</div>
                      <div
                        style={{ color: settings.primaryColor }}
                        className="text-lg font-extrabold"
                      >
                        {money(order.totalAmount)}
                      </div>
                    </div>
                  </div>

                  <div className="border-b px-6 py-6">
                    {isCancelled ? (
                      <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-bold text-red-700">
                        <XCircle className="h-5 w-5 shrink-0" />
                        <span>
                          This order was cancelled. For support, contact{" "}
                          {settings.contactPhone}.
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {trackingSteps.map((step, index) => {
                          const Icon = step.icon;
                          const completed = index <= currentStepIndex;
                          const isCurrent = index === currentStepIndex;
                          return (
                            <div
                              key={step.key}
                              className="flex items-center gap-3"
                            >
                              <div
                                style={
                                  completed
                                    ? {
                                        backgroundColor: settings.primaryColor,
                                        color: "#ffffff",
                                      }
                                    : {}
                                }
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${
                                  completed
                                    ? "border-transparent shadow-sm"
                                    : "border-gray-200 bg-gray-100 text-gray-400"
                                } ${isCurrent ? "ring-4 ring-black/10" : ""}`}
                              >
                                <Icon className="h-5 w-5" />
                              </div>
                              <div>
                                <div
                                  className={`text-xs font-extrabold ${
                                    completed ? "text-gray-900" : "text-gray-400"
                                  }`}
                                >
                                  {step.label}
                                </div>
                                <div className="text-[11px] text-gray-400">
                                  {isCurrent
                                    ? "Current Status"
                                    : completed
                                      ? "Completed"
                                      : "Pending"}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-6 px-6 py-5 md:grid-cols-3">
                    <div className="space-y-3 md:col-span-2">
                      <div className="text-xs font-bold uppercase text-gray-400">
                        Items Ordered
                      </div>
                      {order.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-xl border bg-gray-50/50 p-2.5 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            {item.product.image ? (
                              <Image
                                src={item.product.image}
                                alt={item.product.name}
                                width={48}
                                height={48}
                                unoptimized
                                className="h-12 w-12 shrink-0 rounded-lg border object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-white text-gray-400">
                                <Package className="h-5 w-5" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <Link
                                href={`/products/${encodeURIComponent(item.product.id)}`}
                                className="font-bold text-gray-900 hover:underline"
                              >
                                {item.product.name}
                              </Link>
                              {item.variantInfo && (
                                <div className="text-gray-500">
                                  {item.variantInfo}
                                </div>
                              )}
                              <div className="text-gray-500">
                                Qty: {item.quantity} × {money(item.price)}
                              </div>
                            </div>
                          </div>
                          <span className="shrink-0 font-extrabold text-gray-900">
                            {money(item.price * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col justify-between rounded-xl bg-gray-50 p-4 text-xs">
                      <div>
                        <div className="font-bold uppercase text-gray-400">
                          Delivery Details
                        </div>
                        <div className="mt-1.5 font-bold text-gray-900">
                          {order.customerName} ({order.customerPhone})
                        </div>
                        <div className="mt-1 text-gray-600">
                          {order.deliveryAddress}
                        </div>
                        <span className="mt-2 inline-block rounded border bg-white px-2 py-0.5 font-semibold text-gray-700">
                          {order.deliveryZone === "INSIDE_DHAKA"
                            ? "Inside Dhaka"
                            : "Outside Dhaka"}
                        </span>
                      </div>
                      <div className="mt-4 space-y-1 border-t pt-3 text-gray-600">
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span>{money(order.subtotal)}</span>
                        </div>
                        {order.discountAmount > 0 && (
                          <div className="flex justify-between text-green-700">
                            <span>Discount ({order.couponCode}):</span>
                            <span>-{money(order.discountAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Delivery Fee:</span>
                          <span>{money(order.deliveryCharge)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {activeTab === "profile" && (
        <form
          onSubmit={handleProfileSave}
          className="mx-auto max-w-2xl space-y-6 rounded-2xl border bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="border-b pb-3">
            <h2 className="text-lg font-extrabold text-gray-900">
              Account Profile &amp; Saved Shipping Address
            </h2>
            <p className="text-xs text-gray-500">
              Your saved name, phone, and address will pre-fill during checkout.
            </p>
          </div>

          {feedback && (
            <div
              role={feedback.type === "error" ? "alert" : "status"}
              className={`rounded-xl border p-3.5 text-xs font-bold ${
                feedback.type === "success"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {feedback.text}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-gray-700">
              Full Name *
              <input
                type="text"
                required
                maxLength={120}
                value={profileForm.name}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, name: event.target.value })
                }
                className="mt-1 w-full rounded-xl border p-2.5 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-bold text-gray-700">
              Phone Number
              <input
                type="tel"
                maxLength={40}
                placeholder="017XXXXXXXX"
                value={profileForm.phone}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, phone: event.target.value })
                }
                className="mt-1 w-full rounded-xl border p-2.5 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-bold text-gray-700 sm:col-span-2">
              Email Address (Read-only)
              <input
                type="email"
                disabled
                value={profile.email}
                className="mt-1 w-full rounded-xl border bg-gray-100 p-2.5 text-sm font-normal text-gray-500"
              />
            </label>
            <label className="text-xs font-bold text-gray-700 sm:col-span-2">
              <span className="mb-1 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                <span>Default Delivery Address</span>
              </span>
              <textarea
                rows={3}
                maxLength={1000}
                placeholder="House, Road, Area, Thana, District..."
                value={profileForm.address}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, address: event.target.value })
                }
                className="w-full rounded-xl border p-2.5 text-sm font-normal"
              />
            </label>
          </div>

          <div className="space-y-4 rounded-xl border bg-gray-50 p-4">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-gray-700">
              <Lock className="h-3.5 w-3.5" />
              <span>Change Password (Optional)</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-gray-600">
                Current Password
                <input
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  placeholder="Enter current password"
                  value={profileForm.currentPassword}
                  onChange={(event) =>
                    setProfileForm({
                      ...profileForm,
                      currentPassword: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-lg border bg-white p-2 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-semibold text-gray-600">
                New Password (6–128 characters)
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={128}
                  placeholder="Enter new password"
                  value={profileForm.newPassword}
                  onChange={(event) =>
                    setProfileForm({
                      ...profileForm,
                      newPassword: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-lg border bg-white p-2 text-sm font-normal"
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            style={{ backgroundColor: settings.primaryColor }}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>
              {savingProfile ? "Saving..." : "Save Profile Changes"}
            </span>
          </button>
        </form>
      )}
    </div>
  );
}
