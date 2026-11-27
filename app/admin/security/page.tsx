"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSettings } from "@/context/SettingsContext";
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Search,
  ShieldCheck,
  Trash2,
  Save,
} from "lucide-react";

interface Admin2faProfile {
  id: string;
  email: string;
  phone: string | null;
  twoFactorEnabled: boolean;
  twoFactorChannel: "EMAIL" | "SMS";
}

interface BlockedPhoneRecord {
  id: string;
  phone: string;
  reason: string;
  orderNumber: string | null;
  blockedBy: string | null;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAdminProfile(value: unknown): Admin2faProfile | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.email !== "string" ||
    (value.phone !== null && typeof value.phone !== "string") ||
    typeof value.twoFactorEnabled !== "boolean" ||
    (value.twoFactorChannel !== "EMAIL" && value.twoFactorChannel !== "SMS")
  ) {
    return null;
  }
  return {
    id: value.id,
    email: value.email,
    phone: value.phone,
    twoFactorEnabled: value.twoFactorEnabled,
    twoFactorChannel: value.twoFactorChannel,
  };
}

function parseBlockedPhones(value: unknown): BlockedPhoneRecord[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: (BlockedPhoneRecord | null)[] = value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.phone !== "string" ||
      typeof item.reason !== "string" ||
      (item.orderNumber !== null && typeof item.orderNumber !== "string") ||
      (item.blockedBy !== null && typeof item.blockedBy !== "string") ||
      typeof item.createdAt !== "string" ||
      Number.isNaN(Date.parse(item.createdAt))
    ) {
      return null;
    }
    return {
      id: item.id,
      phone: item.phone,
      reason: item.reason,
      orderNumber: item.orderNumber,
      blockedBy: item.blockedBy,
      createdAt: item.createdAt,
    };
  });
  if (parsed.some((item) => item === null)) return null;
  return parsed.filter(
    (item): item is BlockedPhoneRecord => item !== null,
  );
}

function getErrorMessage(data: unknown, status: number) {
  return isRecord(data) && typeof data.error === "string"
    ? data.error
    : `Request failed (${status})`;
}

async function getResponseError(response: Response) {
  const data: unknown = await response.json().catch(() => null);
  return getErrorMessage(data, response.status);
}

