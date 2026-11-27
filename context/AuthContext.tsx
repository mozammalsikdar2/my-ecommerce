"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  type AuthPortal,
} from "@/lib/auth-constants";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  role: "CUSTOMER" | "MODERATOR" | "ADMIN";
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAuthUser(value: unknown): AuthUser | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.email !== "string" ||
    (value.role !== "CUSTOMER" &&
      value.role !== "MODERATOR" &&
      value.role !== "ADMIN") ||
    (value.phone !== undefined &&
      value.phone !== null &&
      typeof value.phone !== "string") ||
    (value.address !== undefined &&
      value.address !== null &&
      typeof value.address !== "string")
  ) {
    throw new Error("Current-user endpoint returned invalid user data");
  }

  return {
    id: value.id,
    name: value.name,
    email: value.email,
    phone: typeof value.phone === "string" ? value.phone : undefined,
    address: typeof value.address === "string" ? value.address : undefined,
    role: value.role,
  };
}

async function fetchCurrentUser(
  portal: AuthPortal,
  signal?: AbortSignal,
): Promise<AuthUser | null> {
  const response = await fetch(`/api/auth/${portal}/me`, {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Unable to load current user (${response.status})`);
  }

  const data: unknown = await response.json();
  if (!isRecord(data) || !("user" in data)) {
    throw new Error("Current-user endpoint returned invalid data");
  }

  return parseAuthUser(data.user);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load current user";
}

export function AuthProvider({
  children,
  portal = "user",
}: {
  children: React.ReactNode;
  portal?: AuthPortal;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    setLoading(true);
    try {
      setUser(await fetchCurrentUser(portal));
      setError(null);
    } catch (loadError) {
      setUser(null);
      setError(getErrorMessage(loadError));
      throw loadError;
    } finally {
      setLoading(false);
    }
  }, [portal]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialUser() {
      try {
        const currentUser = await fetchCurrentUser(portal, controller.signal);
        if (controller.signal.aborted) return;
        setUser(currentUser);
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setUser(null);
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadInitialUser();
    return () => controller.abort();
  }, [portal]);

  useEffect(() => {
    if (!user || loading) return;

    let cancelled = false;
    let timer: number;

    async function refreshSession() {
      try {
        const response = await fetch(`/api/auth/${portal}/refresh`, {
          method: "POST",
          cache: "no-store",
        });
        if (response.status === 401) {
          if (!cancelled) {
            setUser(null);
            setError("Your session has expired. Please sign in again.");
          }
          return;
        }
        if (!response.ok) {
          throw new Error(`Unable to refresh session (${response.status})`);
        }
        await refreshUser();
      } catch (refreshError) {
        if (!cancelled) {
          setError(getErrorMessage(refreshError));
          timer = window.setTimeout(() => void refreshSession(), 60_000);
        }
      }
    }

    timer = window.setTimeout(
      () => void refreshSession(),
      Math.max(1, ACCESS_TOKEN_TTL_SECONDS - 60) * 1000,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loading, portal, refreshUser, user]);

  const logout = useCallback(async () => {
    const previousUser = user;
    const response = await fetch(`/api/auth/${portal}/logout`, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Unable to log out (${response.status})`);
    }

    setUser(null);
    setError(null);
    router.push(
      previousUser?.role === "ADMIN" || previousUser?.role === "MODERATOR"
        ? "/admin/login"
        : "/",
    );
    router.refresh();
  }, [portal, router, user]);

  return (
    <AuthContext.Provider
      value={{ user, loading, error, refreshUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
