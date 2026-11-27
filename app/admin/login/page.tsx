"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { settings } = useSettings();
  const { user, loading, refreshUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeChannel, setChallengeChannel] = useState<"EMAIL" | "SMS" | null>(
    null,
  );
  const [maskedDestination, setMaskedDestination] = useState<string | null>(
    null,
  );
  const [otp, setOtp] = useState("");
  const requestedPath = searchParams.get("redirect");
  const destination =
    requestedPath?.startsWith("/admin/") &&
    requestedPath !== "/admin/login" &&
    !requestedPath.includes("\\")
      ? requestedPath
      : "/admin";

  useEffect(() => {
    if (
      !loading &&
      (user?.role === "ADMIN" || user?.role === "MODERATOR")
    ) {
      router.replace("/admin");
    }
  }, [loading, router, user]);

  const finishAdminLogin = async (result: unknown) => {
    const user =
      typeof result === "object" && result !== null && "user" in result
        ? result.user
        : null;
    if (
      typeof user !== "object" ||
      user === null ||
      !("role" in user) ||
      (user.role !== "ADMIN" && user.role !== "MODERATOR")
    ) {
      await fetch("/api/auth/admin/logout", { method: "POST" });
      throw new Error("An admin or moderator account is required");
    }

    try {
      await refreshUser();
    } catch (refreshError) {
      await fetch("/api/auth/admin/logout", { method: "POST" });
      throw refreshError;
    }

    setPassword("");
    setChallengeToken(null);
    setOtp("");
    router.replace(destination);
  };

  const requestAdminLogin = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/admin/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Unable to sign in";
        throw new Error(message);
      }

      if (
        typeof result === "object" &&
        result !== null &&
        "requires2fa" in result &&
        result.requires2fa === true
      ) {
        if (
          !("challengeToken" in result) ||
          typeof result.challengeToken !== "string" ||
          !("channel" in result) ||
          (result.channel !== "EMAIL" && result.channel !== "SMS") ||
          !("maskedDestination" in result) ||
          typeof result.maskedDestination !== "string"
        ) {
          throw new Error("The server returned an invalid verification challenge");
        }
        setChallengeToken(result.challengeToken);
        setChallengeChannel(result.channel);
        setMaskedDestination(result.maskedDestination);
        setOtp("");
        return;
      }

      await finishAdminLogin(result);
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyAdminLogin = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/admin/verify-2fa", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, otp }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Unable to verify the code";
        throw new Error(message);
      }

      await finishAdminLogin(result);
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "Unable to verify the code. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void requestAdminLogin();
  };

  const handleVerify2fa = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void verifyAdminLogin();
  };

  const handleResendCode = () => {
    setOtp("");
    void requestAdminLogin();
  };

  return (
    <div className="flex min-h-[85vh] items-center justify-center bg-gray-950 px-4 py-12">
      <form
        onSubmit={challengeToken ? handleVerify2fa : handleAdminLogin}
        className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8 text-white shadow-2xl"
      >
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 transition hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to {settings.storeName}</span>
        </Link>

        <div className="flex items-center gap-3">
          <div
            style={{ backgroundColor: settings.primaryColor }}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
          >
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
              Restricted Access
            </span>
            <h1 className="text-xl font-extrabold text-white">
              Admin Login Dashboard
            </h1>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-400">
          {challengeToken
            ? `Enter the verification code sent by ${challengeChannel === "SMS" ? "SMS" : "email"} to ${maskedDestination}.`
            : "Sign in with your Administrator or Moderator credentials to manage products, orders, payments, and site settings."}
        </p>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-500/40 bg-red-950/60 p-3.5 text-xs font-semibold text-red-300"
          >
            {error}
          </p>
        )}

        <div className="mt-6 space-y-4">
          {!challengeToken ? (
            <>
          <div>
            <label
              htmlFor="admin-email"
              className="block text-xs font-bold text-gray-300"
            >
              Admin Email Address *
            </label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                maxLength={254}
                required
                placeholder="admin@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 py-2.5 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:border-gray-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="block text-xs font-bold text-gray-300"
            >
              Password *
            </label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 py-2.5 pl-9 pr-10 text-sm text-white placeholder-gray-500 focus:border-gray-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            <div className="mt-2 flex justify-end">
              <Link
                href="/forgot-password"
                className="text-xs font-bold text-amber-400 hover:underline"
              >
                Forgot Password?
              </Link>
            </div>
          </div>
            </>
          ) : (
            <>
              <div>
                <label
                  htmlFor="admin-otp"
                  className="block text-xs font-bold text-gray-300"
                >
                  Six-digit verification code
                </label>
                <input
                  id="admin-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-center text-lg tracking-[0.4em] text-white focus:border-gray-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleResendCode}
                className="text-xs font-semibold text-amber-400 hover:underline disabled:opacity-50"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => {
                  setChallengeToken(null);
                  setChallengeChannel(null);
                  setMaskedDestination(null);
                  setPassword("");
                  setOtp("");
                  setError(null);
                }}
                disabled={isSubmitting}
                className="text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50"
              >
                Back to admin sign in
              </button>
            </>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{ backgroundColor: settings.primaryColor }}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>
              {isSubmitting
                ? challengeToken
                  ? "Verifying..."
                  : "Authenticating..."
                : challengeToken
                  ? "Verify and Sign In"
                  : "Access Admin Dashboard"}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 border-t border-gray-800 pt-4 text-center text-xs text-gray-500">
          Shopping as a customer?{" "}
          <Link href="/login" className="font-bold text-gray-300 hover:underline">
            Go to User Login
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[85vh] items-center justify-center bg-gray-950 text-sm text-gray-400">
          Loading Admin Portal...
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
