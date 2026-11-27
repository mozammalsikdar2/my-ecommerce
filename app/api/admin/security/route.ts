import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { validateBangladeshiPhone } from "@/lib/bd-phone";
import { prisma } from "@/lib/prisma";

const securityUpdateSchema = z
  .object({
    twoFactorEnabled: z.boolean().optional(),
    twoFactorChannel: z.enum(["EMAIL", "SMS"]).optional(),
    phone: z.string().trim().max(32).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.twoFactorEnabled !== undefined ||
      value.twoFactorChannel !== undefined ||
      value.phone !== undefined,
    "Provide at least one security setting to update",
  );

const blockPhoneSchema = z
  .object({
    phone: z.string().trim().min(1).max(64),
    reason: z.string().trim().max(250).optional(),
    orderNumber: z.string().trim().max(100).optional(),
    cancelPendingOrders: z.boolean().optional(),
  })
  .strict();

const adminProfileSelect = {
  id: true,
  email: true,
  phone: true,
  twoFactorEnabled: true,
  twoFactorChannel: true,
} satisfies Prisma.UserSelect;

export async function GET(request: Request) {
  const { user, errorResponse } = await requireRole(
    ["ADMIN", "MODERATOR"],
    request,
  );
  if (errorResponse) return errorResponse;
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const [adminProfile, blockedPhones] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: adminProfileSelect,
      }),
      prisma.blockedPhone.findMany({
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!adminProfile) {
      return NextResponse.json({ error: "Admin profile not found" }, { status: 404 });
    }

    return NextResponse.json(
      { adminProfile, blockedPhones },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/admin/security error:", error);
    return NextResponse.json(
      { error: "Failed to load security settings" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const { user, errorResponse } = await requireRole(
    ["ADMIN", "MODERATOR"],
    request,
  );
  if (errorResponse) return errorResponse;
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
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

  const parsed = securityUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid security settings" },
      { status: 400 },
    );
  }

  let phoneUpdate: string | null | undefined;
  if (parsed.data.phone !== undefined) {
    if (!parsed.data.phone) {
      phoneUpdate = null;
    } else {
      const phoneCheck = validateBangladeshiPhone(parsed.data.phone);
      if (!phoneCheck.valid || !phoneCheck.normalized) {
        return NextResponse.json(
          { error: phoneCheck.error ?? "Invalid Bangladeshi phone number" },
          { status: 400 },
        );
      }
      phoneUpdate = phoneCheck.normalized;
    }
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      select: adminProfileSelect,
    });
    if (!existing) {
      return NextResponse.json({ error: "Admin profile not found" }, { status: 404 });
    }

    const twoFactorEnabled =
      parsed.data.twoFactorEnabled ?? existing.twoFactorEnabled;
    const twoFactorChannel =
      parsed.data.twoFactorChannel ?? existing.twoFactorChannel;
    const effectivePhone =
      phoneUpdate === undefined ? existing.phone : phoneUpdate;

    if (
      twoFactorEnabled &&
      twoFactorChannel === "SMS" &&
      !effectivePhone
    ) {
      return NextResponse.json(
        {
          error:
            "Save a valid Bangladeshi phone number before enabling SMS two-factor authentication.",
        },
        { status: 400 },
      );
    }

    const updated = await prisma.$transaction(async (transaction) => {
      const profile = await transaction.user.update({
        where: { id: user.id },
        data: {
          ...(parsed.data.twoFactorEnabled !== undefined
            ? { twoFactorEnabled: parsed.data.twoFactorEnabled }
            : {}),
          ...(parsed.data.twoFactorChannel !== undefined
            ? { twoFactorChannel: parsed.data.twoFactorChannel }
            : {}),
          ...(phoneUpdate !== undefined ? { phone: phoneUpdate } : {}),
        },
        select: adminProfileSelect,
      });

      await transaction.adminTwoFactorToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });

      return profile;
    });

    return NextResponse.json(
      {
        adminProfile: updated,
        message: "Two-factor authentication settings updated",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That phone number is already assigned to another account" },
        { status: 409 },
      );
    }
    console.error("PUT /api/admin/security error:", error);
    return NextResponse.json(
      { error: "Failed to update security settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { user, errorResponse } = await requireRole(
    ["ADMIN", "MODERATOR"],
    request,
  );
  if (errorResponse) return errorResponse;
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
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

  const parsed = blockPhoneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid phone block request" },
      { status: 400 },
    );
  }

  const phoneCheck = validateBangladeshiPhone(parsed.data.phone);
  if (!phoneCheck.valid || !phoneCheck.normalized) {
    return NextResponse.json(
      {
        error:
          phoneCheck.error ??
          "Enter a valid Bangladeshi mobile number to block",
      },
      { status: 400 },
    );
  }

  const normalizedPhone = phoneCheck.normalized;
  const reason = parsed.data.reason || "Fake / Fraudulent order";
  const orderNumber = parsed.data.orderNumber || null;

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const blocked = await transaction.blockedPhone.upsert({
        where: { phone: normalizedPhone },
        update: {
          reason,
          ...(orderNumber ? { orderNumber } : {}),
          blockedBy: user.email,
        },
        create: {
          phone: normalizedPhone,
          reason,
          orderNumber,
          blockedBy: user.email,
        },
      });

      let cancelledCount = 0;
      if (parsed.data.cancelPendingOrders !== false) {
        const pendingOrders = await transaction.order.findMany({
          where: {
            customerPhone: normalizedPhone,
            orderStatus: "PENDING",
            paymentStatus: { not: "PAID" },
          },
          include: {
            items: {
              select: {
                productId: true,
                variantId: true,
                quantity: true,
              },
            },
          },
        });

        for (const order of pendingOrders) {
          const cancelled = await transaction.order.updateMany({
            where: {
              id: order.id,
              orderStatus: "PENDING",
              paymentStatus: { not: "PAID" },
            },
            data: { orderStatus: "CANCELLED", stockRestored: true },
          });
          if (cancelled.count !== 1) continue;

          for (const item of order.items) {
            await transaction.product.updateMany({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
            if (item.variantId) {
              await transaction.productVariant.updateMany({
                where: {
                  id: item.variantId,
                  productId: item.productId,
                },
                data: { stock: { increment: item.quantity } },
              });
            }
          }

          if (order.couponCode) {
            await transaction.coupon.updateMany({
              where: { code: order.couponCode, usedCount: { gt: 0 } },
              data: { usedCount: { decrement: 1 } },
            });
          }
          cancelledCount += 1;
        }
      }

      return { blocked, cancelledCount };
    });

    return NextResponse.json(
      {
        blocked: result.blocked,
        cancelledCount: result.cancelledCount,
        message:
          result.cancelledCount > 0
            ? `Blocked ${normalizedPhone} and cancelled ${result.cancelledCount} unpaid pending order(s).`
            : `Blocked ${normalizedPhone} from placing future orders.`,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("POST /api/admin/security error:", error);
    return NextResponse.json(
      { error: "Failed to block phone number" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const { errorResponse } = await requireRole(
    ["ADMIN", "MODERATOR"],
    request,
  );
  if (errorResponse) return errorResponse;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json(
      { error: "Block record ID is required" },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.blockedPhone.deleteMany({ where: { id } });
    if (result.count === 0) {
      return NextResponse.json(
        { error: "Blocked phone record not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ message: "Phone number unblocked" });
  } catch (error) {
    console.error("DELETE /api/admin/security error:", error);
    return NextResponse.json(
      { error: "Failed to unblock phone number" },
      { status: 500 },
    );
  }
}
