import { isHttpUrl, isRecord } from "@/lib/api-utils";

export function slugifyProductName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidProductSlug(slug: string) {
  return (
    slug.length > 0 &&
    slug.length <= 160 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

export function isProductImageList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 20 &&
    value.every((image) => typeof image === "string" && isHttpUrl(image))
  );
}

export interface ProductVariantInput {
  size: string | null;
  color: string | null;
  price: number | null;
  stock: number;
  sku: string | null;
}

export function parseProductVariants(
  value: unknown,
): ProductVariantInput[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;

  const variants: ProductVariantInput[] = [];
  for (const variant of value) {
    if (!isRecord(variant)) return null;

    if (
      Object.keys(variant).some(
        (key) => !["size", "color", "price", "stock", "sku"].includes(key),
      )
    ) {
      return null;
    }

    const size = variant.size;
    const color = variant.color;
    const price = variant.price;
    const stock = variant.stock;
    const sku = variant.sku;

    if (
      (size !== undefined &&
        size !== null &&
        (typeof size !== "string" || size.trim().length > 80)) ||
      (color !== undefined &&
        color !== null &&
        (typeof color !== "string" || color.trim().length > 80)) ||
      (price !== undefined &&
        price !== null &&
        (typeof price !== "number" || !Number.isFinite(price) || price <= 0)) ||
      (stock !== undefined &&
        (typeof stock !== "number" ||
          !Number.isSafeInteger(stock) ||
          stock < 0)) ||
      (sku !== undefined &&
        sku !== null &&
        (typeof sku !== "string" || sku.trim().length > 100))
    ) {
      return null;
    }

    variants.push({
      size: typeof size === "string" && size.trim() ? size.trim() : null,
      color: typeof color === "string" && color.trim() ? color.trim() : null,
      price: typeof price === "number" ? price : null,
      stock: typeof stock === "number" ? stock : 0,
      sku: typeof sku === "string" && sku.trim() ? sku.trim() : null,
    });
  }

  return variants;
}
