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
} from "@/lib/product-utils";
import { requireRole } from "@/lib/auth-guard";
import { deleteProduct } from "@/lib/product-delete";
import { staffAuthorizationError } from "@/lib/user-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: {
      isActive: true,
      OR: [{ id }, { slug: id }],
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      subCategory: { select: { id: true, name: true, slug: true } },
      variants: true,
    },
  });
  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }
  return Response.json(product);
}

export async function PUT(request: Request, { params }: RouteContext) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const { id } = await params;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const allowedFields = new Set([
    "name",
    "sku",
    "description",
    "price",
    "discountPrice",
    "stock",
    "slug",
    "categoryId",
    "subCategoryId",
    "image",
    "images",
    "variants",
    "isFeatured",
    "isActive",
  ]);
  const unknownFields = Object.keys(body).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    return Response.json(
      { error: `Unsupported product fields: ${unknownFields.join(", ")}` },
      { status: 400 },
    );
  }
  if (Object.keys(body).length === 0) {
    return Response.json({ error: "Provide at least one field to update" }, { status: 400 });
  }

  const data: Prisma.ProductUpdateInput = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return Response.json({ error: "name cannot be empty" }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if ("sku" in body) {
    if (
      body.sku !== null &&
      (typeof body.sku !== "string" || body.sku.trim().length > 100)
    ) {
      return Response.json({ error: "sku must be a string of at most 100 characters or null" }, { status: 400 });
    }
    data.sku = typeof body.sku === "string" ? body.sku.trim() || null : null;
  }
  if ("slug" in body) {
    if (
      typeof body.slug !== "string" ||
      !isValidProductSlug(body.slug.trim().toLowerCase())
    ) {
      return Response.json(
        { error: "slug must contain lowercase letters, numbers, and hyphens" },
        { status: 400 },
      );
    }
    data.slug = body.slug.trim().toLowerCase();
  }
  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return Response.json(
        { error: "description must be a string or null" },
        { status: 400 },
      );
    }
    data.description = body.description ?? "";
  }
  if ("price" in body) {
    if (
      typeof body.price !== "number" ||
      !Number.isFinite(body.price) ||
      body.price <= 0
    ) {
      return Response.json({ error: "price must be a positive number" }, { status: 400 });
    }
    data.price = body.price;
  }
  if ("discountPrice" in body) {
    if (
      body.discountPrice !== null &&
      (typeof body.discountPrice !== "number" ||
        !Number.isFinite(body.discountPrice) ||
        body.discountPrice < 0)
    ) {
      return Response.json(
        { error: "discountPrice must be a non-negative number or null" },
        { status: 400 },
      );
    }
    data.discountPrice = body.discountPrice;
  }
  if ("stock" in body) {
    if (
      typeof body.stock !== "number" ||
      !Number.isSafeInteger(body.stock) ||
      body.stock < 0
    ) {
      return Response.json({ error: "stock must be a non-negative integer" }, { status: 400 });
    }
    data.stock = body.stock;
  }
  let resultingCategoryId = existing.categoryId;
  let resultingSubCategoryId = existing.subCategoryId;
  if ("categoryId" in body) {
    if (
      typeof body.categoryId !== "string" || body.categoryId.trim().length === 0
    ) {
      return Response.json(
        { error: "categoryId must be a non-empty string" },
        { status: 400 },
      );
    }
    resultingCategoryId = body.categoryId.trim();
  }
  if ("subCategoryId" in body) {
    if (
      body.subCategoryId !== null &&
      (typeof body.subCategoryId !== "string" ||
        body.subCategoryId.trim().length === 0)
    ) {
      return Response.json(
        { error: "subCategoryId must be a non-empty string or null" },
        { status: 400 },
      );
    }
    resultingSubCategoryId =
      typeof body.subCategoryId === "string"
        ? body.subCategoryId.trim()
        : null;
  }
  if (resultingCategoryId) {
    const category = await prisma.category.findUnique({
      where: { id: resultingCategoryId },
      select: { id: true },
    });
    if (!category) {
      return Response.json({ error: "Category not found" }, { status: 404 });
    }
  }
  if (resultingSubCategoryId) {
    const subCategory = await prisma.subCategory.findUnique({
      where: { id: resultingSubCategoryId },
      select: { id: true, categoryId: true },
    });
    if (!subCategory) {
      return Response.json({ error: "Subcategory not found" }, { status: 404 });
    }
    if (subCategory.categoryId !== resultingCategoryId) {
      return Response.json(
        { error: "Subcategory does not belong to the selected category" },
        { status: 400 },
      );
    }
  }
  if ("categoryId" in body) {
    data.category = { connect: { id: resultingCategoryId } };
  }
  if ("subCategoryId" in body) {
    data.subCategory = resultingSubCategoryId
      ? { connect: { id: resultingSubCategoryId } }
      : { disconnect: true };
  }
  if ("image" in body) {
    if (typeof body.image !== "string" || !isHttpUrl(body.image)) {
      return Response.json(
        { error: "image must be an HTTP or HTTPS URL" },
        { status: 400 },
      );
    }
    data.image = body.image;
  }
  if ("images" in body) {
    if (!isProductImageList(body.images)) {
      return Response.json(
        { error: "images must be an array of at most 20 HTTP or HTTPS URLs" },
        { status: 400 },
      );
    }
    data.images = body.images;
  }
  if ("variants" in body) {
    const variants = parseProductVariants(body.variants);
    if (variants === null) {
      return Response.json(
        { error: "variants must contain at most 50 valid variants" },
        { status: 400 },
      );
    }
    const validVariants = variants.filter(
      (variant) => variant.size !== null || variant.color !== null,
    );
    const computedStock = validVariants.reduce(
      (sum, variant) => sum + variant.stock,
      0,
    );
    if (validVariants.length > 0 && !Number.isSafeInteger(computedStock)) {
      return Response.json(
        { error: "Combined variant stock exceeds the supported range" },
        { status: 400 },
      );
    }
    if (validVariants.length > 0) data.stock = computedStock;
    data.variants = {
      deleteMany: {},
      create: validVariants,
    };
  }
  if ("isFeatured" in body) {
    if (typeof body.isFeatured !== "boolean") {
      return Response.json({ error: "isFeatured must be a boolean" }, { status: 400 });
    }
    data.isFeatured = body.isFeatured;
  }
  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") {
      return Response.json({ error: "isActive must be a boolean" }, { status: 400 });
    }
    data.isActive = body.isActive;
  }

  const resultingPrice = typeof body.price === "number" ? body.price : existing.price;
  const resultingDiscount =
    "discountPrice" in body ? body.discountPrice : existing.discountPrice;
  if (
    resultingDiscount !== null &&
    (typeof resultingDiscount !== "number" || resultingDiscount >= resultingPrice)
  ) {
    return Response.json(
      { error: "discountPrice must be lower than price" },
      { status: 400 },
    );
  }

  try {
    const product = await prisma.product.update({
      where: { id },
      data,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        subCategory: { select: { id: true, name: true, slug: true } },
        variants: true,
      },
    });
    return Response.json(product);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return Response.json(
          { error: "A product with this slug or SKU already exists" },
          { status: 409 },
        );
      }
      if (error.code === "P2025") {
        return Response.json({ error: "Product not found" }, { status: 404 });
      }
    }
    throw error;
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  const unknownFields = Object.keys(body).filter(
    (field) =>
      ![
        "stock",
        "stockDelta",
        "variantId",
        "isFeatured",
        "isFlashSale",
        "isActive",
      ].includes(field),
  );
  if (unknownFields.length > 0) {
    return Response.json(
      { error: `Unsupported product fields: ${unknownFields.join(", ")}` },
      { status: 400 },
    );
  }
  const hasStock = Object.hasOwn(body, "stock");
  const hasStockDelta = Object.hasOwn(body, "stockDelta");
  const hasProductFlags =
    Object.hasOwn(body, "isFeatured") ||
    Object.hasOwn(body, "isFlashSale") ||
    Object.hasOwn(body, "isActive");
  if (!hasStock && !hasStockDelta && !hasProductFlags) {
    return Response.json(
      {
        error:
          "Provide stock, stockDelta, isFeatured, isFlashSale, or isActive to update",
      },
      { status: 400 },
    );
  }
  if (hasStock && hasStockDelta) {
    return Response.json(
      { error: "Provide stock or stockDelta, not both" },
      { status: 400 },
    );
  }
  if (
    hasStock &&
    (typeof body.stock !== "number" ||
      !Number.isSafeInteger(body.stock) ||
      body.stock < 0)
  ) {
    return Response.json(
      { error: "stock must be a non-negative integer" },
      { status: 400 },
    );
  }
  if (
    hasStockDelta &&
    (typeof body.stockDelta !== "number" ||
      !Number.isSafeInteger(body.stockDelta))
  ) {
    return Response.json(
      { error: "stockDelta must be a safe integer" },
      { status: 400 },
    );
  }
  if (
    body.variantId !== undefined &&
    body.variantId !== null &&
    (typeof body.variantId !== "string" || body.variantId.trim().length === 0)
  ) {
    return Response.json(
      { error: "variantId must be a non-empty string or null" },
      { status: 400 },
    );
  }
  if (
    body.variantId !== undefined &&
    !hasStock &&
    !hasStockDelta
  ) {
    return Response.json(
      { error: "variantId can only be used with a stock update" },
      { status: 400 },
    );
  }
  if (
    Object.hasOwn(body, "isFeatured") &&
    typeof body.isFeatured !== "boolean"
  ) {
    return Response.json(
      { error: "isFeatured must be a boolean" },
      { status: 400 },
    );
  }
  if (
    Object.hasOwn(body, "isFlashSale") &&
    typeof body.isFlashSale !== "boolean"
  ) {
    return Response.json(
      { error: "isFlashSale must be a boolean" },
      { status: 400 },
    );
  }
  if (Object.hasOwn(body, "isActive") && typeof body.isActive !== "boolean") {
    return Response.json(
      { error: "isActive must be a boolean" },
      { status: 400 },
    );
  }

  const { id } = await params;
  const variantId =
    typeof body.variantId === "string" ? body.variantId.trim() : null;

  try {
    const product = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.product.findUnique({
        where: { id },
        select: {
          id: true,
          stock: true,
          variants: { select: { id: true, stock: true } },
        },
      });
      if (!existing) return null;

      if (hasStock || hasStockDelta) {
        let updatedStock: number;
        if (variantId) {
        const variant = existing.variants.find((item) => item.id === variantId);
        if (!variant) {
          throw new ProductStockRequestError(
            "Variant not found for this product",
            404,
          );
        }

          updatedStock =
            hasStockDelta
              ? Math.max(0, variant.stock + (body.stockDelta as number))
              : (body.stock as number);
          if (!Number.isSafeInteger(updatedStock)) {
            throw new ProductStockRequestError(
              "Updated stock exceeds the supported range",
              400,
            );
          }

        await transaction.productVariant.update({
          where: { id: variantId },
            data: { stock: updatedStock },
        });

        const variants = await transaction.productVariant.findMany({
          where: { productId: id },
          select: { stock: true },
        });
        const totalStock = variants.reduce(
          (sum, item) => sum + item.stock,
          0,
        );
        if (!Number.isSafeInteger(totalStock)) {
          throw new ProductStockRequestError(
            "Combined variant stock exceeds the supported range",
            400,
          );
        }
        await transaction.product.update({
          where: { id },
          data: { stock: totalStock },
        });
        } else {
          updatedStock = hasStockDelta
            ? Math.max(0, existing.stock + (body.stockDelta as number))
            : (body.stock as number);
          if (!Number.isSafeInteger(updatedStock)) {
            throw new ProductStockRequestError(
              "Updated stock exceeds the supported range",
              400,
            );
          }

          await transaction.product.update({
            where: { id },
            data: { stock: updatedStock },
          });
        }
      }

      if (hasProductFlags) {
        await transaction.product.update({
          where: { id },
          data: {
            ...(typeof body.isFeatured === "boolean"
              ? { isFeatured: body.isFeatured }
              : {}),
            ...(typeof body.isFlashSale === "boolean"
              ? { isFlashSale: body.isFlashSale }
              : {}),
            ...(typeof body.isActive === "boolean"
              ? { isActive: body.isActive }
              : {}),
          },
        });
      }

      return transaction.product.findUnique({
        where: { id },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          subCategory: { select: { id: true, name: true, slug: true } },
          variants: true,
        },
      });
    });

    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }
    return Response.json(product);
  } catch (error) {
    if (error instanceof ProductStockRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to update product stock:", error);
    return Response.json(
      { error: "Failed to update product stock" },
      { status: 500 },
    );
  }
}

class ProductStockRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { errorResponse } = await requireRole(["ADMIN"], request);
  if (errorResponse) return errorResponse;

  const { id } = await params;
  return deleteProduct(id);
}
