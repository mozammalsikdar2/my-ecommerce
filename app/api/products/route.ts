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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId")?.trim();
    const category = searchParams.get("category")?.trim();
    const subCategoryId = searchParams.get("subCategoryId")?.trim();
    const search = searchParams.get("search")?.trim();
    const featured = searchParams.get("featured");
    const flashSale = searchParams.get("flashSale");
    const inStock = searchParams.get("inStock") === "true";
    const lowStock = searchParams.get("lowStock") === "true";
    const minPriceParam = searchParams.get("minPrice")?.trim() || null;
    const maxPriceParam = searchParams.get("maxPrice")?.trim() || null;
    const minPrice = minPriceParam === null ? null : Number(minPriceParam);
    const maxPrice = maxPriceParam === null ? null : Number(maxPriceParam);
    const sort = searchParams.get("sort") || "newest";
    const includeInactive = searchParams.get("includeInactive") === "true";

    if (
      (minPrice !== null && (!Number.isFinite(minPrice) || minPrice < 0)) ||
      (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
      (minPrice !== null && maxPrice !== null && minPrice > maxPrice)
    ) {
      return Response.json(
        { error: "Price filters must be non-negative numbers with minPrice <= maxPrice" },
        { status: 400 },
      );
    }
    if (!["newest", "price_asc", "price_desc"].includes(sort)) {
      return Response.json(
        { error: "sort must be newest, price_asc, or price_desc" },
        { status: 400 },
      );
    }

    if (includeInactive) {
      const authError = await staffAuthorizationError(request);
      if (authError) return authError;
    }

    const orderBy =
      sort === "price_asc"
        ? { price: "asc" as const }
        : sort === "price_desc"
          ? { price: "desc" as const }
          : { createdAt: "desc" as const };

    const where: Prisma.ProductWhereInput = {
      ...(!includeInactive ? { isActive: true } : {}),
      ...(categoryId && categoryId !== "ALL" ? { categoryId } : {}),
      ...(subCategoryId ? { subCategoryId } : {}),
      ...(featured === "true" ? { isFeatured: true } : {}),
      ...(flashSale === "true" ? { isFlashSale: true } : {}),
      ...(inStock && lowStock
        ? { stock: { gt: 0, lte: 5 } }
        : inStock
          ? { stock: { gt: 0 } }
          : lowStock
            ? { stock: { lte: 5 } }
            : {}),
      ...(minPrice !== null || maxPrice !== null
        ? {
            price: {
              ...(minPrice !== null ? { gte: minPrice } : {}),
              ...(maxPrice !== null ? { lte: maxPrice } : {}),
            },
          }
        : {}),
    };
    const andConditions: Prisma.ProductWhereInput[] = [];
    if (
      (!categoryId || categoryId === "ALL") &&
      category &&
      category !== "ALL"
    ) {
      andConditions.push({
        OR: [
          { categoryId: category },
          { category: { is: { slug: category } } },
        ],
      });
    }
    if (search) {
      andConditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      });
    }
    if (andConditions.length > 0) where.AND = andConditions;

    const products = await prisma.product.findMany({
      where,
      orderBy,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        subCategory: { select: { id: true, name: true, slug: true } },
        variants: true,
      },
    });
    return Response.json(products);
  } catch (error) {
    console.error("GET /api/products error:", error);
    return Response.json({ error: "Failed to fetch products" }, { status: 500 });
  }
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
      : stock ?? 0;
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

  try {
    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        slug,
        description,
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
        { error: "A product with this slug already exists" },
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
