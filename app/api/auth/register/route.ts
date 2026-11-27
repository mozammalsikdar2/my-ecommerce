import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertJwtConfiguration } from "@/lib/auth";
import { setAuthCookies } from "@/lib/auth-cookies";
import { createAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { publicUserSelect } from "@/lib/user-auth";

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  email: z
    .string()
    .trim()
    .email("Invalid email format")
    .max(254, "Email must be at most 254 characters")
    .toLowerCase(),
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .max(32, "Phone must be at most 32 characters"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .refine(
      (value) => new TextEncoder().encode(value).byteLength <= 72,
      "Password must be at most 72 bytes",
    ),
  address: z
    .string()
    .trim()
    .max(500, "Address must be at most 500 characters")
    .nullish()
    .transform((value) => value || null),
});

export async function POST(request: Request) {
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

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid registration data" },
      { status: 400 },
    );
  }

  const { name, email, password, phone, address } = parsed.data;
  const hashedPassword = await hash(password, 12);
  try {
    const user = await prisma.$transaction(
      async (transaction) => {
        const existingUsers = await transaction.user.count();
        return transaction.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            phone,
            address,
            role: existingUsers === 0 ? "ADMIN" : "CUSTOMER",
          },
          select: publicUserSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (user.role !== "CUSTOMER") {
      return NextResponse.json(
        {
          message: "Account registered successfully",
          requiresAdminLogin: true,
          user,
        },
        { status: 201, headers: { "Cache-Control": "no-store" } },
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
        message: "Account registered successfully",
        accessToken: tokens.accessToken,
        user,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
    setAuthCookies(response, tokens, "user");
    return response;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "An account with that email or phone already exists" },
        { status: 409 },
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return Response.json(
        { error: "Registration conflict; please try again" },
        { status: 409 },
      );
    }
    console.error("Error registering user:", error);
    return Response.json({ error: "Failed to register account" }, { status: 500 });
  }
}
