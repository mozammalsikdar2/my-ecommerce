import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isHttpUrl, isRecord, readJsonBody } from "@/lib/api-utils";
import {
  isValidProductSlug,
  slugifyProductName,
} from "@/lib/product-utils";
import { staffAuthorizationError } from "@/lib/user-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }
  const queryType = new URL(request.url).searchParams.get("type");
  const requestedType = queryType ?? body.type ?? "category";
  const type =
    requestedType === "SUBCATEGORY"
      ? "subcategory"
      : requestedType === "CATEGORY"
        ? "category"
        : requestedType;
  if (type !== "category" && type !== "subcategory" && type !== "sub") {
    return Response.json(
      { error: "type must be category or subcategory" },
      { status: 400 },
    );
  }

  const isSubCategory = type === "subcategory" || type === "sub";
  const allowedFields = isSubCategory
    ? ["type", "name", "slug", "categoryId"]
    : ["type", "name", "slug", "imageUrl"];
  if (Object.keys(body).some((key) => !allowedFields.includes(key))) {
    return Response.json(
      { error: "Request contains unsupported category fields" },
      { status: 400 },
    );
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return Response.json(
      { error: "A non-empty name is required" },
      { status: 400 },
    );
  }
  const name = body.name.trim();
  if (name.length > 100) {
    return Response.json(
      { error: "name must be at most 100 characters" },
      { status: 400 },
    );
  }

  if (
    body.slug !== undefined &&
    (typeof body.slug !== "string" ||
      !isValidProductSlug(body.slug.trim().toLowerCase()))
  ) {
    return Response.json(
      { error: "slug must contain lowercase letters, numbers, and hyphens" },
      { status: 400 },
    );
  }
  const slug =
    typeof body.slug === "string"
      ? body.slug.trim().toLowerCase()
      : slugifyProductName(name);
  if (!isValidProductSlug(slug)) {
    return Response.json(
      { error: "A valid slug is required for this name" },
      { status: 400 },
    );
  }

  if (
    !isSubCategory &&
    body.imageUrl !== undefined &&
    body.imageUrl !== null &&
    (typeof body.imageUrl !== "string" || !isHttpUrl(body.imageUrl))
  ) {
    return Response.json(
      { error: "imageUrl must be an HTTP or HTTPS URL or null" },
      { status: 400 },
    );
  }

  let categoryId: string | undefined;
  if (isSubCategory && body.categoryId !== undefined) {
    if (typeof body.categoryId !== "string" || !body.categoryId.trim()) {
      return Response.json(
        { error: "categoryId must be a non-empty string" },
        { status: 400 },
      );
    }
    categoryId = body.categoryId.trim();
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      return Response.json({ error: "Category not found" }, { status: 404 });
    }
  }

  try {
    if (isSubCategory) {
      return Response.json(
        await prisma.subCategory.update({
          where: { id },
          data: {
            name,
            slug,
            ...(categoryId ? { categoryId } : {}),
          },
        }),
      );
    }
    return Response.json(
      await prisma.category.update({
        where: { id },
        data: {
          name,
          slug,
          ...(body.imageUrl !== undefined
            ? {
                imageUrl:
                  typeof body.imageUrl === "string"
                    ? body.imageUrl.trim()
                    : null,
              }
            : {}),
        },
      }),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return Response.json(
        { error: `${isSubCategory ? "Subcategory" : "Category"} not found` },
        { status: 404 },
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        {
          error: isSubCategory
            ? "A subcategory with this slug already exists"
            : "A category with this name or slug already exists",
        },
        { status: 409 },
      );
    }
    console.error("Error updating category:", error);
    return Response.json(
      { error: "Failed to update category" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const { id } = await params;
  const type = new URL(request.url).searchParams.get("type");
  if (
    type !== null &&
    type !== "category" &&
    type !== "subcategory" &&
    type !== "sub" &&
    type !== "CATEGORY" &&
    type !== "SUBCATEGORY"
  ) {
    return Response.json(
      { error: "type query parameter must be category or sub" },
      { status: 400 },
    );
  }

  const isSubCategory =
    type === "subcategory" || type === "sub" || type === "SUBCATEGORY";
  try {
    if (isSubCategory) {
      await prisma.subCategory.delete({ where: { id } });
    } else {
      const product = await prisma.product.findFirst({
        where: { categoryId: id },
        select: { id: true },
      });
      if (product) {
        return Response.json(
          { error: "Cannot delete a category containing products. Move or remove the products first." },
          { status: 409 },
        );
      }
      await prisma.category.delete({ where: { id } });
    }
    return Response.json({ message: "Deleted successfully" });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return Response.json(
        { error: `${isSubCategory ? "Subcategory" : "Category"} not found` },
        { status: 404 },
      );
    }
    if (
      !isSubCategory &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return Response.json(
        { error: "Cannot delete a category containing products. Move or remove the products first." },
        { status: 409 },
      );
    }
    throw error;
  }
}
