"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { ArrowLeft, CheckCircle2, MessageSquare, Save, Truck } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

const subscribeToOrigin = () => () => {};
const getOriginSnapshot = () => window.location.origin;
const getServerOriginSnapshot = () => "";

interface LogisticsSettings {
  steadfastEnabled: boolean;
  steadfastApiKeyConfigured: boolean;
  steadfastSecretKeyConfigured: boolean;
  steadfastWebhookSecretConfigured: boolean;
  pathaoEnabled: boolean;
  pathaoSandbox: boolean;
  pathaoClientIdConfigured: boolean;
  pathaoClientSecretConfigured: boolean;
  pathaoUsernameConfigured: boolean;
  pathaoPasswordConfigured: boolean;
  pathaoWebhookSecretConfigured: boolean;
  pathaoStoreId: number;
  pathaoDefaultCityId: number;
  pathaoDefaultZoneId: number;
  smsEnabled: boolean;
  smsProvider: "BULKSMSBD" | "CUSTOM_GET";
  smsApiUrl: string;
  smsApiKeyConfigured: boolean;
  smsSenderId: string;
  orderConfirmTemplate: string;
  orderShippedTemplate: string;
  encryptionConfigured: boolean;
}

interface LogisticsCredentials {
  steadfastApiKey: string;
  steadfastSecretKey: string;
  steadfastWebhookSecret: string;
  pathaoClientId: string;
  pathaoClientSecret: string;
  pathaoUsername: string;
  pathaoPassword: string;
  pathaoWebhookSecret: string;
  smsApiKey: string;
}

const emptyCredentials: LogisticsCredentials = {
  steadfastApiKey: "",
  steadfastSecretKey: "",
  steadfastWebhookSecret: "",
  pathaoClientId: "",
  pathaoClientSecret: "",
  pathaoUsername: "",
  pathaoPassword: "",
  pathaoWebhookSecret: "",
  smsApiKey: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLogisticsSettings(value: unknown): value is LogisticsSettings {
  return (
    isRecord(value) &&
    typeof value.steadfastEnabled === "boolean" &&
    typeof value.steadfastApiKeyConfigured === "boolean" &&
    typeof value.steadfastSecretKeyConfigured === "boolean" &&
    typeof value.steadfastWebhookSecretConfigured === "boolean" &&
    typeof value.pathaoEnabled === "boolean" &&
    typeof value.pathaoSandbox === "boolean" &&
    typeof value.pathaoClientIdConfigured === "boolean" &&
    typeof value.pathaoClientSecretConfigured === "boolean" &&
    typeof value.pathaoUsernameConfigured === "boolean" &&
    typeof value.pathaoPasswordConfigured === "boolean" &&
    typeof value.pathaoWebhookSecretConfigured === "boolean" &&
    typeof value.pathaoStoreId === "number" &&
    typeof value.pathaoDefaultCityId === "number" &&
    typeof value.pathaoDefaultZoneId === "number" &&
    typeof value.smsEnabled === "boolean" &&
    (value.smsProvider === "BULKSMSBD" ||
      value.smsProvider === "CUSTOM_GET") &&
    typeof value.smsApiUrl === "string" &&
    typeof value.smsApiKeyConfigured === "boolean" &&
    typeof value.smsSenderId === "string" &&
    typeof value.orderConfirmTemplate === "string" &&
    typeof value.orderShippedTemplate === "string" &&
    typeof value.encryptionConfigured === "boolean"
  );
}

async function getApiError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string") return body.error;
  } catch {
    // Keep the generic message for non-JSON responses.
  }
  return fallback;
}

