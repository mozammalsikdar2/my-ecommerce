import { NextResponse } from "next/server";
import { clearAuthCookies, getCookieValue } from "@/lib/auth-cookies";
import {
  getRefreshCookieName,
  type AuthPortal,
} from "@/lib/auth-constants";
import { revokeAuthSession } from "@/lib/auth-session";

export async function POST(request: Request) {
  let scope: "ADMIN" | "USER" | "ALL" = "ALL";
  try {
    const body: unknown = await request.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "scope" in body &&
      (body.scope === "ADMIN" || body.scope === "USER")
    ) {
      scope = body.scope;
    }
  } catch {
    // Empty request bodies default to signing out of all portals.
  }

  const portals: AuthPortal[] =
    scope === "ALL" ? ["admin", "user"] : [scope === "ADMIN" ? "admin" : "user"];
  const refreshTokens = portals
    .map((portal) => getCookieValue(request, getRefreshCookieName(portal)))
    .filter((token): token is string => Boolean(token));

  const revocations = await Promise.allSettled(
    refreshTokens.map((token) => revokeAuthSession(token)),
  );
  const revocationFailed = revocations.some(
    (result) => result.status === "rejected",
  );
  if (revocationFailed) {
    console.error("One or more auth sessions could not be revoked during logout");
  }

  const response = NextResponse.json(
    revocationFailed
      ? { error: "Unable to fully log out", scope }
      : { loggedOut: true, scope },
    { status: revocationFailed ? 500 : 200 },
  );
  if (scope === "ALL") {
    clearAuthCookies(response);
  } else {
    clearAuthCookies(response, scope === "ADMIN" ? "admin" : "user");
  }
  return response;
}
