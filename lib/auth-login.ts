import { compare, hash } from "bcryptjs";
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { AuthPortal } from "@/lib/auth-constants";
import { assertJwtConfiguration } from "@/lib/auth";
import { setAuthCookies } from "@/lib/auth-cookies";
import { createAuthSession } from "@/lib/auth-session";
import { signAdminTwoFactorChallenge } from "@/lib/admin-2fa";
import { sendAdmin2faEmail } from "@/lib/admin-2fa-email";
import { validateBangladeshiPhone } from "@/lib/bd-phone";
import { prisma } from "@/lib/prisma";
import { checkMemoryBurstLimit } from "@/lib/rate-limit";
import { sendAdmin2faSms } from "@/lib/sms";
import { publicUserSelect } from "@/lib/user-auth";

const passwordSchema = z
  .string()
  .min(1, "Password is required")
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= 72,
    "Password must be at most 72 bytes",
  );

const adminLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Valid email is required")
    .max(254, "Email must be at most 254 characters")
    .toLowerCase(),
  password: passwordSchema,
});

const userLoginSchema = z
  .object({
    identifier: z.string().trim().min(1).max(254).optional(),
    email: z.string().trim().min(1).max(254).optional(),
    password: passwordSchema,
  })
  .refine(
    (value) => Boolean(value.identifier || value.email),
    "Email or phone number is required",
  )
  .refine(
    (value) => !(value.identifier && value.email),
    "Provide either email or phone number, not both",
  );

export async function handlePortalLogin(
  request: Request,
  portal: AuthPortal,
) {
  try {
    assertJwtConfiguration();
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "JWT is not configured" },
      { status: 503 },
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

  let identifier: string;
  let password: string;
  if (portal === "admin") {
    const parsed = adminLoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid login data" },
        { status: 400 },
      );
    }
    identifier = parsed.data.email;
    password = parsed.data.password;
  } else {
    const parsed = userLoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid login data" },
        { status: 400 },
      );
    }
    const submittedIdentifier = parsed.data.identifier ?? parsed.data.email;
    if (!submittedIdentifier) {
      return NextResponse.json(
        { error: "Email or phone number is required" },
        { status: 400 },
      );
    }
    identifier = submittedIdentifier;
    password = parsed.data.password;
  }

  if (portal === "admin") identifier = identifier.toLowerCase();

  try {
    if (portal === "admin") {
      const loginLimit = checkMemoryBurstLimit(
        `admin-login:${identifier}`,
        6,
        5 * 60_000,
      );
      if (!loginLimit.allowed) {
        return NextResponse.json(
          {
            error: `Too many admin login attempts. Please wait ${loginLimit.retryAfterSeconds} seconds.`,
          },
          {
            status: 429,
            headers: { "Retry-After": String(loginLimit.retryAfterSeconds) },
          },
        );
      }
    }

    const userSelect = {
        ...publicUserSelect,
        password: true,
        twoFactorEnabled: true,
        twoFactorChannel: true,
      } as const;
    const phoneValidation = validateBangladeshiPhone(identifier);
    const normalizedPhone = phoneValidation.valid
      ? phoneValidation.normalized
      : undefined;
    const phoneCandidates = normalizedPhone
      ? [
          normalizedPhone,
          `88${normalizedPhone}`,
          `+88${normalizedPhone}`,
          identifier,
        ]
      : [];
    const user =
      portal === "admin"
        ? await prisma.user.findUnique({
            where: { email: identifier },
            select: userSelect,
          })
        : await prisma.user.findFirst({
            where: {
              OR: [
                { email: identifier.toLowerCase() },
                ...(phoneCandidates.length
                  ? [{ phone: { in: phoneCandidates } }]
                  : []),
              ],
            },
            select: userSelect,
          });
    if (
      !user ||
      !user.isActive ||
      !(await compare(password, user.password))
    ) {
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const isStaff = user.role === "ADMIN" || user.role === "MODERATOR";
    if (portal === "admin" && !isStaff) {
      return Response.json(
        {
          error:
            "Access denied. Customer accounts cannot log into the Admin Dashboard.",
        },
        { status: 403 },
      );
    }
    if (portal === "user" && isStaff) {
      return Response.json(
        {
          error:
            "Admin and staff accounts must sign in via the Admin Login Dashboard (/admin/login).",
          redirectToAdmin: true,
        },
        { status: 403 },
      );
    }

    if (portal === "admin" && user.twoFactorEnabled) {
      const challengeLimit = checkMemoryBurstLimit(
        `admin-2fa-send:${user.id}`,
        3,
        5 * 60_000,
      );
      if (!challengeLimit.allowed) {
        return NextResponse.json(
          {
            error: `Too many verification codes requested. Please wait ${challengeLimit.retryAfterSeconds} seconds.`,
          },
          {
            status: 429,
            headers: { "Retry-After": String(challengeLimit.retryAfterSeconds) },
          },
        );
      }

      await prisma.adminTwoFactorToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });

      const otp = String(randomInt(100_000, 1_000_000));
      const tokenRecord = await prisma.adminTwoFactorToken.create({
        data: {
          userId: user.id,
          codeHash: await hash(otp, 10),
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      });

      const useSms = user.twoFactorChannel === "SMS" && Boolean(user.phone);
      try {
        if (useSms && user.phone) {
          const result = await sendAdmin2faSms({
            phone: user.phone,
            otp,
          });
          if (!result.sent) {
            throw new Error(result.reason);
          }
        } else {
          await sendAdmin2faEmail({
            to: user.email,
            adminName: user.name,
            otp,
          });
        }
      } catch (error) {
        await prisma.adminTwoFactorToken.updateMany({
          where: { id: tokenRecord.id, used: false },
          data: { used: true },
        });
        console.error("Failed to deliver admin two-factor code:", error);
        return NextResponse.json(
          { error: "Unable to deliver the verification code" },
          { status: 503 },
        );
      }

      const challengeToken = await signAdminTwoFactorChallenge({
        userId: user.id,
        tokenId: tokenRecord.id,
      });
      const maskedDestination =
        useSms && user.phone
          ? maskPhone(user.phone)
          : maskEmail(user.email);

      return NextResponse.json(
        {
          requires2fa: true,
          challengeToken,
          channel: useSms ? "SMS" : "EMAIL",
          maskedDestination,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const tokens = await createAuthSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    const response = NextResponse.json(
      {
        message: "Login successful",
        accessToken: tokens.accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    setAuthCookies(response, tokens, portal);
    return response;
  } catch (error) {
    console.error(`Error logging in ${portal}:`, error);
    return Response.json({ error: "Failed to log in" }, { status: 500 });
  }
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "your email";
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "your phone";
  return `${digits.slice(0, 3)}*****${digits.slice(-3)}`;
}
