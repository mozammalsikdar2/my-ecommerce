import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { validateBangladeshiPhone } from "@/lib/bd-phone";
import { checkMemoryBurstLimit } from "@/lib/rate-limit";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { sendPasswordResetEmail } from "@/lib/password-reset-email";
import { sendPasswordResetSms } from "@/lib/sms";

const genericResponse = {
  message: "If an active account matches the provided information, a reset code will be sent.",
};

function hashOtp(otp: string) {
  return createHash("sha256").update(otp).digest("hex");
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  const channel = body.channel;
  if (channel !== "EMAIL" && channel !== "SMS") {
    return Response.json(
      { error: "channel must be EMAIL or SMS" },
      { status: 400 },
    );
  }
  if (
    typeof body.identifier !== "string" ||
    body.identifier.trim().length === 0 ||
    body.identifier.length > 254
  ) {
    return Response.json(
      {
        error:
          channel === "SMS"
            ? "Please enter your registered mobile number."
            : "Please enter your registered email address.",
      },
      { status: 400 },
    );
  }

  let normalizedIdentifier = body.identifier.trim().toLowerCase();
  if (channel === "SMS") {
    const phone = validateBangladeshiPhone(body.identifier);
    if (!phone.valid || !phone.normalized) {
      return Response.json(
        { error: phone.error ?? "Invalid Bangladeshi mobile number." },
        { status: 400 },
      );
    }
    normalizedIdentifier = phone.normalized;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedIdentifier)) {
    return Response.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const identifierKey = createHash("sha256")
    .update(normalizedIdentifier)
    .digest("hex");
  const burst = checkMemoryBurstLimit(
    `forgot_password:${identifierKey}`,
    3,
    10 * 60_000,
  );
  if (!burst.allowed) {
    return Response.json(
      {
        error: `Too many reset requests. Please wait ${burst.retryAfterSeconds} seconds before trying again.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(burst.retryAfterSeconds) },
      },
    );
  }

  try {
    const user =
      channel === "SMS"
        ? await prisma.user.findFirst({
            where: {
              phone: {
                in: [
                  normalizedIdentifier,
                  `88${normalizedIdentifier}`,
                  `+88${normalizedIdentifier}`,
                  body.identifier.trim(),
                ],
              },
            },
          })
        : await prisma.user.findUnique({
            where: { email: normalizedIdentifier },
          });

    if (!user || !user.isActive) {
      return Response.json(genericResponse, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const otp = String(randomInt(100_000, 1_000_000));
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });
      await transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          channel,
          identifier: normalizedIdentifier,
          codeHash: hashOtp(otp),
          expiresAt,
        },
      });
    });

    try {
      if (channel === "SMS") {
        const result = await sendPasswordResetSms({
          phone: normalizedIdentifier,
          otp,
        });
        if (!result.sent) throw new Error(result.reason);
      } else {
        await sendPasswordResetEmail({
          to: user.email,
          customerName: user.name,
          otp,
        });
      }
    } catch (error) {
      await prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          identifier: normalizedIdentifier,
          codeHash: hashOtp(otp),
          used: false,
        },
        data: { used: true },
      });
      console.error("Password reset code delivery failed:", {
        channel,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return Response.json(
        { error: "Unable to send a reset code right now. Please try again later." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(genericResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("POST /api/auth/forgot-password failed:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Failed to process the password reset request." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
