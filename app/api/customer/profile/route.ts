import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { getAuthenticatedUser } from "@/lib/auth-guard";

export async function GET(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser(request);
    if (!sessionUser) {
      return Response.json(
        { error: "Unauthorized: Please log in" },
        { status: 401 },
      );
    }

    const profile = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        role: true,
        createdAt: true,
      },
    });

    if (!profile) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { userId: profile.id },
          { customerEmail: profile.email },
          ...(profile.phone ? [{ customerPhone: profile.phone }] : []),
        ],
      },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ profile, orders });
  } catch (error) {
    console.error("GET /api/customer/profile error:", error);
    return Response.json(
      { error: "Failed to load customer dashboard" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser(request);
    if (!sessionUser) {
      return Response.json(
        { error: "Unauthorized: Please log in" },
        { status: 401 },
      );
    }

    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      return Response.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    const { name, phone, address, currentPassword, newPassword } = body;
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 120
    ) {
      return Response.json(
        { error: "Full name must be between 2 and 120 characters" },
        { status: 400 },
      );
    }
    if (
      phone !== undefined &&
      phone !== null &&
      (typeof phone !== "string" || phone.trim().length > 40)
    ) {
      return Response.json(
        { error: "Phone number must be 40 characters or fewer" },
        { status: 400 },
      );
    }
    if (
      address !== undefined &&
      address !== null &&
      (typeof address !== "string" || address.trim().length > 1000)
    ) {
      return Response.json(
        { error: "Address must be 1000 characters or fewer" },
        { status: 400 },
      );
    }

    let passwordChange: {
      currentPassword: string;
      newPassword: string;
    } | null = null;
    if (currentPassword !== undefined || newPassword !== undefined) {
      if (
        typeof currentPassword !== "string" ||
        currentPassword.length === 0 ||
        typeof newPassword !== "string"
      ) {
        return Response.json(
          { error: "Enter your current password and a new password" },
          { status: 400 },
        );
      }
      if (newPassword.length < 6 || newPassword.length > 128) {
        return Response.json(
          { error: "New password must be between 6 and 128 characters" },
          { status: 400 },
        );
      }
      passwordChange = { currentPassword, newPassword };
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, password: true },
    });
    if (!existingUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    let hashedPassword: string | undefined;
    if (passwordChange) {
      const currentPasswordMatches = await bcrypt.compare(
        passwordChange.currentPassword,
        existingUser.password,
      );
      if (!currentPasswordMatches) {
        return Response.json(
          { error: "Current password is incorrect" },
          { status: 400 },
        );
      }
      hashedPassword = await bcrypt.hash(passwordChange.newPassword, 12);
    }

    const updatedProfile = await prisma.user.update({
      where: { id: sessionUser.id },
      data: {
        name: name.trim(),
        ...(phone !== undefined
          ? { phone: typeof phone === "string" && phone.trim() ? phone.trim() : null }
          : {}),
        ...(address !== undefined
          ? {
              address:
                typeof address === "string" && address.trim()
                  ? address.trim()
                  : null,
            }
          : {}),
        ...(hashedPassword ? { password: hashedPassword } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        role: true,
        createdAt: true,
      },
    });

    return Response.json({
      profile: updatedProfile,
      message: "Profile updated successfully!",
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "This phone number is already linked to another account" },
        { status: 409 },
      );
    }

    console.error("PUT /api/customer/profile error:", error);
    return Response.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }
}
