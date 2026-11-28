"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import LuxuryAuthShell from "@/components/LuxuryAuthShell";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  User,
} from "lucide-react";

type AccountForm = {
  name: string;
  email: string;
  loginIdentifier: string;
  phone: string;
  password: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default function LoginPage() {
  const { settings } = useSettings();
  const { refreshUser } = useAuth();
  const router = useRouter();

  const [registrationRequested, setIsRegister] = useState(false);
  const isRegister = registrationRequested && settings.userRegistrationEnabled;
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<AccountForm>({
    name: "",
    email: "",
    loginIdentifier: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [showAdminLoginLink, setShowAdminLoginLink] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setShowAdminLoginLink(false);
    setSubmitting(true);

    try {
      const endpoint = isRegister
        ? "/api/auth/register"
        : "/api/auth/user/login";
      const body = isRegister
        ? {
            name: form.name,
            email: form.email,
            phone: form.phone,
            password: form.password,
          }
        : {
            identifier: form.loginIdentifier,
            password: form.password,
          };
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (isRecord(data) && data.redirectToAdmin === true) {
          setShowAdminLoginLink(true);
        }
        const message =
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Authentication failed";
        throw new Error(message);
      }

      if (isRecord(data) && data.requiresAdminLogin === true) {
        router.replace("/admin/login?registered=1");
        return;
      }

      const user = isRecord(data) ? data.user : null;
      if (
        !isRecord(user) ||
        (user.role !== "ADMIN" &&
          user.role !== "MODERATOR" &&
          user.role !== "CUSTOMER")
      ) {
        await fetch("/api/auth/user/logout", { method: "POST" });
        throw new Error("Authentication response did not contain a valid user");
      }

      try {
        await refreshUser();
      } catch (refreshError) {
        await fetch("/api/auth/user/logout", { method: "POST" });
        throw refreshError;
      }

      const requestedPath = new URLSearchParams(window.location.search).get(
        "redirect",
      );
      const destination =
        requestedPath &&
        (requestedPath === "/account" ||
          requestedPath.startsWith("/account/")) &&
        !requestedPath.includes("\\")
          ? requestedPath
          : "/account";
      router.replace(destination);
      router.refresh();
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Authentication failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const updateForm = (field: keyof AccountForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <LuxuryAuthShell
      backText={settings.userLoginBackText}
      badgeText={settings.userLoginBadgeText}
    >
        <div className="text-center">
          <p
            style={{ color: settings.loginGoldColor }}
            className="text-[10px] font-bold uppercase tracking-[0.22em]"
          >
            {settings.userLoginEyebrow}
          </p>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white">
            {isRegister ? settings.userRegisterTitle : settings.userLoginTitle}
          </h1>
          <p className="mx-auto mt-2 max-w-[330px] text-xs leading-relaxed text-gray-300">
            {isRegister
              ? settings.userRegisterSubtitle
              : settings.userLoginSubtitle}
          </p>
        </div>

        {settings.userRegistrationEnabled && (
        <div className="mt-4 grid grid-cols-2 rounded-lg border border-white/10 bg-black/35 p-1">
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              setError(null);
              setShowAdminLoginLink(false);
            }}
            style={!isRegister ? { backgroundColor: `${settings.loginGoldColor}25`, color: settings.loginGoldColor } : undefined}
            className={`rounded-md py-1.5 text-xs font-bold transition ${
              !isRegister ? "shadow-xs" : "text-gray-400 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegister(true);
              setError(null);
              setShowAdminLoginLink(false);
            }}
            style={isRegister ? { backgroundColor: `${settings.loginGoldColor}25`, color: settings.loginGoldColor } : undefined}
            className={`rounded-md py-1.5 text-xs font-bold transition ${
              isRegister ? "shadow-xs" : "text-gray-400 hover:text-white"
            }`}
          >
            Register
          </button>
        </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-400/40 bg-red-950/60 px-3.5 py-2.5 text-xs font-medium text-red-200"
          >
            <p>{error}</p>
            {showAdminLoginLink && settings.showUserAdminSwitchLink && (
              <Link
                href="/admin/login"
                className="mt-1.5 inline-block font-extrabold underline"
              >
                Go to Admin Login Dashboard →
              </Link>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {isRegister && (
            <>
              <div>
                <label
                  htmlFor="register-name"
                  className="block text-xs font-medium text-gray-200"
                >
                  Full Name <span className="text-amber-400">*</span>
                </label>
                <div className="relative mt-1.5">
                  <User aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
                  <input
                    id="register-name"
                    type="text"
                    autoComplete="name"
                    required
                    maxLength={100}
                    placeholder="Enter your full name"
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/35 py-2.5 pl-10 pr-3 text-sm text-white placeholder-gray-400 focus:border-amber-400/70 focus:bg-black/50 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="register-phone"
                  className="block text-xs font-medium text-gray-200"
                >
                  Mobile Number <span className="text-amber-400">*</span>
                </label>
                <div className="relative mt-1.5">
                  <Phone aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
                  <input
                    id="register-phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    maxLength={32}
                    placeholder="017XXXXXXXX"
                    value={form.phone}
                    onChange={(event) =>
                      updateForm("phone", event.target.value)
                    }
                    className="w-full rounded-lg border border-white/15 bg-black/35 py-2.5 pl-10 pr-3 text-sm text-white placeholder-gray-400 focus:border-amber-400/70 focus:bg-black/50 focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label
              htmlFor={isRegister ? "account-email" : "account-identifier"}
              className="block text-xs font-medium text-gray-200"
            >
              {settings.userEmailLabel}{!isRegister && " / Phone Number"} <span className="text-amber-400">*</span>
            </label>
            <div className="relative mt-1.5">
              <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
              <input
                id={isRegister ? "account-email" : "account-identifier"}
                type={isRegister ? "email" : "text"}
                autoComplete={isRegister ? "email" : "username"}
                required
                maxLength={254}
                placeholder={
                  isRegister ? settings.userEmailPlaceholder : `${settings.userEmailPlaceholder} / 017XXXXXXXX`
                }
                value={isRegister ? form.email : form.loginIdentifier}
                onChange={(event) =>
                  updateForm(
                    isRegister ? "email" : "loginIdentifier",
                    event.target.value,
                  )
                }
                className="w-full rounded-lg border border-white/15 bg-black/35 py-2.5 pl-10 pr-3 text-sm text-white placeholder-gray-400 focus:border-amber-400/70 focus:bg-black/50 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="account-password"
              className="block text-xs font-medium text-gray-200"
            >
              {settings.userPasswordLabel} <span className="text-amber-400">*</span>
            </label>
            <div className="relative mt-1.5">
              <Lock aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
              <input
                id="account-password"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={isRegister ? 8 : undefined}
                placeholder="••••••••"
                value={form.password}
                onChange={(event) =>
                  updateForm("password", event.target.value)
                }
                className="w-full rounded-lg border border-white/15 bg-black/35 py-2.5 pl-10 pr-10 text-sm text-white placeholder-gray-400 focus:border-amber-400/70 focus:bg-black/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  setShowPassword((current) => !current)
                }
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3.5 top-3 text-gray-400 hover:text-white"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {!isRegister && (
              <div className="mt-2 flex justify-end">
                <Link
                  href="/forgot-password"
                  style={{ color: settings.loginGoldColor }}
                  className="text-xs font-medium opacity-90 hover:underline hover:opacity-100"
                >
                  {settings.userForgotText}
                </Link>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              background: `linear-gradient(90deg, ${settings.loginGoldColor} 0%, ${settings.loginGoldColor} 42%, ${settings.loginEmeraldColor} 100%)`,
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-extrabold text-gray-950 shadow-[0_8px_25px_rgba(229,184,66,0.28)] transition hover:brightness-110 disabled:opacity-50"
          >
            <span>
              {submitting
                ? "Please wait..."
                : isRegister
                  ? settings.userRegisterButtonText
                  : settings.userButtonText}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
        {settings.showUserAdminSwitchLink && (
          <div className="mt-4 pt-2 text-center text-xs text-gray-300">
            {settings.userSwitchPrompt}{" "}
            <Link href="/admin/login" className="font-semibold text-white underline-offset-4 hover:underline">
              {settings.userSwitchLinkText}
            </Link>
          </div>
        )}
    </LuxuryAuthShell>
  );
}
