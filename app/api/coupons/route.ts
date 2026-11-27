import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { staffAuthorizationError } from "@/lib/user-auth";

export async function GET(request: Request) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
    });
    return Response.json(coupons);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    return Response.json(
      { error: "Failed to fetch coupons" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  const code =
    typeof body.code === "string"
      ? body.code.trim().replace(/\s+/g, "").toUpperCase()
      : "";
  const discountType = body.discountType;
  const discountValue = body.discountValue;
  const minOrderAmount = body.minOrderAmount ?? 0;
  const maxDiscount = body.maxDiscount ?? null;
  const usageLimit = body.usageLimit ?? null;
  let expiresAt: Date | null = null;

  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) {
    return Response.json(
      { error: "Code must be 2–40 letters, numbers, hyphens, or underscores" },
      { status: 400 },
    );
  }
  if (discountType !== "PERCENTAGE" && discountType !== "FIXED") {
    return Response.json(
      { error: "discountType must be PERCENTAGE or FIXED" },
      { status: 400 },
    );
  }
  if (
    typeof discountValue !== "number" ||
    !Number.isFinite(discountValue) ||
    discountValue <= 0 ||
    (discountType === "PERCENTAGE" && discountValue > 100)
  ) {
    return Response.json(
      {
        error:
          discountType === "PERCENTAGE"
            ? "Percentage discount must be greater than 0 and at most 100"
            : "Fixed discount must be greater than 0",
      },
      { status: 400 },
    );
  }
  if (
    typeof minOrderAmount !== "number" ||
    !Number.isFinite(minOrderAmount) ||
    minOrderAmount < 0
  ) {
    return Response.json(
      { error: "minOrderAmount must be a non-negative number" },
      { status: 400 },
    );
  }
  if (
    maxDiscount !== null &&
    (typeof maxDiscount !== "number" ||
      !Number.isFinite(maxDiscount) ||
      maxDiscount < 0)
  ) {
    return Response.json(
      { error: "maxDiscount must be a non-negative number or null" },
      { status: 400 },
    );
  }
  if (discountType === "FIXED" && maxDiscount !== null) {
    return Response.json(
      { error: "maxDiscount only applies to percentage coupons" },
      { status: 400 },
    );
  }
  if (
    usageLimit !== null &&
    (typeof usageLimit !== "number" ||
      !Number.isSafeInteger(usageLimit) ||
      usageLimit <= 0)
  ) {
    return Response.json(
      { error: "usageLimit must be a positive integer or null" },
      { status: 400 },
    );
  }
  if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== "") {
    if (typeof body.expiresAt !== "string") {
      return Response.json(
        { error: "expiresAt must be an ISO date string or null" },
        { status: 400 },
      );
    }
    expiresAt = new Date(body.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
      return Response.json(
        { error: "expiresAt must be a valid future date" },
        { status: 400 },
      );
    }
  }

  try {
    const existing = await prisma.coupon.findFirst({
      where: { code: { equals: code, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      return Response.json(
        { error: "A coupon with this code already exists" },
        { status: 409 },
      );
    }

    const coupon = await prisma.coupon.create({
      data: {
        code,
        discountType,
        discountValue,
        minOrderAmount,
        maxDiscount,
        usageLimit,
        expiresAt,
      },
    });
    return Response.json(coupon, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "A coupon with this code already exists" },
        { status: 409 },
      );
    }
    console.error("Error creating coupon:", error);
    return Response.json(
      { error: "Failed to create coupon" },
      { status: 500 },
    );
  }
}
