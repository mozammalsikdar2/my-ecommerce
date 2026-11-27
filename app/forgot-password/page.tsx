"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Mail,
  Smartphone,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

type ApiResponse = {
  error?: string;
  message?: string;
};

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {};
  }
  const record = body as Record<string, unknown>;
  return {
    error: typeof record.error === "string" ? record.error : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
  };
}

export default function ForgotPasswordPage() {
  const { settings } = useSettings();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [channel, setChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [completed, setCompleted] = useState(false);

  const handleSendCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, identifier }),
      });
      const data = await readApiResponse(response);

      if (!response.ok) {
        setError(data.error || "Unable to send reset code.");
        return;
      }

      setInfoMessage(
        data.message || "If an active account matches, a reset code will be sent.",
      );
      setStep(2);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          identifier,
          otp,
          newPassword,
        }),
      });
      const data = await readApiResponse(response);

      if (!response.ok) {
        setError(data.error || "Password reset failed.");
        return;
      }

      setCompleted(true);
      window.setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (completed) {
    return (
      <div className="mx-auto flex min-h-[75vh] max-w-md items-center px-4 py-12">
        <div className="w-full rounded-2xl border bg-white p-8 text-center shadow-sm">
          <CheckCircle2
            aria-hidden="true"
            className="mx-auto h-14 w-14 text-green-600"
          />
          <h1 className="mt-4 text-2xl font-extrabold text-gray-900">
            Password Updated
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Your password has been reset. You can now sign in with your new
            password.
          </p>
          <Link
            href="/login"
            style={{ backgroundColor: settings.primaryColor }}
            className="mt-6 inline-block rounded-xl px-6 py-2.5 text-sm font-bold text-white"
          >
            Sign In Now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md items-center px-4 py-12">
      <div className="w-full rounded-2xl border bg-white p-8 shadow-sm">
        <Link
          href="/login"
          className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-black"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          <span>Back to Login</span>
        </Link>

        <div className="flex items-center gap-2">
          <KeyRound
            aria-hidden="true"
            style={{ color: settings.primaryColor }}
            className="h-6 w-6"
          />
          <h1 className="text-2xl font-extrabold text-gray-900">
            Reset Password
          </h1>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {step === 1
            ? "Choose how you would like to receive your 6-digit recovery code."
            : "Enter the 6-digit code and choose a new password."}
        </p>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"
          >
            {error}
          </div>
        )}

        {infoMessage && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-xs font-semibold text-green-800"
          >
            {infoMessage}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleSendCode} className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setChannel("EMAIL");
                  setIdentifier("");
                  setError("");
                  setInfoMessage("");
                }}
                aria-pressed={channel === "EMAIL"}
                style={
                  channel === "EMAIL"
                    ? {
                        borderColor: settings.primaryColor,
                        backgroundColor: settings.primaryColor,
                        color: "#ffffff",
                      }
                    : {}
                }
                className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold transition disabled:opacity-50 ${
                  channel === "EMAIL"
                    ? "shadow-sm"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Mail aria-hidden="true" className="h-4 w-4" />
                <span>Via Email</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setChannel("SMS");
                  setIdentifier("");
                  setError("");
                  setInfoMessage("");
                }}
                aria-pressed={channel === "SMS"}
                style={
                  channel === "SMS"
                    ? {
                        borderColor: settings.primaryColor,
                        backgroundColor: settings.primaryColor,
                        color: "#ffffff",
                      }
                    : {}
                }
                className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold transition disabled:opacity-50 ${
                  channel === "SMS"
                    ? "shadow-sm"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Smartphone aria-hidden="true" className="h-4 w-4" />
                <span>Via SMS</span>
              </button>
            </div>

            <div>
              <label
                htmlFor="recovery-identifier"
                className="block text-xs font-bold text-gray-700"
              >
                {channel === "EMAIL"
                  ? "Registered Email Address"
                  : "Registered Mobile Number"}
              </label>
              <input
                id="recovery-identifier"
                type={channel === "EMAIL" ? "email" : "tel"}
                autoComplete={channel === "EMAIL" ? "email" : "tel"}
                inputMode={channel === "SMS" ? "tel" : undefined}
                required
                maxLength={254}
                placeholder={
                  channel === "EMAIL" ? "you@example.com" : "017XXXXXXXX"
                }
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                className="mt-1 w-full rounded-xl border p-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ backgroundColor: settings.primaryColor }}
              className="w-full rounded-xl py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Sending Code..." : "Send 6-Digit Reset Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="recovery-otp"
                  className="block text-xs font-bold text-gray-700"
                >
                  6-Digit Verification Code
                </label>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setStep(1);
                    setOtp("");
                    setError("");
                    setInfoMessage("");
                  }}
                  style={{ color: settings.primaryColor }}
                  className="text-[11px] font-bold hover:underline disabled:opacity-50"
                >
                  Change {channel === "EMAIL" ? "Email" : "Number"}
                </button>
              </div>
              <input
                id="recovery-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, ""))
                }
                className="mt-1 w-full rounded-xl border p-2.5 text-center font-mono text-lg font-extrabold tracking-widest"
              />
            </div>

            <div>
              <label
                htmlFor="new-password"
                className="block text-xs font-bold text-gray-700"
              >
                New Password (at least 8 characters, 72-byte maximum)
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border p-2.5 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs font-bold text-gray-700"
              >
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border p-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ backgroundColor: settings.primaryColor }}
              className="w-full rounded-xl py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Updating Password..." : "Reset Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
