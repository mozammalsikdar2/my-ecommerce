"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Activity, ArrowLeft, BarChart3, Save, ShieldCheck, Tags } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

interface MarketingSettings {
  ga4Enabled: boolean;
  ga4MeasurementId: string;
  gtmEnabled: boolean;
  gtmContainerId: string;
  metaPixelEnabled: boolean;
  metaPixelId: string;
  metaCapiAccessTokenConfigured: boolean;
  metaTestEventCode: string;
  encryptionConfigured: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMarketingSettings(value: unknown): value is MarketingSettings {
  return (
    isRecord(value) &&
    typeof value.ga4Enabled === "boolean" &&
    typeof value.ga4MeasurementId === "string" &&
    typeof value.gtmEnabled === "boolean" &&
    typeof value.gtmContainerId === "string" &&
    typeof value.metaPixelEnabled === "boolean" &&
    typeof value.metaPixelId === "string" &&
    typeof value.metaCapiAccessTokenConfigured === "boolean" &&
    typeof value.metaTestEventCode === "string" &&
    typeof value.encryptionConfigured === "boolean"
  );
}

async function readSettings(response: Response): Promise<MarketingSettings> {
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Marketing settings request failed (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(
      isRecord(result) && typeof result.error === "string"
        ? result.error
        : `Marketing settings request failed (${response.status}).`,
    );
  }
  if (!isRecord(result) || !isMarketingSettings(result.settings)) {
    throw new Error("Marketing settings response is invalid.");
  }
  return result.settings;
}

export default function AdminMarketingPage() {
  const { settings: siteSettings } = useSettings();
  const [settings, setSettings] = useState<MarketingSettings | null>(null);
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSettings() {
      try {
        const response = await fetch("/api/admin/marketing", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await readSettings(response);
        if (!controller.signal.aborted) setSettings(data);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load marketing settings.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSettings();
    return () => controller.abort();
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || saving) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/marketing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ga4Enabled: settings.ga4Enabled,
          ga4MeasurementId: settings.ga4MeasurementId,
          gtmEnabled: settings.gtmEnabled,
          gtmContainerId: settings.gtmContainerId,
          metaPixelEnabled: settings.metaPixelEnabled,
          metaPixelId: settings.metaPixelId,
          metaTestEventCode: settings.metaTestEventCode,
          ...(clearToken
            ? { clearMetaCapiAccessToken: true }
            : token.trim()
              ? { metaCapiAccessToken: token }
              : {}),
        }),
      });
      const data = await readSettings(response);
      setSettings(data);
      setToken("");
      setClearToken(false);
      setNotice("GA4, Google Tag Manager & Meta tracking settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save marketing settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div role="status" className="py-20 text-center text-sm text-slate-500">
        Loading marketing settings...
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error ?? "Marketing settings could not be loaded."}
        </p>
        <Link href="/admin" className="text-sm font-semibold text-teal-800 hover:underline">
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
        <div className="mt-3 flex items-center gap-2">
          <BarChart3 style={{ color: siteSettings.primaryColor }} className="h-6 w-6" />
          <h1 className="text-2xl font-extrabold text-gray-900">
            Analytics, Tag Manager &amp; Pixel Settings
          </h1>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Connect Google Analytics 4, Google Tag Manager, and Meta Pixel/CAPI for storefront tracking.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800">
          {notice}
        </p>
      )}
      {!settings.encryptionConfigured && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Set <code>PAYMENT_CREDENTIALS_ENCRYPTION_KEY</code> to a base64-encoded
          32-byte key before saving or using a CAPI access token.
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <fieldset disabled={saving} className="space-y-6 disabled:opacity-70">
          <section className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-amber-600" />
                <div>
                  <h2 className="text-base font-extrabold text-gray-900">
                    1. Google Analytics 4 (GA4)
                  </h2>
                  <p className="text-xs text-gray-500">
                    Tracks pageviews and e-commerce events (view_item, add_to_cart, begin_checkout, purchase).
                  </p>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={settings.ga4Enabled}
                  onChange={(event) =>
                    setSettings({ ...settings, ga4Enabled: event.target.checked })
                  }
                  className="h-5 w-5 rounded"
                />
                <span>{settings.ga4Enabled ? "Enabled" : "Disabled"}</span>
              </label>
            </div>

            <div>
              <label htmlFor="ga4-measurement-id" className="block text-xs font-bold text-gray-700">
                GA4 Measurement ID
              </label>
              <input
                id="ga4-measurement-id"
                type="text"
                maxLength={50}
                placeholder="G-XXXXXXXXXX"
                value={settings.ga4MeasurementId}
                onChange={(event) =>
                  setSettings({ ...settings, ga4MeasurementId: event.target.value })
                }
                className="mt-1 w-full rounded-lg border p-2.5 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Found in Google Analytics under Admin &rarr; Data Streams &rarr; Web Stream Details.
              </p>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3">
              <div className="flex items-center gap-2">
                <Tags className="h-5 w-5 text-blue-600" />
                <div>
                  <h2 className="text-base font-extrabold text-gray-900">
                    2. Google Tag Manager (GTM)
                  </h2>
                  <p className="text-xs text-gray-500">
                    Loads GTM and receives e-commerce dataLayer pushes when direct GA4 is disabled.
                  </p>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={settings.gtmEnabled}
                  onChange={(event) =>
                    setSettings({ ...settings, gtmEnabled: event.target.checked })
                  }
                  className="h-5 w-5 rounded"
                />
                <span>{settings.gtmEnabled ? "Enabled" : "Disabled"}</span>
              </label>
            </div>

            <div>
              <label htmlFor="gtm-container-id" className="block text-xs font-bold text-gray-700">
                GTM Container ID
              </label>
              <input
                id="gtm-container-id"
                type="text"
                maxLength={50}
                placeholder="GTM-XXXXXXX"
                value={settings.gtmContainerId}
                onChange={(event) =>
                  setSettings({ ...settings, gtmContainerId: event.target.value })
                }
                className="mt-1 w-full rounded-lg border p-2.5 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                If both GA4 and GTM are enabled, e-commerce events are sent directly to GA4 to avoid duplicate events.
              </p>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
              <div>
                <h2 className="text-base font-extrabold text-gray-900">
                  3. Meta (Facebook) Pixel &amp; Conversions API
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Enables the browser Pixel. Server-side CAPI also requires an access token.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={settings.metaPixelEnabled}
                  onChange={(event) =>
                    setSettings({ ...settings, metaPixelEnabled: event.target.checked })
                  }
                  className="h-5 w-5 rounded"
                />
                <span>{settings.metaPixelEnabled ? "Active" : "Disabled"}</span>
              </label>
            </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="meta-pixel-id" className="block text-xs font-bold text-gray-700">
                Meta Pixel ID (Dataset ID)
              </label>
              <input
                id="meta-pixel-id"
                type="text"
                inputMode="numeric"
                maxLength={50}
                placeholder="e.g., 123456789012345"
                value={settings.metaPixelId}
                onChange={(event) =>
                  setSettings({ ...settings, metaPixelId: event.target.value })
                }
                className="mt-1 w-full rounded-lg border p-2.5 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Required when tracking is enabled; digits only.
              </p>
            </div>

            <div>
              <label htmlFor="meta-capi-token" className="block text-xs font-bold text-gray-700">
                Conversions API access token
              </label>
              <input
                id="meta-capi-token"
                type="password"
                autoComplete="new-password"
                maxLength={4000}
                disabled={clearToken}
                placeholder={
                  settings.metaCapiAccessTokenConfigured
                    ? "Token configured; leave blank to keep it"
                    : "Enter an access token"
                }
                value={token}
                onChange={(event) => setToken(event.target.value)}
                className="mt-1 w-full rounded-lg border p-2.5 font-mono text-xs disabled:bg-gray-100"
              />
              <p className="mt-1 text-xs text-gray-500">
                {settings.metaCapiAccessTokenConfigured
                  ? "A token is stored securely and cannot be viewed. Enter a new token to replace it."
                  : "No token is configured. CAPI events will not be sent until one is saved."}
              </p>
              {settings.metaCapiAccessTokenConfigured && (
                <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={clearToken}
                    onChange={(event) => {
                      setClearToken(event.target.checked);
                      if (event.target.checked) setToken("");
                    }}
                    className="h-4 w-4 rounded"
                  />
                  Remove the saved access token when saving
                </label>
              )}
              <p className="mt-2 text-xs text-gray-500">
                Generate a token in Meta Events Manager under Settings &rarr;
                Conversions API.
              </p>
            </div>

            <div>
              <label htmlFor="meta-test-code" className="block text-xs font-bold text-gray-700">
                Test event code (optional)
              </label>
              <input
                id="meta-test-code"
                type="text"
                maxLength={100}
                placeholder="e.g., TEST48291"
                value={settings.metaTestEventCode}
                onChange={(event) =>
                  setSettings({ ...settings, metaTestEventCode: event.target.value })
                }
                className="mt-1 w-full rounded-lg border p-2.5 font-mono text-xs"
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave empty when not using Meta&apos;s Test Events tool.
              </p>
            </div>
          </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
              <span>Customer email and phone values sent through CAPI are SHA-256 hashed.</span>
            </div>
            <button
              type="submit"
              style={{ backgroundColor: siteSettings.primaryColor }}
              className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save All Tracking Settings"}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