async function fetchSecurityData(signal?: AbortSignal) {
  const response = await fetch("/api/admin/security", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(await getResponseError(response));

  const data: unknown = await response.json();
  if (!isRecord(data)) {
    throw new Error("Security API returned invalid data");
  }
  const adminProfile = parseAdminProfile(data.adminProfile);
  const parsedBlockedPhones = parseBlockedPhones(data.blockedPhones);
  if (!adminProfile || !parsedBlockedPhones) {
    throw new Error("Security API returned invalid profile or blocklist data");
  }
  return { adminProfile, blockedPhones: parsedBlockedPhones };
}

export default function AdminSecurityPage() {
  const { settings } = useSettings();
  const [profile, setProfile] = useState<Admin2faProfile | null>(null);
  const [blockedPhones, setBlockedPhones] = useState<BlockedPhoneRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newReason, setNewReason] = useState("Fake / Refused Cash on Delivery");
  const [cancelPending, setCancelPending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving2fa, setSaving2fa] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadSecurityData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchSecurityData(signal);
      setProfile(data.adminProfile);
      setBlockedPhones(data.blockedPhones);
    } catch (error) {
      if (!signal?.aborted) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load security settings",
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchSecurityData(controller.signal)
      .then((data) => {
        setProfile(data.adminProfile);
        setBlockedPhones(data.blockedPhones);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load security settings",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const notify = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 4500);
  };

  const handleSave2fa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;
    setSaving2fa(true);
    try {
      const response = await fetch("/api/admin/security", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twoFactorEnabled: profile.twoFactorEnabled,
          twoFactorChannel: profile.twoFactorChannel,
          phone: profile.phone ?? "",
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, response.status));
      }
      if (!isRecord(data) || !("adminProfile" in data)) {
        throw new Error("Security API returned an invalid updated profile");
      }
      const updatedProfile = parseAdminProfile(data.adminProfile);
      if (!updatedProfile) {
        throw new Error("Security API returned an invalid updated profile");
      }
      setProfile(updatedProfile);
      notify(
        "success",
        typeof data.message === "string"
          ? data.message
          : "Two-factor settings saved",
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to update 2FA settings",
      );
    } finally {
      setSaving2fa(false);
    }
  };

  const handleBlockPhone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBlocking(true);
    try {
      const response = await fetch("/api/admin/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: newPhone,
          reason: newReason,
          cancelPendingOrders: cancelPending,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, response.status));
      }

      setNewPhone("");
      notify(
        "success",
        isRecord(data) && typeof data.message === "string"
          ? data.message
          : "Phone number blocked",
      );
      await loadSecurityData();
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to block phone number",
      );
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblock = async (record: BlockedPhoneRecord) => {
    if (
      !window.confirm(
        `Unblock ${record.phone} and allow them to place orders again?`,
      )
    ) {
      return;
    }

    setUnblockingId(record.id);
    try {
      const response = await fetch(
        `/api/admin/security?id=${encodeURIComponent(record.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await getResponseError(response));
      notify("success", `Unblocked ${record.phone}.`);
      await loadSecurityData();
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to unblock phone number",
      );
    } finally {
      setUnblockingId(null);
    }
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredBlocked = blockedPhones.filter(
    (record) =>
      record.phone.includes(searchQuery.trim()) ||
      record.reason.toLowerCase().includes(normalizedSearch),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck
            style={{ color: settings.primaryColor }}
            className="h-6 w-6"
          />
          <h1 className="text-2xl font-extrabold text-gray-900">
            Admin Security &amp; Phone Blocklist
          </h1>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Configure admin two-factor authentication and manage numbers blocked
          from placing orders.
        </p>
      </div>

      {toast && (
        <div
          role={toast.type === "error" ? "alert" : "status"}
          className={`flex items-center gap-2 rounded-xl border p-4 text-sm font-semibold ${
            toast.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{toast.text}</span>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadSecurityData()}
            disabled={loading}
            className="rounded-lg border border-red-300 px-3 py-1.5 font-semibold hover:bg-red-100 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Retry"}
          </button>
        </div>
      )}

      <form
        onSubmit={handleSave2fa}
        className="space-y-5 rounded-2xl border bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-2.5">
            <KeyRound
              style={{ color: settings.primaryColor }}
              className="h-5 w-5"
            />
            <div>
              <h2 className="text-base font-extrabold text-gray-900">
                Admin Two-Factor Authentication
              </h2>
              <p className="text-xs text-gray-500">
                A six-digit code is required after password verification when
                2FA is enabled.
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={profile?.twoFactorEnabled ?? false}
              disabled={!profile || loading || saving2fa}
              onChange={(event) =>
                setProfile((current) =>
                  current
                    ? { ...current, twoFactorEnabled: event.target.checked }
                    : current,
                )
              }
              className="h-5 w-5 rounded"
            />
            <span>
              {profile?.twoFactorEnabled ? "2FA Enabled" : "2FA Off"}
            </span>
          </label>
        </div>

        {loading && !profile ? (
          <p role="status" className="text-sm text-gray-500">
            Loading admin security settings...
          </p>
        ) : (
          <fieldset
            disabled={!profile || loading || saving2fa}
            className="space-y-5 disabled:opacity-60"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="admin-security-email"
                  className="block text-xs font-bold text-gray-700"
                >
                  Admin Account Email
                </label>
                <input
                  id="admin-security-email"
                  type="email"
                  disabled
                  value={profile?.email ?? ""}
                  className="mt-1 w-full rounded-lg border bg-gray-100 p-2.5 text-sm text-gray-500"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-security-phone"
                  className="block text-xs font-bold text-gray-700"
                >
                  Admin Mobile Number (for SMS 2FA)
                </label>
                <input
                  id="admin-security-phone"
                  type="tel"
                  maxLength={32}
                  placeholder="017XXXXXXXX"
                  value={profile?.phone ?? ""}
                  onChange={(event) =>
                    setProfile((current) =>
                      current
                        ? { ...current, phone: event.target.value }
                        : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border p-2.5 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-security-channel"
                  className="block text-xs font-bold text-gray-700"
                >
                  2FA Delivery Method
                </label>
                <select
                  id="admin-security-channel"
                  value={profile?.twoFactorChannel ?? "EMAIL"}
                  onChange={(event) =>
                    setProfile((current) =>
                      current
                        ? {
                            ...current,
                            twoFactorChannel:
                              event.target.value === "SMS" ? "SMS" : "EMAIL",
                          }
                        : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border bg-white p-2.5 text-sm font-bold"
                >
                  <option value="EMAIL">
                    Email OTP ({profile?.email ?? "admin email"})
                  </option>
                  <option value="SMS">SMS OTP (Bangladeshi mobile)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!profile || loading || saving2fa}
                style={{ backgroundColor: settings.primaryColor }}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{saving2fa ? "Saving..." : "Save 2FA Settings"}</span>
              </button>
            </div>
          </fieldset>
        )}
      </form>

      <section className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2.5 border-b pb-4">
          <Ban className="h-5 w-5 text-red-600" />
          <div>
            <h2 className="text-base font-extrabold text-gray-900">
              Blocked Order Phones ({blockedPhones.length})
            </h2>
            <p className="text-xs text-gray-500">
              Numbers on this list cannot place orders. Automatic cancellation
              affects unpaid pending orders only.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleBlockPhone}
          className="grid grid-cols-1 gap-4 rounded-xl border bg-red-50/40 p-4 sm:grid-cols-4"
        >
          <div>
            <label
              htmlFor="blocked-phone"
              className="block text-xs font-bold text-gray-700"
            >
              Bangladeshi Phone Number *
            </label>
            <input
              id="blocked-phone"
              type="tel"
              required
              maxLength={64}
              placeholder="017XXXXXXXX"
              value={newPhone}
              onChange={(event) => setNewPhone(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-white p-2.5 font-mono text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="blocked-reason"
              className="block text-xs font-bold text-gray-700"
            >
              Reason for Blocking
            </label>
            <input
              id="blocked-reason"
              type="text"
              maxLength={250}
              value={newReason}
              onChange={(event) => setNewReason(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-white p-2.5 text-sm"
            />
          </div>

          <div className="flex flex-col justify-end">
            <button
              type="submit"
              disabled={blocking || loading}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2.5 text-xs font-bold text-white shadow hover:bg-red-700 disabled:opacity-50"
            >
              <Ban className="h-4 w-4" />
              <span>{blocking ? "Blocking..." : "Block Number"}</span>
            </button>
          </div>

          <div className="sm:col-span-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={cancelPending}
                onChange={(event) => setCancelPending(event.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span>
                Cancel unpaid pending orders from this number and restore stock
                and coupon usage
              </span>
            </label>
          </div>
        </form>

        <div className="space-y-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="search"
              aria-label="Search blocked phone numbers"
              placeholder="Search blocked numbers..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-xs"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-gray-50 uppercase text-gray-600">
                <tr>
                  <th scope="col" className="px-4 py-3">Blocked Phone</th>
                  <th scope="col" className="px-4 py-3">Reason</th>
                  <th scope="col" className="px-4 py-3">Ref Order</th>
                  <th scope="col" className="px-4 py-3">Blocked By</th>
                  <th scope="col" className="px-4 py-3">Date</th>
                  <th scope="col" className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && blockedPhones.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      Loading blocked numbers...
                    </td>
                  </tr>
                ) : filteredBlocked.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      No blocked mobile numbers found.
                    </td>
                  </tr>
                ) : (
                  filteredBlocked.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-extrabold text-red-700">
                        {record.phone}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{record.reason}</td>
                      <td className="px-4 py-3 font-mono text-gray-500">
                        {record.orderNumber || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {record.blockedBy || "Admin"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        <time dateTime={record.createdAt}>
                          {new Date(record.createdAt).toLocaleDateString()}
                        </time>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleUnblock(record)}
                          disabled={unblockingId !== null || loading}
                          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          <span>
                            {unblockingId === record.id ? "Unblocking..." : "Unblock"}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
