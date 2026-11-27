import { jwtVerify, SignJWT } from "jose";
import { assertJwtConfiguration } from "@/lib/auth";

const JWT_ISSUER = "alif-store";
const JWT_AUDIENCE = "alif-store";

export interface AdminTwoFactorChallenge {
  userId: string;
  tokenId: string;
}

function getAccessSecretKey() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export async function signAdminTwoFactorChallenge(
  challenge: AdminTwoFactorChallenge,
) {
  assertJwtConfiguration();
  return new SignJWT({
    tokenType: "admin-2fa",
    purpose: "ADMIN_2FA",
    userId: challenge.userId,
    tokenId: challenge.tokenId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getAccessSecretKey());
}

export async function verifyAdminTwoFactorChallenge(
  token: string,
): Promise<AdminTwoFactorChallenge | null> {
  try {
    assertJwtConfiguration();
    const { payload } = await jwtVerify(token, getAccessSecretKey(), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (
      payload.tokenType !== "admin-2fa" ||
      payload.purpose !== "ADMIN_2FA" ||
      typeof payload.userId !== "string" ||
      typeof payload.tokenId !== "string"
    ) {
      return null;
    }

    return { userId: payload.userId, tokenId: payload.tokenId };
  } catch {
    return null;
  }
}
