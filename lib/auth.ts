import "server-only";

import { cookies } from "next/headers";
import {
  verifyAccessToken,
} from "@/lib/jwt";
import {
  getAccessCookieName,
  type AuthPortal,
} from "@/lib/auth-constants";

export {
  AUTH_COOKIE_NAME,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_SECONDS,
  AUTH_COOKIE_TTL_SECONDS,
  assertJwtConfiguration,
  signRefreshToken,
  signAccessToken,
  signToken,
  verifyRefreshToken,
  verifyAccessToken,
  verifyToken,
  type SessionPayload,
  type JwtUserPayload,
  type RefreshPayload,
} from "@/lib/jwt";

export async function getCurrentUser(portal: AuthPortal = "user") {
  const token = (await cookies()).get(getAccessCookieName(portal))?.value;
  if (!token) return null;
  const session = await verifyAccessToken(token);
  if (!session) return null;

  const isStaff =
    session.role === "ADMIN" || session.role === "MODERATOR";
  return portal === "admin"
    ? isStaff
      ? session
      : null
    : session.role === "CUSTOMER"
      ? session
      : null;
}
