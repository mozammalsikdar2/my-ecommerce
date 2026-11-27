"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSettings } from "@/context/SettingsContext";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Mail,
  Save,
  Send,
} from "lucide-react";

type EmailProvider = "SMTP" | "RESEND";

interface EmailForm {
  emailEnabled: boolean;
  provider: EmailProvider;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  resendApiKey: string;
  senderName: string;
  senderEmail: string;
  attachPdfInvoice: boolean;
  sendOnOrderCreate: boolean;
  sendOnStatusUpdate: boolean;
  smtpUserConfigured: boolean;
  smtpPassConfigured: boolean;
  resendApiKeyConfigured: boolean;
  encryptionConfigured: boolean;
  clearSmtpUser: boolean;
  clearSmtpPass: boolean;
  clearResendApiKey: boolean;
}

const initialForm: EmailForm = {
  emailEnabled: false,
  provider: "SMTP",
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  resendApiKey: "",
  senderName: "ALIF STORE",
  senderEmail: "",
  attachPdfInvoice: true,
  sendOnOrderCreate: true,
  sendOnStatusUpdate: true,
  smtpUserConfigured: false,
  smtpPassConfigured: false,
  resendApiKeyConfigured: false,
  encryptionConfigured: false,
  clearSmtpUser: false,
  clearSmtpPass: false,
  clearResendApiKey: false,
};

