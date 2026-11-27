export type AuthPortal = "user" | "admin";

export const USER_ACCESS_COOKIE_NAME = "user_access_token";
export const ADMIN_ACCESS_COOKIE_NAME = "admin_access_token";
export const USER_REFRESH_COOKIE_NAME = "user_refresh_token";
export const ADMIN_REFRESH_COOKIE_NAME = "admin_refresh_token";
export const AUTH_COOKIE_NAME = USER_ACCESS_COOKIE_NAME;
export const LEGACY_AUTH_COOKIE_NAME = "auth_token";
export const LEGACY_ACCESS_COOKIE_NAME = "access_token";
export const LEGACY_REFRESH_COOKIE_NAME = "refresh_token";
export const REFRESH_COOKIE_NAME = USER_REFRESH_COOKIE_NAME;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const AUTH_COOKIE_TTL_SECONDS = ACCESS_TOKEN_TTL_SECONDS;

export function getAccessCookieName(portal: AuthPortal) {
  return portal === "admin"
    ? ADMIN_ACCESS_COOKIE_NAME
    : USER_ACCESS_COOKIE_NAME;
}

export function getRefreshCookieName(portal: AuthPortal) {
  return portal === "admin"
    ? ADMIN_REFRESH_COOKIE_NAME
    : USER_REFRESH_COOKIE_NAME;
}

export function getRefreshCookiePath(portal: AuthPortal) {
  return `/api/auth/${portal}`;
}
