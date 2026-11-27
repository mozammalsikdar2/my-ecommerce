import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { validateBangladeshiPhone } from "@/lib/bd-phone";
import { requireAdminUser } from "@/lib/user-auth";
import { z } from "zod";

const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  twoFactorEnabled: true,
  createdAt: true,
  _count: { select: { orders: true } },
} satisfies Prisma.UserSelect;

const createStaffSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254).toLowerCase(),
    phone: z.string().trim().max(32).optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .refine(
        (value) => new TextEncoder().encode(value).byteLength <= 72,
        "Password must be at most 72 bytes",
      ),
    role: z.enum(["ADMIN", "MODERATOR"]),
  })
  .strict();

export async function GET() {
  const { response } = await requireAdminUser();
  if (response) return response;

  const users = await prisma.user.findMany({
    select: adminUserSelect,
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
  });
  return Response.json(users, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }
  const parsed = createStaffSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid staff account data" },
      { status: 400 },
    );
  }

  const { name, email, phone, password, role } = parsed.data;
  let normalizedPhone: string | null = null;
  if (phone) {
    const phoneCheck = validateBangladeshiPhone(phone);
    if (!phoneCheck.valid || !phoneCheck.normalized) {
      return Response.json(
        { error: phoneCheck.error ?? "Invalid Bangladeshi mobile number" },
        { status: 400 },
      );
    }
    normalizedPhone = phoneCheck.normalized;
  }

  const passwordHash = await hash(password, 12);
  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone: normalizedPhone,
        password: passwordHash,
        role,
        twoFactorEnabled: true,
        twoFactorChannel: "EMAIL",
      },
      select: adminUserSelect,
    });
    return Response.json(user, { status: 201 });
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
    console.error("Error creating staff account:", error);
    return Response.json(
      { error: "Failed to create staff account" },
      { status: 500 },
    );
  }
}
