"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
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

  const [isRegister, setIsRegister] = useState(false);
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
    <div className="mx-auto flex min-h-[80vh] max-w-md items-center px-4 py-12">
      <div className="w-full rounded-2xl border bg-white p-8 shadow-sm">
        <div className="text-center">
          <div
            style={{
              backgroundColor: `${settings.primaryColor}15`,
              color: settings.primaryColor,
            }}
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
          >
            <User className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-gray-900">
            {isRegister ? "Create Customer Account" : "Login Account"}
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            {isRegister
              ? `Join ${settings.storeName} to track orders and save your wishlist.`
              : `Log in to your ${settings.storeName} account to view orders and profile.`}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              setError(null);
              setShowAdminLoginLink(false);
            }}
            className={`rounded-lg py-2 text-xs font-bold transition ${
              !isRegister
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Login Account
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegister(true);
              setError(null);
              setShowAdminLoginLink(false);
            }}
            className={`rounded-lg py-2 text-xs font-bold transition ${
              isRegister
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"
          >
            <p>{error}</p>
            {showAdminLoginLink && (
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
                  className="block text-xs font-bold text-gray-700"
                >
                  Full Name *
                </label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    id="register-name"
                    type="text"
                    autoComplete="name"
                    required
                    maxLength={100}
                    placeholder="Enter your full name"
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="register-phone"
                  className="block text-xs font-bold text-gray-700"
                >
                  Mobile Number *
                </label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
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
                    className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label
              htmlFor={isRegister ? "account-email" : "account-identifier"}
              className="block text-xs font-bold text-gray-700"
            >
              {isRegister ? "Email Address *" : "Email or Phone Number *"}
            </label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                id={isRegister ? "account-email" : "account-identifier"}
                type={isRegister ? "email" : "text"}
                autoComplete={isRegister ? "email" : "username"}
                required
                maxLength={254}
                placeholder={
                  isRegister ? "you@example.com" : "Email or 017XXXXXXXX"
                }
                value={isRegister ? form.email : form.loginIdentifier}
                onChange={(event) =>
                  updateForm(
                    isRegister ? "email" : "loginIdentifier",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="account-password"
              className="block text-sm font-medium text-gray-700"
            >
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                id="account-password"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={isRegister ? 8 : undefined}
                placeholder="Enter your password"
                value={form.password}
                onChange={(event) =>
                  updateForm("password", event.target.value)
                }
                className="w-full rounded-xl border py-2.5 pl-9 pr-10 text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  setShowPassword((current) => !current)
                }
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-700"
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
                  style={{ color: settings.primaryColor }}
                  className="text-sm font-medium hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{ backgroundColor: settings.primaryColor }}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50"
          >
            <span>
              {submitting
                ? "Please wait..."
                : isRegister
                  ? "Create Account"
                  : "Login Account"}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
