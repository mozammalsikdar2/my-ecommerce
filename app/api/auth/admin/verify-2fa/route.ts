import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminTwoFactorChallenge } from "@/lib/admin-2fa";
import { assertJwtConfiguration } from "@/lib/auth";
import { setAuthCookies } from "@/lib/auth-cookies";
import { createAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { checkMemoryBurstLimit } from "@/lib/rate-limit";

const verificationSchema = z
  .object({
    challengeToken: z.string().min(1).max(8192),
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit verification code"),
  })
  .strict();

const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  try {
    assertJwtConfiguration();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "JWT is not configured",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = verificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid verification data" },
      { status: 400 },
    );
  }

  const challenge = await verifyAdminTwoFactorChallenge(
    parsed.data.challengeToken,
  );
  if (!challenge) {
    return NextResponse.json(
      { error: "Verification challenge is invalid or expired" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rateLimit = checkMemoryBurstLimit(
    `admin-2fa-verify:${challenge.tokenId}`,
    MAX_ATTEMPTS,
    5 * 60_000,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many verification attempts. Request a new code." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  try {
    const tokenRecord = await prisma.adminTwoFactorToken.findFirst({
      where: {
        id: challenge.tokenId,
        userId: challenge.userId,
        used: false,
        expiresAt: { gt: new Date() },
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
            twoFactorEnabled: true,
          },
        },
      },
    });

    const isStaff =
      tokenRecord?.user.role === "ADMIN" ||
      tokenRecord?.user.role === "MODERATOR";
    if (
      !tokenRecord ||
      !tokenRecord.user.isActive ||
      !isStaff ||
      !tokenRecord.user.twoFactorEnabled
    ) {
      return NextResponse.json(
        { error: "Verification code is invalid or expired" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (tokenRecord.attempts >= MAX_ATTEMPTS) {
      await prisma.adminTwoFactorToken.updateMany({
        where: { id: tokenRecord.id, used: false },
        data: { used: true },
      });
      return NextResponse.json(
        { error: "Too many verification attempts. Request a new code." },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }

    const now = new Date();
    const matches = await compare(parsed.data.otp, tokenRecord.codeHash);
    if (!matches) {
      const attemptUpdate = await prisma.adminTwoFactorToken.updateMany({
        where: {
          id: tokenRecord.id,
          userId: challenge.userId,
          used: false,
          attempts: tokenRecord.attempts,
          expiresAt: { gt: now },
        },
        data: { attempts: { increment: 1 } },
      });
      if (attemptUpdate.count !== 1) {
        return NextResponse.json(
          { error: "Verification code is invalid or expired" },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }

      if (tokenRecord.attempts + 1 >= MAX_ATTEMPTS) {
        await prisma.adminTwoFactorToken.updateMany({
          where: {
            id: tokenRecord.id,
            attempts: tokenRecord.attempts + 1,
            used: false,
          },
          data: { used: true },
        });
        return NextResponse.json(
          { error: "Too many verification attempts. Request a new code." },
          { status: 429, headers: { "Cache-Control": "no-store" } },
        );
      }

      return NextResponse.json(
        { error: "Verification code is invalid or expired" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const consumed = await prisma.adminTwoFactorToken.updateMany({
      where: {
        id: tokenRecord.id,
        userId: challenge.userId,
        used: false,
        attempts: tokenRecord.attempts,
        expiresAt: { gt: now },
      },
      data: { used: true },
    });
    if (consumed.count !== 1) {
      return NextResponse.json(
        { error: "Verification code is invalid or expired" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const user = tokenRecord.user;
    const tokens = await createAuthSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    const response = NextResponse.json(
      {
        message: "Admin sign-in successful",
        accessToken: tokens.accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          role: user.role,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    setAuthCookies(response, tokens, "admin");
    return response;
  } catch (error) {
    console.error("Admin two-factor verification error:", error);
    return NextResponse.json(
      { error: "Unable to verify admin sign-in" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
