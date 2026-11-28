"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import LuxuryAuthShell from "@/components/LuxuryAuthShell";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
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
  const isDesignPreview = searchParams.get("preview") === "1";
  const destination =
    requestedPath?.startsWith("/admin/") &&
    requestedPath !== "/admin/login" &&
    !requestedPath.includes("\\")
      ? requestedPath
      : "/admin";

  useEffect(() => {
    if (
      !loading &&
      !isDesignPreview &&
      (user?.role === "ADMIN" || user?.role === "MODERATOR")
    ) {
      router.replace("/admin");
    }
  }, [isDesignPreview, loading, router, user]);

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
    <LuxuryAuthShell
      backText={settings.adminLoginBackText}
      badgeText={settings.adminLoginBadgeText}
    >
      <div className="text-center">
        <div
          style={{ color: settings.loginGoldColor }}
          className="text-[10px] font-bold uppercase tracking-[0.22em]"
        >
          {challengeToken ? "Two-Factor Verification" : settings.adminLoginEyebrow}
        </div>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white">
          {challengeToken ? "Enter Security Code" : settings.adminLoginTitle}
        </h1>
        <p className="mx-auto mt-2 max-w-[330px] text-xs leading-relaxed text-gray-300">
          {challengeToken
            ? `Enter the 6-digit verification code sent via ${challengeChannel} to ${maskedDestination}.`
            : settings.adminLoginSubtitle}
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-400/40 bg-red-950/60 px-3.5 py-2.5 text-xs font-medium text-red-200"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={challengeToken ? handleVerify2fa : handleAdminLogin}
        className="mt-5 space-y-4"
      >
          {!challengeToken ? (
            <>
              <div>
                <label htmlFor="admin-email" className="block text-xs font-medium text-gray-200">
                  {settings.adminEmailLabel} <span className="text-amber-400">*</span>
                </label>
                <div className="relative mt-1.5">
                  <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
                  <input
                    id="admin-email"
                    type="email"
                    autoComplete="username"
                    maxLength={254}
                    required
                    placeholder={settings.adminEmailPlaceholder}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/35 py-2.5 pl-10 pr-3 text-sm text-white placeholder-gray-400 transition focus:border-amber-400/70 focus:bg-black/50 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-password" className="block text-xs font-medium text-gray-200">
                  {settings.adminPasswordLabel} <span className="text-amber-400">*</span>
                </label>
                <div className="relative mt-1.5">
                  <Lock aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
                  <input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/35 py-2.5 pl-10 pr-10 text-sm text-white placeholder-gray-400 transition focus:border-amber-400/70 focus:bg-black/50 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3.5 top-3 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-2 flex justify-end">
                  <Link
                    href="/forgot-password"
                    style={{ color: settings.loginGoldColor }}
                    className="text-xs font-medium opacity-90 hover:underline hover:opacity-100"
                  >
                    {settings.adminForgotText}
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="admin-otp" className="block text-xs font-medium text-gray-200">
                6-Digit Security Code <span className="text-amber-400">*</span>
              </label>
              <input
                id="admin-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                placeholder="000000"
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="mt-1.5 w-full rounded-lg border border-white/20 bg-black/45 p-3 text-center font-mono text-2xl font-extrabold tracking-[0.4em] text-white focus:border-amber-400 focus:outline-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || (challengeToken !== null && otp.length !== 6)}
            style={{
              background: `linear-gradient(90deg, ${settings.loginGoldColor} 0%, ${settings.loginGoldColor} 42%, ${settings.loginEmeraldColor} 100%)`,
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-extrabold text-gray-950 shadow-[0_8px_25px_rgba(229,184,66,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>
              {isSubmitting
                ? challengeToken
                  ? "Verifying..."
                  : "Authenticating..."
                : challengeToken
                  ? "Verify & Open Admin Dashboard"
                  : settings.adminButtonText}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>

        {challengeToken ? (
          <div className="flex items-center justify-between pt-1 text-xs">
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
              className="inline-flex items-center gap-1 text-gray-300 hover:text-white disabled:opacity-50"
            >
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              <span>Back to admin sign in</span>
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleResendCode}
              style={{ color: settings.loginGoldColor }}
              className="font-semibold hover:underline disabled:opacity-50"
            >
              Resend Code
            </button>
          </div>
        ) : settings.showAdminUserSwitchLink && (
          <div className="pt-2 text-center text-xs text-gray-300">
            {settings.adminSwitchPrompt}{" "}
            <Link href="/login" className="font-semibold text-white underline-offset-4 hover:underline">
              {settings.adminSwitchLinkText}
            </Link>
          </div>
        )}
      </form>
    </LuxuryAuthShell>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#061014] text-xs text-gray-300">
          Loading Admin Portal...
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
