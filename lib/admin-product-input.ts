export function numericInput(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

export function normalizeAdminProductInput(body: Record<string, unknown>) {
  return {
    ...body,
    ...(typeof body.sku === "string" ? { sku: body.sku.trim().toUpperCase() } : {}),
    ...(typeof body.description === "string" ? { description: body.description.trim() } : {}),
    ...(typeof body.image === "string" ? { image: body.image.trim() } : {}),
    ...(typeof body.subCategoryId === "string" && !body.subCategoryId.trim()
      ? { subCategoryId: null }
      : {}),
    ...(body.price !== undefined ? { price: numericInput(body.price) } : {}),
    ...(body.discountPrice !== undefined
      ? { discountPrice: body.discountPrice === "" ? null : numericInput(body.discountPrice) }
      : {}),
    ...(body.stock !== undefined ? { stock: numericInput(body.stock) } : {}),
  };
}
