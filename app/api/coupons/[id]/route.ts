import { prisma } from "@/lib/prisma";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { staffAuthorizationError } from "@/lib/user-auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }
  const allowedFields = ["isActive", "usageLimit"];
  if (
    Object.keys(body).length === 0 ||
    Object.keys(body).some((key) => !allowedFields.includes(key))
  ) {
    return Response.json(
      { error: "Only isActive and usageLimit may be updated" },
      { status: 400 },
    );
  }
  let isActive: boolean | undefined;
  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") {
      return Response.json(
        { error: "isActive must be a boolean" },
        { status: 400 },
      );
    }
    isActive = body.isActive;
  }
  let usageLimit: number | null | undefined;
  if ("usageLimit" in body) {
    if (body.usageLimit === null) {
      usageLimit = null;
    } else if (
      typeof body.usageLimit === "number" &&
      Number.isSafeInteger(body.usageLimit) &&
      body.usageLimit > 0
    ) {
      usageLimit = body.usageLimit;
    } else {
      return Response.json(
        { error: "usageLimit must be a positive integer or null" },
        { status: 400 },
      );
    }
  }

  try {
    const { id } = await params;
    const existing = await prisma.coupon.findUnique({
      where: { id },
      select: { id: true, usedCount: true },
    });
    if (!existing) {
      return Response.json({ error: "Coupon not found" }, { status: 404 });
    }
    if (
      typeof usageLimit === "number" &&
      usageLimit < existing.usedCount
    ) {
      return Response.json(
        { error: "usageLimit cannot be lower than the number of uses already recorded" },
        { status: 400 },
      );
    }

    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        ...("isActive" in body ? { isActive } : {}),
        ...("usageLimit" in body ? { usageLimit } : {}),
      },
    });
    return Response.json(coupon);
  } catch (error) {
    console.error("Error updating coupon:", error);
    return Response.json(
      { error: "Failed to update coupon" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const result = await prisma.coupon.deleteMany({ where: { id } });
    if (result.count === 0) {
      return Response.json({ error: "Coupon not found" }, { status: 404 });
    }
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    return Response.json(
      { error: "Failed to delete coupon" },
      { status: 500 },
    );
  }
}
