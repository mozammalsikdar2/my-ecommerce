import { prisma } from "@/lib/prisma";
import { calculateCouponDiscount } from "@/lib/coupons";
import { isRecord, readJsonBody } from "@/lib/api-utils";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (
    !isRecord(body) ||
    typeof body.code !== "string" ||
    !body.code.trim() ||
    !Array.isArray(body.items) ||
    body.items.length === 0 ||
    body.items.length > 100
  ) {
    return Response.json(
      { error: "A coupon code and non-empty items array are required" },
      { status: 400 },
    );
  }

  const linesByKey = new Map<
    string,
    { productId: string; variantId: string | null; quantity: number }
  >();
  for (const item of body.items) {
    if (
      !isRecord(item) ||
      typeof item.productId !== "string" ||
      !item.productId.trim() ||
      (item.variantId !== undefined &&
        item.variantId !== null &&
        (typeof item.variantId !== "string" || !item.variantId.trim())) ||
      typeof item.quantity !== "number" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return Response.json(
        { error: "Each item needs a productId, optional variantId, and positive quantity" },
        { status: 400 },
      );
    }
    const productId = item.productId.trim();
    const variantId =
      typeof item.variantId === "string" ? item.variantId.trim() : null;
    const lineKey = JSON.stringify([productId, variantId]);
    const quantity = (linesByKey.get(lineKey)?.quantity ?? 0) + item.quantity;
    if (quantity > 10000) {
      return Response.json(
        { error: "The requested quantity is too large" },
        { status: 400 },
      );
    }
    linesByKey.set(lineKey, { productId, variantId, quantity });
  }
  const lines = [...linesByKey.values()];
  const totalByProduct = new Map<string, number>();
  for (const line of lines) {
    const quantity =
      (totalByProduct.get(line.productId) ?? 0) + line.quantity;
    if (quantity > 10000) {
      return Response.json(
        { error: "The requested quantity for a product is too large" },
        { status: 400 },
      );
    }
    totalByProduct.set(line.productId, quantity);
  }

  try {
  const products = await prisma.product.findMany({
    where: {
      id: { in: [...new Set(lines.map((line) => line.productId))] },
      isActive: true,
    },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));
  if (productsById.size !== new Set(lines.map((line) => line.productId)).size) {
    return Response.json(
      { error: "One or more products are unavailable" },
      { status: 404 },
    );
  }

  const variantIds = [
    ...new Set(
      lines
        .map((line) => line.variantId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const variants = variantIds.length
    ? await prisma.productVariant.findMany({ where: { id: { in: variantIds } } })
    : [];
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
  if (variants.length !== variantIds.length) {
    return Response.json(
      { error: "One or more product variants are unavailable" },
      { status: 404 },
    );
  }

  let subtotal = 0;
  for (const line of lines) {
    const product = productsById.get(line.productId);
    const variant = line.variantId ? variantsById.get(line.variantId) : null;
    if (!product || (variant && variant.productId !== product.id)) {
      return Response.json(
        { error: "A selected variant does not belong to its product" },
        { status: 400 },
      );
    }
    if (variant && variant.stock < line.quantity) {
      return Response.json(
        { error: `Insufficient stock for ${product.name}` },
        { status: 409 },
      );
    }
    subtotal +=
      (variant?.price ?? product.discountPrice ?? product.price) * line.quantity;
  }
  for (const [productId, quantity] of totalByProduct) {
    const product = productsById.get(productId);
    if (!product || product.stock < quantity) {
      return Response.json(
        { error: `Insufficient stock for ${product?.name ?? "product"}` },
        { status: 409 },
      );
    }
  }
  subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;

  const coupon = await prisma.coupon.findFirst({
    where: {
      code: {
        equals: body.code.replace(/\s+/g, "").toUpperCase(),
        mode: "insensitive",
      },
    },
  });
  if (!coupon) {
    return Response.json(
      { error: "Coupon is invalid or unavailable" },
      { status: 400 },
    );
  }

  const result = calculateCouponDiscount(coupon, subtotal);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({
    valid: true,
    code: coupon.code,
    discountAmount: result.discountAmount,
    subtotal,
    totalAfterDiscount:
      Math.round((subtotal - result.discountAmount + Number.EPSILON) * 100) /
      100,
    message: `Coupon "${coupon.code}" applied! You saved ৳${result.discountAmount}.`,
  });
  } catch (error) {
    console.error("Coupon validation error:", error);
    return Response.json(
      { error: "Failed to validate coupon" },
      { status: 500 },
    );
  }
}
