import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  getCookieValue,
  setAuthCookies,
} from "@/lib/auth-cookies";
import {
  getAccessCookieName,
  getRefreshCookieName,
  type AuthPortal,
} from "@/lib/auth-constants";
import { assertJwtConfiguration } from "@/lib/auth";
import { refreshAuthSession, revokeAuthSession } from "@/lib/auth-session";
import { getAuthenticatedUserFromToken } from "@/lib/auth-guard";

function configurationError(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : "JWT is not configured",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function getPortalCurrentUser(
  request: Request,
  portal: AuthPortal,
) {
  try {
    assertJwtConfiguration();
  } catch (error) {
    return configurationError(error);
  }

  const accessToken = getCookieValue(request, getAccessCookieName(portal));
  const refreshToken = getCookieValue(request, getRefreshCookieName(portal));

  try {
    const user = await getAuthenticatedUserFromToken(accessToken, portal);
    if (user) {
      return NextResponse.json(
        { user },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const refreshed = refreshToken
      ? await refreshAuthSession(refreshToken, portal)
      : null;
    if (!refreshed) {
      const response = NextResponse.json(
        { user: null },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
      clearAuthCookies(response, portal);
      return response;
    }

    const response = NextResponse.json(
      { user: refreshed.user },
      { headers: { "Cache-Control": "no-store" } },
    );
    setAuthCookies(response, refreshed.tokens, portal);
    return response;
  } catch (error) {
    console.error(`Error loading ${portal} session:`, error);
    return NextResponse.json(
      { error: "Unable to load current user" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function refreshPortalSession(
  request: Request,
  portal: AuthPortal,
) {
  try {
    assertJwtConfiguration();
  } catch (error) {
    return configurationError(error);
  }

  const refreshToken = getCookieValue(request, getRefreshCookieName(portal));
  if (!refreshToken) {
    const response = NextResponse.json(
      { error: "Authentication required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
    clearAuthCookies(response, portal);
    return response;
  }

  try {
    const refreshed = await refreshAuthSession(refreshToken, portal);
    if (!refreshed) {
      const response = NextResponse.json(
        { error: "Refresh session is invalid or expired" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
      clearAuthCookies(response, portal);
      return response;
    }

    const response = NextResponse.json(
      {
        message: "Access token refreshed",
        accessToken: refreshed.tokens.accessToken,
        user: refreshed.user,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    setAuthCookies(response, refreshed.tokens, portal);
    return response;
  } catch (error) {
    console.error(`Error refreshing ${portal} session:`, error);
    return NextResponse.json(
      { error: "Unable to refresh session" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function logoutPortalSession(
  request: Request,
  portal: AuthPortal,
) {
  const refreshToken = getCookieValue(request, getRefreshCookieName(portal));
  if (refreshToken) {
    try {
      await revokeAuthSession(refreshToken);
    } catch (error) {
      console.error(`Error revoking ${portal} session:`, error);
      const response = NextResponse.json(
        { error: "Unable to fully log out" },
        { status: 500 },
      );
      clearAuthCookies(response, portal);
      return response;
    }
  }

  const response = NextResponse.json({ message: "Logged out successfully" });
  clearAuthCookies(response, portal);
  return response;
}
