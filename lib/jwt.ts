import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "@/lib/auth-constants";

export {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_TTL_SECONDS,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_SECONDS,
} from "@/lib/auth-constants";

const JWT_ISSUER = "alif-store";
const JWT_AUDIENCE = "alif-store";
const roles = ["CUSTOMER", "MODERATOR", "ADMIN"] as const;

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: (typeof roles)[number];
}

export type JwtUserPayload = SessionPayload;

export interface RefreshPayload {
  userId: string;
  sessionId: string;
}

function getSecretKey(environmentVariable: string) {
  const secret = process.env[environmentVariable];
  if (!secret || secret.includes("replace-with-")) {
    throw new Error(`${environmentVariable} must be set to a strong random secret`);
  }

  const key = new TextEncoder().encode(secret);
  if (key.byteLength < 32) {
    throw new Error(`${environmentVariable} must be at least 32 bytes long`);
  }

  return key;
}

function getAccessSecretKey() {
  return getSecretKey("JWT_ACCESS_SECRET");
}

function getRefreshSecretKey() {
  return getSecretKey("JWT_REFRESH_SECRET");
}

export function assertJwtConfiguration() {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  getAccessSecretKey();
  getRefreshSecretKey();

  if (accessSecret === refreshSecret) {
    throw new Error("JWT access and refresh secrets must be different");
  }
}

function isSessionPayload(
  payload: JWTPayload,
): payload is JWTPayload & SessionPayload {
  return (
    payload.tokenType === "access" &&
    typeof payload.userId === "string" &&
    payload.userId.length > 0 &&
    typeof payload.email === "string" &&
    typeof payload.name === "string" &&
    typeof payload.role === "string" &&
    roles.some((role) => role === payload.role)
  );
}

function isRefreshPayload(
  payload: JWTPayload,
): payload is JWTPayload & RefreshPayload {
  return (
    payload.tokenType === "refresh" &&
    typeof payload.userId === "string" &&
    payload.userId.length > 0 &&
    typeof payload.sessionId === "string" &&
    payload.sessionId.length > 0
  );
}

export async function signAccessToken(
  payload: JwtUserPayload,
): Promise<string> {
  return new SignJWT({
    tokenType: "access",
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getAccessSecretKey());
}

export const signToken = signAccessToken;

export async function signRefreshToken(
  payload: RefreshPayload,
): Promise<string> {
  return new SignJWT({ tokenType: "refresh", ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TOKEN_TTL_SECONDS}s`)
    .sign(getRefreshSecretKey());
}

export async function verifyAccessToken(
  token: string,
): Promise<JwtUserPayload | null> {
  let secretKey: Uint8Array;
  try {
    secretKey = getAccessSecretKey();
  } catch {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (!isSessionPayload(payload)) return null;

    return {
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export const verifyToken = verifyAccessToken;

export async function verifyRefreshToken(
  token: string,
): Promise<RefreshPayload | null> {
  let secretKey: Uint8Array;
  try {
    secretKey = getRefreshSecretKey();
  } catch {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (!isRefreshPayload(payload)) return null;

    return {
      userId: payload.userId,
      sessionId: payload.sessionId,
    };
  } catch {
    return null;
  }
}
