"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Plus,
  Sparkles,
  Ticket,
  Trash2,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

interface Coupon {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
}

interface CouponForm {
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: string;
  minOrderAmount: string;
  maxDiscount: string;
  usageLimit: string;
  expiresAt: string;
}

const initialForm: CouponForm = {
  code: "",
  discountType: "PERCENTAGE",
  discountValue: "",
  minOrderAmount: "0",
  maxDiscount: "",
  usageLimit: "",
  expiresAt: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCoupon(value: unknown): value is Coupon {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.code === "string" &&
    (value.discountType === "PERCENTAGE" || value.discountType === "FIXED") &&
    typeof value.discountValue === "number" &&
    typeof value.minOrderAmount === "number" &&
    (typeof value.maxDiscount === "number" || value.maxDiscount === null) &&
    (typeof value.usageLimit === "number" || value.usageLimit === null) &&
    typeof value.usedCount === "number" &&
    (typeof value.expiresAt === "string" || value.expiresAt === null) &&
    typeof value.isActive === "boolean"
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

export default function AdminCouponsPage() {
  const { settings } = useSettings();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCoupons() {
      try {
        const response = await fetch("/api/coupons", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await getApiError(response));
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isCoupon)) {
          throw new Error("Coupons API returned invalid data");
        }
        setCoupons(data);
        setCheckedAt(Date.now());
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load coupons",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    void loadCoupons();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setCheckedAt(Date.now()),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  async function createCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          minOrderAmount: Number(form.minOrderAmount || 0),
          maxDiscount:
            form.discountType === "PERCENTAGE" && form.maxDiscount
              ? Number(form.maxDiscount)
              : null,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
          expiresAt: form.expiresAt
            ? new Date(form.expiresAt).toISOString()
            : null,
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const data: unknown = await response.json();
      if (!isCoupon(data)) throw new Error("Coupons API returned invalid data");
      setCoupons((current) => [data, ...current]);
      setCheckedAt(Date.now());
      setForm(initialForm);
      setMessage(`Coupon ${data.code} created.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to create coupon",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleCoupon(coupon: Coupon) {
    setPendingId(coupon.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !coupon.isActive }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const data: unknown = await response.json();
      if (!isCoupon(data)) throw new Error("Coupons API returned invalid data");
      setCoupons((current) =>
        current.map((item) => (item.id === data.id ? data : item)),
      );
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Unable to update coupon",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function saveUsageLimit(coupon: Coupon) {
    const value = limitDrafts[coupon.id] ?? String(coupon.usageLimit ?? "");
    const usageLimit = value.trim() ? Number(value) : null;
    if (
      usageLimit !== null &&
      (!Number.isSafeInteger(usageLimit) || usageLimit <= 0)
    ) {
      setError("Total uses must be a positive whole number or unlimited.");
      return;
    }

    setPendingId(coupon.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageLimit }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const data: unknown = await response.json();
      if (!isCoupon(data)) throw new Error("Coupons API returned invalid data");
      setCoupons((current) =>
        current.map((item) => (item.id === data.id ? data : item)),
      );
      setLimitDrafts((current) => {
        const next = { ...current };
        delete next[coupon.id];
        return next;
      });
      setMessage(`Usage limit updated for ${coupon.code}.`);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update usage limit",
      );
    } finally {
      setPendingId(null);
    }
  }

  function generateCouponCode() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const suffix: string[] = [];
    while (suffix.length < 6) {
      const randomValues = new Uint8Array(16);
      window.crypto.getRandomValues(randomValues);
      for (const value of randomValues) {
        if (value < 252) suffix.push(alphabet[value % alphabet.length]);
        if (suffix.length === 6) break;
      }
    }
    setForm((current) => ({ ...current, code: `SAVE${suffix.join("")}` }));
  }

  async function copyCouponCode(id: string, code: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setMessage(`Copied coupon code ${code}.`);
      window.setTimeout(
        () => setCopiedId((current) => (current === id ? null : current)),
        1500,
      );
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? "Clipboard access was denied. Copy the code manually."
          : "Unable to copy coupon code",
      );
    }
  }

  async function deleteCoupon(coupon: Coupon) {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;
    setPendingId(coupon.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/coupons/${coupon.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await getApiError(response));
      setCoupons((current) => current.filter((item) => item.id !== coupon.id));
      setMessage(`Coupon ${coupon.code} deleted.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete coupon",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link
        href="/admin/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-black"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin Settings
      </Link>
      <div className="mb-6 flex items-center gap-2">
        <Ticket
          className="h-6 w-6"
          style={{ color: settings.primaryColor }}
        />
        <h1 className="text-2xl font-bold text-gray-900">
          Discount Coupons Manager
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

      <form
        onSubmit={createCoupon}
        className="mb-8 grid gap-4 rounded-xl border bg-white p-5 shadow-sm md:grid-cols-3"
      >
        <h2 className="text-lg font-bold md:col-span-3">Create coupon</h2>
        <label className="text-sm font-medium">
          <span className="flex items-center justify-between gap-2">
            Promo code
            <button
              type="button"
              onClick={generateCouponCode}
              style={{ color: settings.primaryColor }}
              className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate code
            </button>
          </span>
          <input
            required
            pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}"
            maxLength={40}
            value={form.code}
            onChange={(event) =>
              setForm((current) => ({ ...current, code: event.target.value }))
            }
            placeholder="WELCOME10"
            className="mt-1 w-full rounded-lg border px-3 py-2 uppercase"
          />
        </label>
        <label className="text-sm font-medium">
          Discount type
          <select
            value={form.discountType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                discountType: event.target.value as "PERCENTAGE" | "FIXED",
              }))
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED">Fixed amount</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          {form.discountType === "PERCENTAGE" ? "Percent off" : "Amount off (৳)"}
          <input
            required
            type="number"
            min="0.01"
            max={form.discountType === "PERCENTAGE" ? 100 : undefined}
            step="0.01"
            value={form.discountValue}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                discountValue: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Minimum order (৳)
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.minOrderAmount}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                minOrderAmount: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        {form.discountType === "PERCENTAGE" && (
          <label className="text-sm font-medium">
            Maximum discount (৳, optional)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.maxDiscount}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  maxDiscount: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
        )}
        <label className="text-sm font-medium">
          Total uses (optional)
          <input
            type="number"
            min="1"
            step="1"
            value={form.usageLimit}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                usageLimit: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Expires at (optional)
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                expiresAt: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={isSaving}
          style={{ backgroundColor: settings.primaryColor }}
          className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {isSaving ? "Creating..." : "Create coupon"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Offer</th>
              <th className="px-4 py-3">Usage / Limit</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Loading coupons...
                </td>
              </tr>
            ) : coupons.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No coupons created yet.
                </td>
              </tr>
            ) : (
              coupons.map((coupon) => {
                const isExpired =
                  coupon.expiresAt !== null &&
                  checkedAt !== null &&
                  Date.parse(coupon.expiresAt) <= checkedAt;
                return (
                <tr key={coupon.id}>
                  <td className="px-4 py-3 font-bold">
                    <span className="inline-flex items-center gap-1.5">
                      {coupon.code}
                      <button
                        type="button"
                        onClick={() => void copyCouponCode(coupon.id, coupon.code)}
                        aria-label={`Copy coupon code ${coupon.code}`}
                        title="Copy code"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        {copiedId === coupon.id ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 font-semibold"
                    style={{ color: settings.primaryColor }}
                  >
                    {coupon.discountType === "PERCENTAGE"
                      ? `${coupon.discountValue}%`
                      : money(coupon.discountValue)}
                    {coupon.maxDiscount !== null &&
                      coupon.discountType === "PERCENTAGE" &&
                      ` (up to ${money(coupon.maxDiscount)})`}
                    {coupon.minOrderAmount > 0 &&
                      ` · min ${money(coupon.minOrderAmount)}`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="mb-1 text-xs text-gray-600">
                      {coupon.usedCount} used
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={Math.max(1, coupon.usedCount)}
                        step="1"
                        aria-label={`Usage limit for ${coupon.code}`}
                        placeholder="Unlimited"
                        value={
                          limitDrafts[coupon.id] ??
                          String(coupon.usageLimit ?? "")
                        }
                        onChange={(event) =>
                          setLimitDrafts((current) => ({
                            ...current,
                            [coupon.id]: event.target.value,
                          }))
                        }
                        disabled={pendingId === coupon.id}
                        className="w-24 rounded border px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        disabled={pendingId === coupon.id}
                        onClick={() => void saveUsageLimit(coupon)}
                        className="rounded border px-2 py-1 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {coupon.expiresAt
                      ? (
                          <span className={isExpired ? "font-semibold text-red-600" : ""}>
                            {new Date(coupon.expiresAt).toLocaleString()}
                            {isExpired ? " (Expired)" : ""}
                          </span>
                        )
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isExpired
                          ? "bg-red-100 text-red-700"
                          : coupon.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {isExpired
                        ? "Expired"
                        : coupon.isActive
                          ? "Active"
                          : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={pendingId === coupon.id}
                        onClick={() => toggleCoupon(coupon)}
                        className="rounded border px-2 py-1 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                      >
                        {coupon.isActive ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={pendingId === coupon.id}
                        onClick={() => deleteCoupon(coupon)}
                        aria-label={`Delete ${coupon.code}`}
                        className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
