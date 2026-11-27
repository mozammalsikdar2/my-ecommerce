import { NextResponse } from "next/server";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { getAuthenticatedUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";

const maxGuestWishlistItems = 500;
const maxProductIdLength = 128;

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { items: [] },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const records = await prisma.wishlistItem.findMany({
      where: { userId: user.id },
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true } },
            variants: {
              select: { id: true, size: true, color: true, stock: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const items = records
      .filter((record) => record.product.isActive)
      .map((record) => record.product);

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/wishlist failed:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Failed to load wishlist" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    if ("syncProductIds" in body) {
      if (!Array.isArray(body.syncProductIds)) {
        return NextResponse.json(
          { error: "syncProductIds must be an array" },
          { status: 400 },
        );
      }
      if (body.syncProductIds.length > maxGuestWishlistItems) {
        return NextResponse.json(
          { error: `A maximum of ${maxGuestWishlistItems} wishlist items can be synced at once` },
          { status: 400 },
        );
      }

      const uniqueIds = Array.from(
        new Set(
          body.syncProductIds
            .filter(
              (id): id is string =>
                typeof id === "string" &&
                id.trim().length > 0 &&
                id.length <= maxProductIdLength,
            )
            .map((id) => id.trim()),
        ),
      );

      if (uniqueIds.length === 0) {
        return NextResponse.json(
          { synced: true },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      const validProducts = await prisma.product.findMany({
        where: { id: { in: uniqueIds }, isActive: true },
        select: { id: true },
      });

      const result = await prisma.wishlistItem.createMany({
        data: validProducts.map((product) => ({
          userId: user.id,
          productId: product.id,
        })),
        skipDuplicates: true,
      });

      return NextResponse.json(
        { synced: true, added: result.count },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (
      typeof body.productId !== "string" ||
      body.productId.trim().length === 0 ||
      body.productId.length > maxProductIdLength
    ) {
      return NextResponse.json(
        { error: "A valid productId is required" },
        { status: 400 },
      );
    }

    const productId = body.productId.trim();
    const existing = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId: user.id,
          productId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.wishlistItem.delete({ where: { id: existing.id } });
      return NextResponse.json(
        { saved: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, isActive: true },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    await prisma.wishlistItem.createMany({
      data: [{ userId: user.id, productId }],
      skipDuplicates: true,
    });

    return NextResponse.json(
      { saved: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("POST /api/wishlist failed:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Failed to update wishlist" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