const providers: { id: EmailProvider; title: string; description: string }[] = [
  {
    id: "SMTP",
    title: "Custom SMTP Server",
    description: "Gmail App Password, Zoho, or cPanel SMTP",
  },
  {
    id: "RESEND",
    title: "Resend API",
    description: "Transactional email through Resend",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePublicSettings(value: unknown): Partial<EmailForm> {
  if (!isRecord(value)) throw new Error("Email settings response is invalid");
  if (
    typeof value.emailEnabled !== "boolean" ||
    (value.provider !== "SMTP" && value.provider !== "RESEND") ||
    typeof value.smtpHost !== "string" ||
    typeof value.smtpPort !== "number" ||
    typeof value.smtpSecure !== "boolean" ||
    typeof value.senderName !== "string" ||
    typeof value.senderEmail !== "string" ||
    typeof value.attachPdfInvoice !== "boolean" ||
    typeof value.sendOnOrderCreate !== "boolean" ||
    typeof value.sendOnStatusUpdate !== "boolean" ||
    typeof value.smtpUserConfigured !== "boolean" ||
    typeof value.smtpPassConfigured !== "boolean" ||
    typeof value.resendApiKeyConfigured !== "boolean" ||
    typeof value.encryptionConfigured !== "boolean"
  ) {
    throw new Error("Email settings response is invalid");
  }

  return {
    emailEnabled: value.emailEnabled,
    provider: value.provider,
    smtpHost: value.smtpHost,
    smtpPort: value.smtpPort,
    smtpSecure: value.smtpSecure,
    senderName: value.senderName,
    senderEmail: value.senderEmail,
    attachPdfInvoice: value.attachPdfInvoice,
    sendOnOrderCreate: value.sendOnOrderCreate,
    sendOnStatusUpdate: value.sendOnStatusUpdate,
    smtpUserConfigured: value.smtpUserConfigured,
    smtpPassConfigured: value.smtpPassConfigured,
    resendApiKeyConfigured: value.resendApiKeyConfigured,
    encryptionConfigured: value.encryptionConfigured,
  };
}

async function getErrorMessage(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  return isRecord(body) && typeof body.error === "string"
    ? body.error
    : fallback;
}

export default function AdminEmailSettingsPage() {
  const { settings } = useSettings();
  const [form, setForm] = useState(initialForm);
  const [showSecrets, setShowSecrets] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      try {
        const response = await fetch("/api/admin/email", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            await getErrorMessage(response, "Failed to load email settings"),
          );
        }
        const body: unknown = await response.json();
        if (!isRecord(body) || !("settings" in body)) {
          throw new Error("Email settings response is invalid");
        }
        const publicSettings = parsePublicSettings(body.settings);
        if (!controller.signal.aborted) {
          setForm((current) => ({ ...current, ...publicSettings }));
          setLoadError(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load email settings",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSettings();
    return () => controller.abort();
  }, []);

  const notify = (type: "success" | "error", text: string) => {
    setToast({ type, text });
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setToast(null);

    try {
      const payload = {
        emailEnabled: form.emailEnabled,
        provider: form.provider,
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort,
        smtpSecure: form.smtpSecure,
        smtpUser: form.smtpUser,
        smtpPass: form.smtpPass,
        resendApiKey: form.resendApiKey,
        senderName: form.senderName,
        senderEmail: form.senderEmail,
        attachPdfInvoice: form.attachPdfInvoice,
        sendOnOrderCreate: form.sendOnOrderCreate,
        sendOnStatusUpdate: form.sendOnStatusUpdate,
        clearSmtpUser: form.clearSmtpUser,
        clearSmtpPass: form.clearSmtpPass,
        clearResendApiKey: form.clearResendApiKey,
      };
      const response = await fetch("/api/admin/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, "Failed to save email settings"),
        );
      }

      const body: unknown = await response.json();
      if (!isRecord(body) || !("settings" in body)) {
        throw new Error("Email settings response is invalid");
      }
      const publicSettings = parsePublicSettings(body.settings);
      setForm((current) => ({
        ...current,
        ...publicSettings,
        smtpUser: "",
        smtpPass: "",
        resendApiKey: "",
        clearSmtpUser: false,
        clearSmtpPass: false,
        clearResendApiKey: false,
      }));
      notify("success", "Email and PDF invoice settings saved.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to save settings",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testRecipient.trim()) return;
    setSendingTest(true);
    setToast(null);

    try {
      const response = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testEmail: testRecipient.trim() }),
      });
      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, "Test email failed"),
        );
      }
      const body: unknown = await response.json();
      const message =
        isRecord(body) && typeof body.message === "string"
          ? body.message
          : "Test email sent.";
      notify("success", message);
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Test email failed",
      );
    } finally {
      setSendingTest(false);
    }
  };

  const setField = <K extends keyof EmailForm>(field: K, value: EmailForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  if (loading) {
    return (
      <div role="status" className="px-4 py-16 text-center text-sm text-gray-500">
        Loading email settings...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Mail
              style={{ color: settings.primaryColor }}
              className="h-6 w-6"
            />
            <h1 className="text-2xl font-extrabold text-gray-900">
              Email Notifications & PDF Invoice Settings
            </h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Configure SMTP or Resend for order emails and PDF invoices.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSecrets((current) => !current)}
          className="flex items-center gap-1.5 rounded-lg border bg-white px-3.5 py-2 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          {showSecrets ? (
            <>
              <EyeOff className="h-4 w-4" /> Hide Credentials
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" /> Show Credentials
            </>
          )}
        </button>
      </div>

      {loadError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </p>
      )}
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

      {!form.encryptionConfigured && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Configure PAYMENT_CREDENTIALS_ENCRYPTION_KEY on the server before saving credentials or enabling email.
        </p>
      )}

      <form
        onSubmit={handleSave}
        className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-base font-extrabold text-gray-900">
              Enable Customer Email Notifications
            </h2>
            <p className="text-xs text-gray-500">
              Sends automated emails when customers provide an email address at checkout.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={form.emailEnabled}
              onChange={(event) => setField("emailEnabled", event.target.checked)}
              className="h-5 w-5 rounded"
            />
            <span>{form.emailEnabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 block text-xs font-bold uppercase text-gray-700">
            Email Delivery Provider
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {providers.map((provider) => {
              const active = form.provider === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setField("provider", provider.id)}
                  style={
                    active
                      ? {
                          borderColor: settings.primaryColor,
                          backgroundColor: settings.primaryColor,
                          color: "#fff",
                        }
                      : undefined
                  }
                  className={`rounded-xl border p-3.5 text-left transition ${
                    active
                      ? "shadow-sm"
                      : "bg-gray-50 text-gray-800 hover:bg-gray-100"
                  }`}
                >
                  <span className="block text-sm font-extrabold">
                    {provider.title}
                  </span>
                  <span
                    className={`mt-0.5 block text-[11px] ${
                      active ? "text-white/85" : "text-gray-500"
                    }`}
                  >
                    {provider.description}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="sender-name"
              className="block text-xs font-bold text-gray-700"
            >
              Sender Display Name *
            </label>
            <input
              id="sender-name"
              type="text"
              required={form.emailEnabled}
              maxLength={100}
              value={form.senderName}
              onChange={(event) => setField("senderName", event.target.value)}
              className="mt-1 w-full rounded-lg border p-2.5 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="sender-email"
              className="block text-xs font-bold text-gray-700"
            >
              Sender From Email *
            </label>
            <input
              id="sender-email"
              type="email"
              required={form.emailEnabled}
              maxLength={254}
              placeholder="orders@yourdomain.com"
              value={form.senderEmail}
              onChange={(event) => setField("senderEmail", event.target.value)}
              className="mt-1 w-full rounded-lg border p-2.5 text-sm"
            />
          </div>
        </div>

        {form.provider === "SMTP" ? (
          <section className="space-y-4 rounded-xl border bg-gray-50 p-4">
            <h3 className="text-xs font-extrabold uppercase text-gray-700">
              SMTP Server Configuration
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="smtp-host" className="block text-xs font-bold text-gray-700">
                  SMTP Host
                </label>
                <input
                  id="smtp-host"
                  type="text"
                  maxLength={253}
                  placeholder="smtp.gmail.com"
                  value={form.smtpHost}
                  onChange={(event) => setField("smtpHost", event.target.value)}
                  className="mt-1 w-full rounded-lg border bg-white p-2.5 font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="smtp-port" className="block text-xs font-bold text-gray-700">
                  SMTP Port
                </label>
                <input
                  id="smtp-port"
                  type="number"
                  min={1}
                  max={65535}
                  required
                  value={form.smtpPort}
                  onChange={(event) =>
                    setField("smtpPort", Number(event.target.value))
                  }
                  className="mt-1 w-full rounded-lg border bg-white p-2.5 font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="smtp-user" className="block text-xs font-bold text-gray-700">
                  SMTP Username / Email
                </label>
                <input
                  id="smtp-user"
                  type="text"
                  autoComplete="off"
                  maxLength={320}
                  value={form.smtpUser}
                  onChange={(event) => {
                    setField("smtpUser", event.target.value);
                    if (event.target.value) setField("clearSmtpUser", false);
                  }}
                  placeholder={
                    form.smtpUserConfigured
                      ? "Saved; enter a new value to replace"
                      : "Username or email"
                  }
                  className="mt-1 w-full rounded-lg border bg-white p-2.5 font-mono text-xs"
                />
                {form.smtpUserConfigured && (
                  <label className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
                    <input
                      type="checkbox"
                      checked={form.clearSmtpUser}
                      onChange={(event) =>
                        setField("clearSmtpUser", event.target.checked)
                      }
                    />
                    Clear saved username
                  </label>
                )}
              </div>
              <div>
                <label htmlFor="smtp-pass" className="block text-xs font-bold text-gray-700">
                  SMTP Password / App Password
                </label>
                <input
                  id="smtp-pass"
                  type={showSecrets ? "text" : "password"}
                  autoComplete="new-password"
                  maxLength={500}
                  value={form.smtpPass}
                  onChange={(event) => {
                    setField("smtpPass", event.target.value);
                    if (event.target.value) setField("clearSmtpPass", false);
                  }}
                  placeholder={
                    form.smtpPassConfigured
                      ? "Saved; enter a new value to replace"
                      : "App password"
                  }
                  className="mt-1 w-full rounded-lg border bg-white p-2.5 font-mono text-xs"
                />
                {form.smtpPassConfigured && (
                  <label className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
                    <input
                      type="checkbox"
                      checked={form.clearSmtpPass}
                      onChange={(event) =>
                        setField("clearSmtpPass", event.target.checked)
                      }
                    />
                    Clear saved password
                  </label>
                )}
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.smtpSecure}
                    onChange={(event) =>
                      setField("smtpSecure", event.target.checked)
                    }
                    className="h-4 w-4 rounded"
                  />
                  <span>Use SSL/TLS (usually port 465)</span>
                </label>
              </div>
            </div>
          </section>
        ) : (
          <section className="space-y-3 rounded-xl border bg-gray-50 p-4">
            <h3 className="text-xs font-extrabold uppercase text-gray-700">
              Resend API Configuration
            </h3>
            <div>
              <label htmlFor="resend-key" className="block text-xs font-bold text-gray-700">
                Resend API Key
              </label>
              <input
                id="resend-key"
                type={showSecrets ? "text" : "password"}
                autoComplete="new-password"
                maxLength={500}
                placeholder={
                  form.resendApiKeyConfigured
                    ? "Saved; enter a new value to replace"
                    : "re_xxxxxxxxxxxxxxxxxxxxxxxx"
                }
                value={form.resendApiKey}
                onChange={(event) => {
                  setField("resendApiKey", event.target.value);
                  if (event.target.value) setField("clearResendApiKey", false);
                }}
                className="mt-1 w-full rounded-lg border bg-white p-2.5 font-mono text-xs"
              />
              {form.resendApiKeyConfigured && (
                <label className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={form.clearResendApiKey}
                    onChange={(event) =>
                      setField("clearResendApiKey", event.target.checked)
                    }
                  />
                  Clear saved API key
                </label>
              )}
            </div>
          </section>
        )}

        <div className="space-y-2.5 border-t pt-4">
          <label className="flex items-center gap-2.5 text-xs font-bold text-gray-800">
            <input
              type="checkbox"
              checked={form.attachPdfInvoice}
              onChange={(event) =>
                setField("attachPdfInvoice", event.target.checked)
              }
              className="h-4 w-4 rounded"
            />
            <FileText className="h-4 w-4 text-teal-700" />
            <span>Attach a generated PDF invoice to order emails</span>
          </label>
          <label className="flex items-center gap-2.5 text-xs font-bold text-gray-800">
            <input
              type="checkbox"
              checked={form.sendOnOrderCreate}
              onChange={(event) =>
                setField("sendOnOrderCreate", event.target.checked)
              }
              className="h-4 w-4 rounded"
            />
            <span>Send an email confirmation when an order is placed</span>
          </label>
          <label className="flex items-center gap-2.5 text-xs font-bold text-gray-800">
            <input
              type="checkbox"
              checked={form.sendOnStatusUpdate}
              onChange={(event) =>
                setField("sendOnStatusUpdate", event.target.checked)
              }
              className="h-4 w-4 rounded"
            />
            <span>Send emails when order status changes</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{ backgroundColor: settings.primaryColor }}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? "Saving..." : "Save Email & PDF Settings"}</span>
        </button>
      </form>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-base font-extrabold text-gray-900">
          Test Email & PDF Invoice Delivery
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Save your settings first, then send a sample invoice to verify delivery.
          Test delivery is available even when automatic notifications are disabled.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            aria-label="Test recipient email"
            type="email"
            required
            placeholder="Enter a recipient email address"
            value={testRecipient}
            onChange={(event) => setTestRecipient(event.target.value)}
            className="flex-1 rounded-xl border p-2.5 text-sm"
          />
          <button
            type="button"
            disabled={sendingTest || !testRecipient.trim()}
            onClick={() => void handleSendTest()}
            className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-gray-800 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{sendingTest ? "Sending..." : "Send Test Email + PDF"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
