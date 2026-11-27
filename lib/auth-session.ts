import { prisma } from "@/lib/prisma";
import {
  REFRESH_TOKEN_TTL_SECONDS,
  signRefreshToken,
  signAccessToken,
  verifyRefreshToken,
  type SessionPayload,
} from "@/lib/jwt";
import type { AuthPortal } from "@/lib/auth-constants";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createAuthSession(
  user: SessionPayload,
): Promise<AuthTokens> {
  const sessionId = crypto.randomUUID();
  const refreshToken = await signRefreshToken({
    userId: user.userId,
    sessionId,
  });
  const accessToken = await signAccessToken(user);

  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId: user.userId,
      tokenHash: await hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  return { accessToken, refreshToken };
}

export async function refreshAuthSession(
  refreshToken: string,
  portal: AuthPortal = "user",
) {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) return null;

  const now = new Date();
  const tokenHash = await hashToken(refreshToken);

  return prisma.$transaction(async (transaction) => {
    const session = await transaction.authSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.userId,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    const isStaff =
      session?.user.role === "ADMIN" || session?.user.role === "MODERATOR";
    if (
      !session ||
      !session.user.isActive ||
      (portal === "admin" ? !isStaff : session.user.role !== "CUSTOMER")
    ) {
      return null;
    }

    const nextSessionId = crypto.randomUUID();
    const nextRefreshToken = await signRefreshToken({
      userId: session.userId,
      sessionId: nextSessionId,
    });
    const accessToken = await signAccessToken({
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    });

    const revoked = await transaction.authSession.updateMany({
      where: {
        id: session.id,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) return null;

    await transaction.authSession.create({
      data: {
        id: nextSessionId,
        userId: session.userId,
        tokenHash: await hashToken(nextRefreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });

    return {
      user: session.user,
      tokens: { accessToken, refreshToken: nextRefreshToken },
    };
  });
}

export async function revokeAuthSession(refreshToken: string) {
  await prisma.authSession.updateMany({
    where: {
      tokenHash: await hashToken(refreshToken),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}
