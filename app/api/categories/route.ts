import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isHttpUrl, isRecord, readJsonBody } from "@/lib/api-utils";
import {
  isValidProductSlug,
  slugifyProductName,
} from "@/lib/product-utils";
import { staffAuthorizationError } from "@/lib/user-auth";

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        subCategories: {
          orderBy: { name: "asc" },
          include: { _count: { select: { products: true } } },
        },
        _count: { select: { products: true } },
      },
    });
    return Response.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return Response.json({ error: "Failed to fetch categories" }, { status: 500 });
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
  if (typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const name = body.name.trim();
  if (name.length > 100) {
    return Response.json(
      { error: "name must be at most 100 characters" },
      { status: 400 },
    );
  }

  const type =
    body.categoryId !== undefined && body.categoryId !== null
      ? "subcategory"
      : body.type === "SUBCATEGORY"
        ? "subcategory"
        : body.type === "CATEGORY"
          ? "category"
          : body.type ?? "category";
  if (type !== "category" && type !== "subcategory") {
    return Response.json(
      { error: "type must be category or subcategory" },
      { status: 400 },
    );
  }

  const suppliedSlug = body.slug;
  if (
    suppliedSlug !== undefined &&
    (typeof suppliedSlug !== "string" ||
      !isValidProductSlug(suppliedSlug.trim().toLowerCase()))
  ) {
    return Response.json(
      { error: "slug must contain lowercase letters, numbers, and hyphens" },
      { status: 400 },
    );
  }
  let slug =
    typeof suppliedSlug === "string"
      ? suppliedSlug.trim().toLowerCase()
      : slugifyProductName(name) || type;
  if (suppliedSlug === undefined) {
    const existing = type === "category"
      ? await prisma.category.findUnique({
          where: { slug },
          select: { id: true },
        })
      : await prisma.subCategory.findUnique({
          where: { slug },
          select: { id: true },
        });
    if (existing) slug = `${slug}-${randomUUID().slice(0, 8)}`;
  }

  if (type === "category") {
    if (
      body.imageUrl !== undefined &&
      body.imageUrl !== null &&
      (typeof body.imageUrl !== "string" || !isHttpUrl(body.imageUrl))
    ) {
      return Response.json(
        { error: "imageUrl must be an HTTP or HTTPS URL or null" },
        { status: 400 },
      );
    }

    try {
      const category = await prisma.category.create({
        data: {
          name,
          slug,
          imageUrl:
            typeof body.imageUrl === "string" ? body.imageUrl.trim() : null,
        },
        include: { subCategories: true },
      });
      return Response.json(category, { status: 201 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return Response.json(
          { error: "A category with this name or slug already exists" },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  if (typeof body.categoryId !== "string" || !body.categoryId.trim()) {
    return Response.json(
      { error: "categoryId is required for a subcategory" },
      { status: 400 },
    );
  }
  const category = await prisma.category.findUnique({
    where: { id: body.categoryId.trim() },
    select: { id: true },
  });
  if (!category) {
    return Response.json({ error: "Category not found" }, { status: 404 });
  }

  try {
    const subCategory = await prisma.subCategory.create({
      data: {
        name,
        slug,
        category: { connect: { id: category.id } },
      },
    });
    return Response.json(subCategory, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "A subcategory with this slug already exists" },
        { status: 409 },
      );
    }
    throw error;
  }
}
