"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CreditCard, Save } from "lucide-react";

interface PaymentSettings {
  codEnabled: boolean;
  bkashEnabled: boolean;
  bkashSandbox: boolean;
  bkashAppKeyConfigured: boolean;
  bkashAppSecretConfigured: boolean;
  bkashUsernameConfigured: boolean;
  bkashPasswordConfigured: boolean;
  stripeEnabled: boolean;
  stripePublishableKey: string;
  stripeSecretKeyConfigured: boolean;
  stripeCurrency: string;
  nagadEnabled: false;
  sslEnabled: false;
  encryptionConfigured: boolean;
}

interface PaymentCredentials {
  bkashAppKey: string;
  bkashAppSecret: string;
  bkashUsername: string;
  bkashPassword: string;
  stripeSecretKey: string;
}

const emptyCredentials: PaymentCredentials = {
  bkashAppKey: "",
  bkashAppSecret: "",
  bkashUsername: "",
  bkashPassword: "",
  stripeSecretKey: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPaymentSettings(value: unknown): value is PaymentSettings {
  return (
    isRecord(value) &&
    typeof value.codEnabled === "boolean" &&
    typeof value.bkashEnabled === "boolean" &&
    typeof value.bkashSandbox === "boolean" &&
    typeof value.bkashAppKeyConfigured === "boolean" &&
    typeof value.bkashAppSecretConfigured === "boolean" &&
    typeof value.bkashUsernameConfigured === "boolean" &&
    typeof value.bkashPasswordConfigured === "boolean" &&
    typeof value.stripeEnabled === "boolean" &&
    typeof value.stripePublishableKey === "string" &&
    typeof value.stripeSecretKeyConfigured === "boolean" &&
    typeof value.stripeCurrency === "string" &&
    value.nagadEnabled === false &&
    value.sslEnabled === false &&
    typeof value.encryptionConfigured === "boolean"
  );
}

export default function AdminPaymentsPage() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [credentials, setCredentials] =
    useState<PaymentCredentials>(emptyCredentials);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const response = await fetch("/api/admin/payments", {
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            isRecord(result) && typeof result.error === "string"
              ? result.error
              : "Unable to load payment settings",
          );
        }
        if (
          !isRecord(result) ||
          !isPaymentSettings(result.settings)
        ) {
          throw new Error("Payment settings response is invalid");
        }
        if (active) setSettings(result.settings);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load payment settings",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSettings();
    return () => {
      active = false;
    };
  }, []);

  function updateCredential(field: keyof PaymentCredentials, value: string) {
    setCredentials((current) => ({ ...current, [field]: value }));
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codEnabled: settings.codEnabled,
          bkashEnabled: settings.bkashEnabled,
          bkashSandbox: settings.bkashSandbox,
          ...credentials,
          stripeEnabled: settings.stripeEnabled,
          stripePublishableKey: settings.stripePublishableKey,
          stripeCurrency: "bdt",
          nagadEnabled: false,
          sslEnabled: false,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          isRecord(result) && typeof result.error === "string"
            ? result.error
            : "Unable to save payment settings",
        );
      }
      if (!isRecord(result) || !isPaymentSettings(result.settings)) {
        throw new Error("Payment settings response is invalid");
      }
      setSettings(result.settings);
      setCredentials(emptyCredentials);
      setNotice("Payment settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save payment settings",
      );
    } finally {
      setSaving(false);
    }
  }

  const setBoolean = (field: keyof PaymentSettings, value: boolean) => {
    setSettings((current) =>
      current ? { ...current, [field]: value } : current,
    );
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        Loading payment settings...
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error ?? "Payment settings could not be loaded."}
        </p>
        <Link href="/admin" className="text-sm font-semibold text-teal-800">
          Return to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Admin dashboard
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-slate-950">
            Payment settings
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure checkout methods. Provider secrets are encrypted and never
            returned to the browser.
          </p>
        </div>
        <CreditCard className="h-8 w-8 text-teal-700" />
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
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}
      {!settings.encryptionConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Set <code>PAYMENT_CREDENTIALS_ENCRYPTION_KEY</code> to a base64-encoded
          32-byte key before enabling online payments.
        </div>
      )}

      <form onSubmit={saveSettings} className="space-y-5">
        <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Cash on delivery</h2>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={settings.codEnabled}
              onChange={(event) =>
                setBoolean("codEnabled", event.target.checked)
              }
              className="h-4 w-4 accent-teal-700"
            />
            Enable cash on delivery
          </label>
        </section>

        <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">bKash</h2>
              <p className="text-sm text-slate-500">
                Tokenized Checkout
                {[
                  settings.bkashAppKeyConfigured,
                  settings.bkashAppSecretConfigured,
                  settings.bkashUsernameConfigured,
                  settings.bkashPasswordConfigured,
                ].every(Boolean)
                  ? " · Credentials saved"
                  : ""}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.bkashSandbox}
                onChange={(event) =>
                  setBoolean("bkashSandbox", event.target.checked)
                }
                className="h-4 w-4 accent-teal-700"
              />
              Sandbox
            </label>
          </div>
          {(
            [
              ["bkashAppKey", "App key"],
              ["bkashAppSecret", "App secret"],
              ["bkashUsername", "Username"],
              ["bkashPassword", "Password"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="block text-sm font-medium text-slate-700">
              {label}
              <input
                type="password"
                autoComplete="new-password"
                value={credentials[field]}
                onChange={(event) => updateCredential(field, event.target.value)}
                placeholder={
                  settings[`${field}Configured` as keyof PaymentSettings]
                    ? "Saved securely — leave blank to keep"
                    : `Enter ${label.toLowerCase()}`
                }
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
          ))}
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={settings.bkashEnabled}
              onChange={(event) =>
                setBoolean("bkashEnabled", event.target.checked)
              }
              className="h-4 w-4 accent-teal-700"
            />
            Enable bKash
          </label>
        </section>

        <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Stripe</h2>
            <p className="text-sm text-slate-500">
              Hosted Checkout
              {settings.stripeSecretKeyConfigured ? " · Secret key saved" : ""}
            </p>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Publishable key
            <input
              type="text"
              value={settings.stripePublishableKey}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? { ...current, stripePublishableKey: event.target.value }
                    : current,
                )
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Secret key
            <input
              type="password"
              autoComplete="new-password"
              value={credentials.stripeSecretKey}
              onChange={(event) =>
                updateCredential("stripeSecretKey", event.target.value)
              }
              placeholder={
                settings.stripeSecretKeyConfigured
                  ? "Saved securely — leave blank to keep"
                  : "Enter Stripe secret key"
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <p className="text-sm text-slate-600">
            Currency: <strong>Bangladeshi taka (BDT)</strong>
          </p>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={settings.stripeEnabled}
              onChange={(event) =>
                setBoolean("stripeEnabled", event.target.checked)
              }
              className="h-4 w-4 accent-teal-700"
            />
            Enable Stripe
          </label>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-lg font-bold text-slate-900">
            Not available yet
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Nagad and SSLCommerz are intentionally disabled until their official
            provider flows are verified.
          </p>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save payment settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