export default function AdminLogisticsPage() {
  const { settings: siteSettings } = useSettings();
  const [form, setForm] = useState<LogisticsSettings | null>(null);
  const [credentials, setCredentials] =
    useState<LogisticsCredentials>(emptyCredentials);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getOriginSnapshot,
    getServerOriginSnapshot,
  );
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const steadfastWebhookUrl = origin
    ? `${origin}/api/webhooks/steadfast`
    : "";
  const pathaoWebhookUrl = origin ? `${origin}/api/webhooks/pathao` : "";

  useEffect(() => {
    return () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSettings() {
      try {
        const response = await fetch("/api/admin/logistics", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            await getApiError(response, "Unable to load logistics settings"),
          );
        }
        const result: unknown = await response.json();
        if (!isRecord(result) || !isLogisticsSettings(result.settings)) {
          throw new Error("Logistics settings response is invalid");
        }
        setForm(result.settings);
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load logistics settings",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSettings();
    return () => controller.abort();
  }, []);

  function setBoolean(
    field: "steadfastEnabled" | "pathaoEnabled" | "pathaoSandbox" | "smsEnabled",
    value: boolean,
  ) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  }

  function updateCredential(field: keyof LogisticsCredentials, value: string) {
    setCredentials((current) => ({ ...current, [field]: value }));
  }

  function generateSecret(
    field: "steadfastWebhookSecret" | "pathaoWebhookSecret",
  ) {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const token = `whsec_${Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}`;
    updateCredential(field, token);
    setNotice("Secret generated. Copy it before saving; saved secrets cannot be viewed again.");
    setError(null);
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(key);
      setError(null);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopiedUrl(null), 1800);
    } catch {
      setError("Could not copy to clipboard. Check browser clipboard permissions.");
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/logistics", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steadfastEnabled: form.steadfastEnabled,
          steadfastApiKey: credentials.steadfastApiKey,
          steadfastSecretKey: credentials.steadfastSecretKey,
          steadfastWebhookSecret: credentials.steadfastWebhookSecret,
          pathaoEnabled: form.pathaoEnabled,
          pathaoSandbox: form.pathaoSandbox,
          pathaoClientId: credentials.pathaoClientId,
          pathaoClientSecret: credentials.pathaoClientSecret,
          pathaoUsername: credentials.pathaoUsername,
          pathaoPassword: credentials.pathaoPassword,
          pathaoWebhookSecret: credentials.pathaoWebhookSecret,
          pathaoStoreId: form.pathaoStoreId,
          pathaoDefaultCityId: form.pathaoDefaultCityId,
          pathaoDefaultZoneId: form.pathaoDefaultZoneId,
          smsEnabled: form.smsEnabled,
          smsProvider: form.smsProvider,
          smsApiUrl: form.smsApiUrl,
          smsApiKey: credentials.smsApiKey,
          smsSenderId: form.smsSenderId,
          orderConfirmTemplate: form.orderConfirmTemplate,
          orderShippedTemplate: form.orderShippedTemplate,
        }),
      });
      if (!response.ok) {
        throw new Error(
          await getApiError(response, "Unable to save logistics settings"),
        );
      }
      const result: unknown = await response.json();
      if (!isRecord(result) || !isLogisticsSettings(result.settings)) {
        throw new Error("Logistics settings response is invalid");
      }
      setForm(result.settings);
      setCredentials(emptyCredentials);
      setNotice("Courier and SMS settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save logistics settings",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        Loading logistics settings...
      </div>
    );
  }

  if (!form) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error ?? "Logistics settings could not be loaded."}
        </p>
        <Link href="/admin" className="text-sm font-semibold text-teal-800">
          Return to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Admin dashboard
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">
              Courier and SMS settings
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Configure parcel booking and order notifications. Provider
              credentials are encrypted and never returned to the browser.
            </p>
          </div>
          <Truck className="h-8 w-8 shrink-0 text-teal-700" />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4" />
          {notice}
        </div>
      )}
      {!form.encryptionConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Set <code>PAYMENT_CREDENTIALS_ENCRYPTION_KEY</code> to a base64-encoded
          32-byte key before saving credentials or enabling integrations.
        </div>
      )}

      <form onSubmit={saveSettings} className="space-y-5">
        <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              Steadfast courier
            </h2>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.steadfastEnabled}
                onChange={(event) =>
                  setBoolean("steadfastEnabled", event.target.checked)
                }
                className="h-4 w-4 accent-teal-700"
              />
              Enable Steadfast
            </label>
          </div>
          {(
            [
              ["steadfastApiKey", "API key", form.steadfastApiKeyConfigured],
              [
                "steadfastSecretKey",
                "Secret key",
                form.steadfastSecretKeyConfigured,
              ],
            ] as const
          ).map(([field, label, configured]) => (
            <label
              key={field}
              className="block text-sm font-medium text-slate-700"
            >
              {label}
              <input
                type="password"
                autoComplete="new-password"
                value={credentials[field]}
                onChange={(event) =>
                  updateCredential(field, event.target.value)
                }
                placeholder={
                  configured ? "Saved securely — leave blank to keep" : `Enter ${label.toLowerCase()}`
                }
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
          ))}
          <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
            <div className="text-xs font-extrabold uppercase text-emerald-700">
              Steadfast webhook endpoint
            </div>
            <div>
              <label
                htmlFor="steadfastWebhookUrl"
                className="block text-xs font-semibold text-slate-600"
              >
                Callback URL
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="steadfastWebhookUrl"
                  type="text"
                  readOnly
                  value={steadfastWebhookUrl}
                  className="w-full rounded-lg border bg-white p-2 font-mono text-xs text-slate-700"
                />
                <button
                  type="button"
                  disabled={!steadfastWebhookUrl}
                  onClick={() => void copyText("sf", steadfastWebhookUrl)}
                  className="shrink-0 rounded-lg border bg-white px-3 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"
                >
                  {copiedUrl === "sf" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="steadfastWebhookSecret"
                  className="block text-xs font-semibold text-slate-600"
                >
                  Webhook bearer token
                </label>
                <button
                  type="button"
                  onClick={() => generateSecret("steadfastWebhookSecret")}
                  style={{ color: siteSettings.primaryColor }}
                  className="text-xs font-bold hover:underline"
                >
                  Generate token
                </button>
              </div>
              <input
                id="steadfastWebhookSecret"
                type="password"
                autoComplete="new-password"
                value={credentials.steadfastWebhookSecret}
                onChange={(event) =>
                  updateCredential("steadfastWebhookSecret", event.target.value)
                }
                placeholder={
                  form.steadfastWebhookSecretConfigured
                    ? "Saved securely — leave blank to keep"
                    : "Set the same bearer token in Steadfast"
                }
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Configure this token as the Authorization bearer token in the
                Steadfast portal.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              Pathao courier
            </h2>
            <div className="flex gap-5">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.pathaoSandbox}
                  onChange={(event) =>
                    setBoolean("pathaoSandbox", event.target.checked)
                  }
                  className="h-4 w-4 accent-teal-700"
                />
                Sandbox
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.pathaoEnabled}
                  onChange={(event) =>
                    setBoolean("pathaoEnabled", event.target.checked)
                  }
                  className="h-4 w-4 accent-teal-700"
                />
                Enable Pathao
              </label>
            </div>
          </div>
          {(
            [
              ["pathaoClientId", "Client ID", form.pathaoClientIdConfigured],
              [
                "pathaoClientSecret",
                "Client secret",
                form.pathaoClientSecretConfigured,
              ],
              ["pathaoUsername", "Merchant username", form.pathaoUsernameConfigured],
              ["pathaoPassword", "Merchant password", form.pathaoPasswordConfigured],
            ] as const
          ).map(([field, label, configured]) => (
            <label
              key={field}
              className="block text-sm font-medium text-slate-700"
            >
              {label}
              <input
                type={
                  field === "pathaoClientId" || field === "pathaoUsername"
                    ? "text"
                    : "password"
                }
                autoComplete="new-password"
                value={credentials[field]}
                onChange={(event) =>
                  updateCredential(field, event.target.value)
                }
                placeholder={
                  configured ? "Saved securely — leave blank to keep" : `Enter ${label.toLowerCase()}`
                }
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
          ))}
          <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
            <div className="text-xs font-extrabold uppercase text-red-600">
              Pathao webhook endpoint
            </div>
            <div>
              <label
                htmlFor="pathaoWebhookUrl"
                className="block text-xs font-semibold text-slate-600"
              >
                Callback URL
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="pathaoWebhookUrl"
                  type="text"
                  readOnly
                  value={pathaoWebhookUrl}
                  className="w-full rounded-lg border bg-white p-2 font-mono text-xs text-slate-700"
                />
                <button
                  type="button"
                  disabled={!pathaoWebhookUrl}
                  onClick={() => void copyText("pa", pathaoWebhookUrl)}
                  className="shrink-0 rounded-lg border bg-white px-3 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"
                >
                  {copiedUrl === "pa" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="pathaoWebhookSecret"
                  className="block text-xs font-semibold text-slate-600"
                >
                  Webhook signature secret
                </label>
                <button
                  type="button"
                  onClick={() => generateSecret("pathaoWebhookSecret")}
                  style={{ color: siteSettings.primaryColor }}
                  className="text-xs font-bold hover:underline"
                >
                  Generate secret
                </button>
              </div>
              <input
                id="pathaoWebhookSecret"
                type="password"
                autoComplete="new-password"
                value={credentials.pathaoWebhookSecret}
                onChange={(event) =>
                  updateCredential("pathaoWebhookSecret", event.target.value)
                }
                placeholder={
                  form.pathaoWebhookSecretConfigured
                    ? "Saved securely — leave blank to keep"
                    : "Enter the Pathao webhook secret"
                }
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Pathao delivery updates are confirmed against its live order-status
                API.
              </p>
            </div>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Pathao store ID
            <input
              type="number"
              min={0}
              step={1}
              value={form.pathaoStoreId}
              onChange={(event) =>
                setForm((current) =>
                  current
                    ? {
                        ...current,
                        pathaoStoreId: Number(event.target.value),
                      }
                    : current,
                )
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["pathaoDefaultCityId", "Default city ID"],
                ["pathaoDefaultZoneId", "Default zone ID"],
              ] as const
            ).map(([field, label]) => (
              <label
                key={field}
                className="block text-sm font-medium text-slate-700"
              >
                {label}
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form[field]}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, [field]: Number(event.target.value) }
                        : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare
                className="h-5 w-5"
                style={{ color: siteSettings.primaryColor }}
              />
              <h2 className="text-lg font-bold text-slate-900">
                Order SMS gateway
              </h2>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.smsEnabled}
                onChange={(event) =>
                  setBoolean("smsEnabled", event.target.checked)
                }
                className="h-4 w-4 accent-teal-700"
              />
              Enable SMS
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Provider
            <select
              value={form.smsProvider}
              onChange={(event) =>
                setForm((current) =>
                  current
                    ? {
                        ...current,
                        smsProvider: event.target.value as LogisticsSettings["smsProvider"],
                      }
                    : current,
                )
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="BULKSMSBD">BulkSMSBD</option>
              <option value="CUSTOM_GET">Custom HTTP GET</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            SMS endpoint URL (HTTPS)
            <input
              type="url"
              value={form.smsApiUrl}
              onChange={(event) =>
                setForm((current) =>
                  current
                    ? { ...current, smsApiUrl: event.target.value }
                    : current,
                )
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            SMS API key
            <input
              type="password"
              autoComplete="new-password"
              value={credentials.smsApiKey}
              onChange={(event) =>
                updateCredential("smsApiKey", event.target.value)
              }
              placeholder={
                form.smsApiKeyConfigured
                  ? "Saved securely — leave blank to keep"
                  : "Enter SMS API key"
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Sender ID
            <input
              type="text"
              value={form.smsSenderId}
              onChange={(event) =>
                setForm((current) =>
                  current ? { ...current, smsSenderId: event.target.value } : current,
                )
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Confirmation SMS template (sent when staff confirms the order)
            <textarea
              rows={3}
              value={form.orderConfirmTemplate}
              onChange={(event) =>
                setForm((current) =>
                  current
                    ? { ...current, orderConfirmTemplate: event.target.value }
                    : current,
                )
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Variables: {"{customerName}"}, {"{orderNumber}"},{" "}
              {"{totalAmount}"}, {"{storeName}"}, {"{trackUrl}"}
            </span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Shipped SMS template
            <textarea
              rows={3}
              value={form.orderShippedTemplate}
              onChange={(event) =>
                setForm((current) =>
                  current
                    ? { ...current, orderShippedTemplate: event.target.value }
                    : current,
                )
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Variables: {"{customerName}"}, {"{orderNumber}"}, {"{courier}"},{" "}
              {"{trackingCode}"}
            </span>
          </label>
        </section>

        <button
          type="submit"
          disabled={saving}
          style={{ backgroundColor: siteSettings.primaryColor }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save courier and SMS settings"}
        </button>
      </form>
    </div>
  );
}
