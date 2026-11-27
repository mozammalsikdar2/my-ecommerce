import { createHash, timingSafeEqual } from "node:crypto";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { validateBangladeshiPhone } from "@/lib/bd-phone";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { checkMemoryBurstLimit } from "@/lib/rate-limit";

const resetPasswordSchema = z.object({
  channel: z.enum(["EMAIL", "SMS"]),
  identifier: z.string().trim().min(1).max(254),
  otp: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .refine(
      (value) => new TextEncoder().encode(value).byteLength <= 72,
      "Password must be at most 72 bytes",
    ),
});

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

function otpMatches(otp: string, codeHash: string): boolean {
  const expectedHash = Buffer.from(codeHash, "hex");
  const submittedHash = Buffer.from(hashOtp(otp), "hex");
  return (
    expectedHash.length === submittedHash.length &&
    timingSafeEqual(expectedHash, submittedHash)
  );
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid reset data" },
      { status: 400 },
    );
  }

  const { channel, otp, newPassword } = parsed.data;
  let normalizedIdentifier = parsed.data.identifier.toLowerCase();

  if (channel === "SMS") {
    const phone = validateBangladeshiPhone(parsed.data.identifier);
    if (!phone.valid || !phone.normalized) {
      return Response.json(
        { error: phone.error ?? "Invalid Bangladeshi mobile number." },
        { status: 400 },
      );
    }
    normalizedIdentifier = phone.normalized;
  } else if (!z.string().email().safeParse(normalizedIdentifier).success) {
    return Response.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const identifierKey = createHash("sha256")
    .update(normalizedIdentifier)
    .digest("hex");
  const burst = checkMemoryBurstLimit(
    `reset_password:${channel}:${identifierKey}`,
    10,
    10 * 60_000,
  );
  if (!burst.allowed) {
    return Response.json(
      { error: "Too many reset attempts. Please request a new code later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(burst.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const now = new Date();
    const tokenRecord = await prisma.passwordResetToken.findFirst({
      where: {
        identifier: normalizedIdentifier,
        channel,
        used: false,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!tokenRecord) {
      return Response.json(
        { error: "Invalid or expired verification code. Please request a new one." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (tokenRecord.attempts >= 5) {
      await prisma.passwordResetToken.updateMany({
        where: { id: tokenRecord.id, used: false },
        data: { used: true },
      });
      return Response.json(
        { error: "Too many incorrect attempts. Please request a new code." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!otpMatches(otp, tokenRecord.codeHash)) {
      const attempt = await prisma.passwordResetToken.updateMany({
        where: {
          id: tokenRecord.id,
          used: false,
          expiresAt: { gt: now },
          attempts: tokenRecord.attempts,
        },
        data: {
          attempts: { increment: 1 },
          used: tokenRecord.attempts >= 4,
        },
      });

      if (attempt.count !== 1) {
        return Response.json(
          { error: "Invalid or expired verification code. Please request a new one." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }

      return Response.json(
        {
          error:
            tokenRecord.attempts >= 4
              ? "Too many incorrect attempts. Please request a new code."
              : "Incorrect 6-digit verification code.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const hashedPassword = await hash(newPassword, 12);
    const reset = await prisma.$transaction(async (transaction) => {
      const claimedToken = await transaction.passwordResetToken.updateMany({
        where: {
          id: tokenRecord.id,
          codeHash: hashOtp(otp),
          used: false,
          expiresAt: { gt: new Date() },
          attempts: { lt: 5 },
        },
        data: { used: true },
      });
      if (claimedToken.count !== 1) return false;

      const updatedUser = await transaction.user.updateMany({
        where: { id: tokenRecord.userId, isActive: true },
        data: { password: hashedPassword },
      });
      if (updatedUser.count !== 1) return false;

      await transaction.authSession.updateMany({
        where: { userId: tokenRecord.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return true;
    });

    if (!reset) {
      return Response.json(
        { error: "Invalid or expired verification code. Please request a new one." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const response = NextResponse.json(
      { message: "Password reset successful. You can now sign in with your new password." },
      { headers: { "Cache-Control": "no-store" } },
    );
    clearAuthCookies(response);
    return response;
  } catch (error) {
    console.error("POST /api/auth/reset-password failed:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Failed to reset password. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
