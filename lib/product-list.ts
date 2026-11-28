import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { staffAuthorizationError } from "@/lib/user-auth";

export async function listProducts(request: Request, admin = false) {
  if (admin) {
    const authError = await staffAuthorizationError(request);
    if (authError) return authError;
  }

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
    const sort = searchParams.get("sort") || (admin ? "category" : "newest");
    const includeInactive = searchParams.has("includeInactive")
      ? searchParams.get("includeInactive") === "true"
      : admin;

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
    if (!["newest", "price_asc", "price_desc"].includes(sort) && !(admin && sort === "category")) {
      return Response.json(
        { error: `sort must be newest, price_asc, price_desc${admin ? ", or category" : ""}` },
        { status: 400 },
      );
    }

    if (includeInactive && !admin) {
      const authError = await staffAuthorizationError(request);
      if (authError) return authError;
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] =
      sort === "price_asc"
        ? { price: "asc" }
        : sort === "price_desc"
          ? { price: "desc" }
          : sort === "category"
            ? [{ category: { name: "asc" } }, { sku: "asc" }, { createdAt: "desc" }]
            : { createdAt: "desc" };

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
    if ((!categoryId || categoryId === "ALL") && category && category !== "ALL") {
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
          ...(admin ? [{ sku: { contains: search, mode: "insensitive" as const } }] : []),
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
    console.error(`GET /api/${admin ? "admin/" : ""}products error:`, error);
    return Response.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
