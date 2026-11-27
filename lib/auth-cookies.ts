import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  LEGACY_ACCESS_COOKIE_NAME,
  LEGACY_AUTH_COOKIE_NAME,
  LEGACY_REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_SECONDS,
  getAccessCookieName,
  getRefreshCookieName,
  getRefreshCookiePath,
  type AuthPortal,
} from "@/lib/auth-constants";
import type { AuthTokens } from "@/lib/auth-session";

const cookieDefaults = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};

export function setAuthCookies(
  response: NextResponse,
  tokens: AuthTokens,
  portal: AuthPortal = "user",
) {
  response.cookies.set({
    ...cookieDefaults,
    name: getAccessCookieName(portal),
    value: tokens.accessToken,
    path: "/",
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
  response.cookies.set({
    ...cookieDefaults,
    name: getRefreshCookieName(portal),
    value: tokens.refreshToken,
    path: getRefreshCookiePath(portal),
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function clearAuthCookies(
  response: NextResponse,
  portal?: AuthPortal,
) {
  const portals: AuthPortal[] = portal ? [portal] : ["user", "admin"];
  for (const cookiePortal of portals) {
    response.cookies.set({
      ...cookieDefaults,
      name: getAccessCookieName(cookiePortal),
      value: "",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set({
      ...cookieDefaults,
      name: getRefreshCookieName(cookiePortal),
      value: "",
      path: getRefreshCookiePath(cookiePortal),
      maxAge: 0,
    });
  }

  if (!portal || portal === "user") {
    response.cookies.set({
      ...cookieDefaults,
      name: LEGACY_AUTH_COOKIE_NAME,
      value: "",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set({
      ...cookieDefaults,
      name: LEGACY_ACCESS_COOKIE_NAME,
      value: "",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set({
      ...cookieDefaults,
      name: LEGACY_REFRESH_COOKIE_NAME,
      value: "",
      path: "/api/auth",
      maxAge: 0,
    });
  }
}

export function getCookieValue(request: Request, name: string) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie?.slice(name.length + 1);
}
