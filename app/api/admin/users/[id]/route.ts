import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { requireAdminUser, publicUserSelect } from "@/lib/user-auth";

const roles = ["CUSTOMER", "MODERATOR", "ADMIN"] as const;

function isRole(value: unknown): value is (typeof roles)[number] {
  return typeof value === "string" && roles.some((role) => role === value);
}

class UserUpdateError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user: actor, response } = await requireAdminUser();
  if (response || !actor) return response;

  const { id } = await params;
  if (!id.trim()) {
    return Response.json({ error: "User id is required" }, { status: 400 });
  }

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  if (
    Object.keys(body).some(
      (key) =>
        key !== "role" &&
        key !== "isActive" &&
        key !== "password" &&
        key !== "newPassword",
    ) ||
    Object.keys(body).length === 0 ||
    ("password" in body && "newPassword" in body)
  ) {
    return Response.json(
      {
        error:
          "Provide role, isActive, or one password field (password or newPassword)",
      },
      { status: 400 },
    );
  }
  let role: (typeof roles)[number] | undefined;
  if ("role" in body) {
    if (!isRole(body.role)) {
      return Response.json(
        { error: "role must be CUSTOMER, MODERATOR, or ADMIN" },
        { status: 400 },
      );
    }
    role = body.role;
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
  let password: string | undefined;
  const passwordField = "newPassword" in body ? "newPassword" : "password";
  if ("password" in body || "newPassword" in body) {
    const newPassword = body[passwordField];
    if (
      typeof newPassword !== "string" ||
      newPassword.length < 8 ||
      new TextEncoder().encode(newPassword).byteLength > 72
    ) {
      return Response.json(
        { error: "Password must be at least 8 characters and at most 72 bytes" },
        { status: 400 },
      );
    }
    password = newPassword;
  }

  const data: Prisma.UserUpdateInput = {};
  if (role !== undefined) data.role = role;
  if (isActive !== undefined) data.isActive = isActive;
  if (password !== undefined) data.password = await hash(password, 12);

  try {
    const updatedUser = await prisma.$transaction(
      async (transaction) => {
        const target = await transaction.user.findUnique({
          where: { id },
          select: { id: true, role: true, isActive: true },
        });
        if (!target) throw new UserUpdateError("User not found", 404);

        const willLoseAdmin =
          target.role === "ADMIN" &&
          target.isActive &&
          ((data.role !== undefined && data.role !== "ADMIN") ||
            data.isActive === false);
        if (willLoseAdmin) {
          if (target.id === actor.id) {
            throw new UserUpdateError(
              "You cannot remove your own active admin access",
              409,
            );
          }

          const otherActiveAdmins = await transaction.user.count({
            where: {
              id: { not: target.id },
              role: "ADMIN",
              isActive: true,
            },
          });
          if (otherActiveAdmins === 0) {
            throw new UserUpdateError(
              "At least one active admin account must remain",
              409,
            );
          }
        }

        const updatedUser = await transaction.user.update({
          where: { id },
          data,
          select: publicUserSelect,
        });
        await transaction.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await transaction.adminTwoFactorToken.updateMany({
          where: { userId: id, used: false },
          data: { used: true },
        });
        return updatedUser;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return Response.json(updatedUser);
  } catch (error) {
    if (error instanceof UserUpdateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return Response.json(
        { error: "User update conflict; please try again" },
        { status: 409 },
      );
    }
    console.error("Error updating user:", error);
    return Response.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user: actor, response } = await requireAdminUser();
  if (response || !actor) return response;

  const { id } = await params;
  if (!id.trim()) {
    return Response.json({ error: "User id is required" }, { status: 400 });
  }

  try {
    await prisma.$transaction(
      async (transaction) => {
        const target = await transaction.user.findUnique({
          where: { id },
          select: { id: true, role: true, isActive: true },
        });
        if (!target) throw new UserUpdateError("User not found", 404);
        if (target.id === actor.id) {
          throw new UserUpdateError("You cannot delete your own account", 409);
        }

        if (target.role === "ADMIN" && target.isActive) {
          const otherActiveAdmins = await transaction.user.count({
            where: {
              id: { not: target.id },
              role: "ADMIN",
              isActive: true,
            },
          });
          if (otherActiveAdmins === 0) {
            throw new UserUpdateError(
              "At least one active admin account must remain",
              409,
            );
          }
        }

        await transaction.user.delete({ where: { id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return Response.json({ deleted: true });
  } catch (error) {
    if (error instanceof UserUpdateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return Response.json(
        { error: "User deletion conflict; please try again" },
        { status: 409 },
      );
    }
    console.error("Error deleting user:", error);
    return Response.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
