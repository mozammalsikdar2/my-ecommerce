import { Prisma } from "@prisma/client";
import { z } from "zod";
import { numericInput } from "@/lib/admin-product-input";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { staffAuthorizationError } from "@/lib/user-auth";

const editSchema = z.object({
  id: z.string().trim().min(1),
  price: z.number().finite().positive().optional(),
  discountPrice: z.number().finite().nonnegative().nullable().optional(),
  stock: z.number().int().min(0).max(2_147_483_647).optional(),
}).strict().refine(
  (item) => item.price !== undefined || item.discountPrice !== undefined || item.stock !== undefined,
  "Each item must include a price, discountPrice, or stock",
);

const rowSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  price: z.preprocess(numericInput, z.number().finite().positive().optional()),
  discountPrice: z.preprocess(
    (value) => value === "" ? null : numericInput(value),
    z.number().finite().nonnegative().nullable().optional(),
  ),
  stock: z.preprocess(numericInput, z.number().int().min(0).max(2_147_483_647).optional()),
}).strict().refine(
  (row) => row.name !== undefined || row.price !== undefined || row.discountPrice !== undefined || row.stock !== undefined,
  "Each row must include a field to update",
);

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    items: z.array(editSchema).min(1).max(100),
  }).strict(),
  z.object({
    action: z.literal("discount"),
    categoryId: z.string().trim().min(1),
    percentage: z.number().finite().min(0).max(100),
  }).strict(),
  z.object({
    action: z.literal("SAVE_ROWS"),
    rows: z.array(rowSchema).min(1).max(100),
  }).strict(),
  z.object({
    action: z.literal("CATEGORY_PERCENT"),
    categoryId: z.string().trim().min(1).refine((id) => id !== "ALL", "Select a specific category"),
    percent: z.preprocess(
      numericInput,
      z.number().finite().refine((value) => value !== 0, "Percentage must be non-zero"),
    ),
  }).strict(),
]);

class BulkRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function POST(request: Request) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid bulk request" },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const items = input.action === "save"
    ? input.items
    : input.action === "SAVE_ROWS"
      ? input.rows.map((row) => ({
          ...row,
          ...(row.price !== undefined ? { price: Math.max(1, row.price) } : {}),
        }))
      : null;
  if (items && new Set(items.map((item) => item.id)).size !== items.length) {
    return Response.json({ error: "Product IDs must not be duplicated" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      if (items) {
        const products = await transaction.product.findMany({
          where: { id: { in: items.map((item) => item.id) } },
          select: { id: true, price: true, discountPrice: true, _count: { select: { variants: true } } },
        });
        const byId = new Map(products.map((product) => [product.id, product]));
        for (const item of items) {
          const product = byId.get(item.id);
          if (!product) throw new BulkRequestError(`Product ${item.id} not found`, 404);
          if (item.stock !== undefined && product._count.variants > 0) {
            throw new BulkRequestError(`Stock for product ${item.id} must be edited by variant`, 409);
          }
          const price = item.price ?? product.price;
          const discount = item.discountPrice !== undefined ? item.discountPrice : product.discountPrice;
          if (discount !== null && discount >= price) {
            throw new BulkRequestError(`Discount price for product ${item.id} must be lower than its price`, 400);
          }
        }
        for (const item of items) {
          await transaction.product.update({
            where: { id: item.id },
            data: {
              ...("name" in item && typeof item.name === "string" ? { name: item.name } : {}),
              ...(item.price !== undefined ? { price: item.price } : {}),
              ...(item.discountPrice !== undefined ? { discountPrice: item.discountPrice } : {}),
              ...(item.stock !== undefined ? { stock: item.stock } : {}),
            },
          });
        }
        return input.action === "SAVE_ROWS"
          ? { updated: items.length, message: `Saved ${items.length} modified product(s).` }
          : { updated: items.length };
      }

      if (input.action !== "discount" && input.action !== "CATEGORY_PERCENT") {
        throw new BulkRequestError("Invalid bulk action", 400);
      }
      const category = await transaction.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true },
      });
      if (!category) throw new BulkRequestError("Category not found", 404);
      if (input.action === "CATEGORY_PERCENT") {
        const products = await transaction.product.findMany({
          where: { categoryId: input.categoryId },
          select: {
            id: true,
            price: true,
            discountPrice: true,
            variants: { where: { price: { not: null } }, select: { id: true } },
          },
        });
        const multiplier = 1 + input.percent / 100;
        const updates = products.map((product) => {
          const adjustedPrice = product.price * multiplier;
          const adjustedDiscount = product.discountPrice === null
            ? null
            : product.discountPrice * multiplier;
          if (!Number.isFinite(adjustedPrice) || (adjustedDiscount !== null && !Number.isFinite(adjustedDiscount))) {
            throw new BulkRequestError(`Adjusted prices for product ${product.id} are invalid`, 400);
          }
          const price = Math.max(10, Math.round(adjustedPrice));
          const discountPrice = product.discountPrice === null || product.discountPrice === 0
            ? product.discountPrice
            : Math.max(5, Math.round(product.discountPrice * multiplier));
          if (discountPrice !== null && discountPrice >= price) {
            throw new BulkRequestError(`Adjusted prices for product ${product.id} are invalid`, 400);
          }
          return { id: product.id, price, discountPrice };
        });
        for (const product of updates) {
          await transaction.product.update({
            where: { id: product.id },
            data: { price: product.price, discountPrice: product.discountPrice },
          });
        }
        return {
          updated: updates.length,
          productsWithFixedPriceVariants: products.filter((product) => product.variants.length > 0).length,
          message: `Updated prices by ${input.percent > 0 ? "+" : ""}${input.percent}% across ${updates.length} products.`,
        };
      }
      const products = await transaction.product.findMany({
        where: { categoryId: input.categoryId, isActive: true },
        select: {
          id: true,
          price: true,
          variants: { where: { price: { not: null } }, select: { id: true } },
        },
      });
      const updates = products.map((product) => {
        const discountPrice = input.percentage === 0
          ? null
          : Math.round((product.price * (1 - input.percentage / 100) + Number.EPSILON) * 100) / 100;
        if (discountPrice !== null && (!Number.isFinite(discountPrice) || discountPrice >= product.price)) {
          throw new BulkRequestError(`Discount for product ${product.id} is too small to represent`, 400);
        }
        return { id: product.id, discountPrice };
      });
      for (const product of updates) {
        await transaction.product.update({
          where: { id: product.id },
          data: { discountPrice: product.discountPrice },
        });
      }
      return {
        updated: updates.length,
        productsWithFixedPriceVariants: products.filter((product) => product.variants.length > 0).length,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof BulkRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return Response.json({ error: "Products changed concurrently; retry the bulk update" }, { status: 409 });
    }
    console.error("Failed to update products in bulk:", error);
    return Response.json({ error: "Failed to update products in bulk" }, { status: 500 });
  }
}
