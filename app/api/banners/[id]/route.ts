import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isRecord,
  readJsonBody,
} from "@/lib/api-utils";
import { staffAuthorizationError } from "@/lib/user-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await readJsonBody(request);
  if (!isRecord(body) || typeof body.isActive !== "boolean") {
    return Response.json(
      { error: "Request body must contain a boolean isActive field" },
      { status: 400 },
    );
  }
  const unknownFields = Object.keys(body).filter((field) => field !== "isActive");
  if (unknownFields.length > 0) {
    return Response.json(
      { error: `Unsupported banner fields: ${unknownFields.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const banner = await prisma.banner.update({
      where: { id },
      data: { isActive: body.isActive },
    });
    return Response.json(banner);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return Response.json({ error: "Banner not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const authError = await staffAuthorizationError(_request);
  if (authError) return authError;

  const { id } = await params;
  try {
    await prisma.banner.delete({ where: { id } });
    return Response.json({ message: "Banner deleted" });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return Response.json({ error: "Banner not found" }, { status: 404 });
    }
    throw error;
  }
}
