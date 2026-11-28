import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isHttpUrl,
  isRecord,
  readJsonBody,
} from "@/lib/api-utils";
import {
  isProductImageList,
  isValidProductSlug,
  parseProductVariants,
  slugifyProductName,
} from "@/lib/product-utils";
import { staffAuthorizationError } from "@/lib/user-auth";
import { listProducts } from "@/lib/product-list";

export async function GET(request: Request) {
  return listProducts(request);
}

export async function POST(request: Request) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const {
    name,
    description,
    price,
    discountPrice,
    stock,
    sku,
    isFeatured,
    isFlashSale,
    isActive,
  } = body;
  const image = body.image ?? "";
  const rawSlug = body.slug;
  const rawCategoryId = body.categoryId;
  const rawSubCategoryId = body.subCategoryId;
  const defaultImage =
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80";
  if (typeof name !== "string" || name.trim().length === 0) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  if (
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return Response.json({ error: "price must be a positive number" }, { status: 400 });
  }
  if (
    discountPrice !== undefined &&
    discountPrice !== null &&
    (typeof discountPrice !== "number" ||
      !Number.isFinite(discountPrice) ||
      discountPrice < 0 ||
      discountPrice >= price)
  ) {
    return Response.json(
      { error: "discountPrice must be a non-negative number lower than price" },
      { status: 400 },
    );
  }
  if (
    stock !== undefined &&
    (typeof stock !== "number" || !Number.isSafeInteger(stock) || stock < 0)
  ) {
    return Response.json({ error: "stock must be a non-negative integer" }, { status: 400 });
  }
  if (
    sku !== undefined &&
    sku !== null &&
    (typeof sku !== "string" || sku.trim().length > 100)
  ) {
    return Response.json({ error: "sku must be a string of at most 100 characters or null" }, { status: 400 });
  }
  if (typeof image !== "string" || (image !== "" && !isHttpUrl(image))) {
    return Response.json({ error: "image must be an HTTP or HTTPS URL" }, { status: 400 });
  }
  if (
    rawSlug !== undefined &&
    (typeof rawSlug !== "string" ||
      !isValidProductSlug(rawSlug.trim().toLowerCase()))
  ) {
    return Response.json(
      { error: "slug must contain lowercase letters, numbers, and hyphens" },
      { status: 400 },
    );
  }
  if (rawCategoryId !== undefined && rawCategoryId !== null &&
      (typeof rawCategoryId !== "string" || rawCategoryId.trim().length === 0)) {
    return Response.json(
      { error: "categoryId must be a non-empty string or null" },
      { status: 400 },
    );
  }
  if (
    rawSubCategoryId !== undefined &&
    rawSubCategoryId !== null &&
    (typeof rawSubCategoryId !== "string" ||
      rawSubCategoryId.trim().length === 0)
  ) {
    return Response.json(
      { error: "subCategoryId must be a non-empty string or null" },
      { status: 400 },
    );
  }
  if (body.images !== undefined && !isProductImageList(body.images)) {
    return Response.json(
      { error: "images must be an array of at most 20 HTTP or HTTPS URLs" },
      { status: 400 },
    );
  }
  const variants =
    body.variants === undefined ? [] : parseProductVariants(body.variants);
  if (variants === null) {
    return Response.json(
      { error: "variants must contain at most 50 valid variants" },
      { status: 400 },
    );
  }
  const validVariants = variants.filter(
    (variant) => variant.size !== null || variant.color !== null,
  );
  const computedStock =
    validVariants.length > 0
      ? validVariants.reduce((sum, variant) => sum + variant.stock, 0)
      : stock ?? 25;
  if (!Number.isSafeInteger(computedStock)) {
    return Response.json(
      { error: "Combined variant stock exceeds the supported range" },
      { status: 400 },
    );
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return Response.json(
      { error: "description must be a string or null" },
      { status: 400 },
    );
  }
  if (isFeatured !== undefined && typeof isFeatured !== "boolean") {
    return Response.json({ error: "isFeatured must be a boolean" }, { status: 400 });
  }
  if (isFlashSale !== undefined && typeof isFlashSale !== "boolean") {
    return Response.json(
      { error: "isFlashSale must be a boolean" },
      { status: 400 },
    );
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    return Response.json({ error: "isActive must be a boolean" }, { status: 400 });
  }

  const slug =
    typeof rawSlug === "string"
      ? rawSlug.trim().toLowerCase()
      : slugifyProductName(name.trim()) || `product-${randomUUID()}`;
  if (!isValidProductSlug(slug)) {
    return Response.json(
      { error: "A valid slug is required for this product name" },
      { status: 400 },
    );
  }

  let categoryId =
    typeof rawCategoryId === "string" ? rawCategoryId.trim() : null;
  const subCategoryId =
    typeof rawSubCategoryId === "string" ? rawSubCategoryId.trim() : null;

  if (categoryId) {
    const categoryExists = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!categoryExists) {
      return Response.json({ error: "Category not found" }, { status: 404 });
    }
  }
  if (subCategoryId) {
    const subCategory = await prisma.subCategory.findUnique({
      where: { id: subCategoryId },
      select: { id: true, categoryId: true },
    });
    if (!subCategory) {
      return Response.json({ error: "Subcategory not found" }, { status: 404 });
    }
    if (categoryId && categoryId !== subCategory.categoryId) {
      return Response.json(
        { error: "Subcategory does not belong to the selected category" },
        { status: 400 },
      );
    }
    categoryId = subCategory.categoryId;
  }
  if (!categoryId) {
    return Response.json({ error: "A category is required for every product" }, { status: 400 });
  }

  try {
    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        sku: typeof sku === "string" ? sku.trim() || null : null,
        slug,
        description: description ?? "",
        price,
        discountPrice: discountPrice ?? null,
        stock: computedStock,
        image: image || defaultImage,
        images: body.images ?? [image || defaultImage],
        categoryId,
        subCategoryId,
        variants: { create: validVariants },
        isFeatured: isFeatured ?? false,
        isFlashSale: isFlashSale ?? false,
        isActive: isActive ?? true,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        subCategory: { select: { id: true, name: true, slug: true } },
        variants: true,
      },
    });
    return Response.json(product, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "A product with this slug or SKU already exists" },
        { status: 409 },
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return Response.json(
        { error: "Selected category or subcategory no longer exists" },
        { status: 409 },
      );
    }
    throw error;
  }
}
