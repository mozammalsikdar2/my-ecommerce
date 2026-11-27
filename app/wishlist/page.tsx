"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Heart,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useSettings } from "@/context/SettingsContext";
import {
  useWishlist,
  type WishlistProduct,
} from "@/context/WishlistContext";

const fallbackProductImage =
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80";

export default function WishlistPage() {
  const {
    wishlistProducts,
    loading,
    error: wishlistError,
    removeFromWishlist,
  } = useWishlist();
  const { addToCart } = useCart();
  const { settings } = useSettings();
  const [movedId, setMovedId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!movedId) return;
    const timer = window.setTimeout(() => setMovedId(null), 1600);
    return () => window.clearTimeout(timer);
  }, [movedId]);

  const handleMoveToCart = (product: WishlistProduct) => {
    setActionError(null);
    const unitPrice = product.discountPrice ?? product.price;
    const error = addToCart({
      productId: product.id,
      variantId: null,
      name: product.name,
      price: unitPrice,
      image: product.image || fallbackProductImage,
      stock: product.stock,
      quantity: 1,
    });

    if (error) {
      setActionError(error);
      return;
    }
    setMovedId(product.id);
  };

  const handleRemove = async (productId: string) => {
    setActionError(null);
    setRemovingId(productId);
    try {
      await removeFromWishlist(productId);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to remove wishlist item",
      );
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div
        role="status"
        className="mx-auto max-w-6xl px-4 py-24 text-center text-sm text-gray-500"
      >
        Loading your saved wishlist...
      </div>
    );
  }

  if (wishlistProducts.length === 0 && wishlistError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-8 text-sm text-red-800"
        >
          We couldn&apos;t load your wishlist. {wishlistError}
        </div>
        <Link
          href="/products"
          style={{ backgroundColor: settings.primaryColor }}
          className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md transition hover:opacity-90"
        >
          Browse Products
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (wishlistProducts.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="rounded-2xl border bg-white p-10 shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
            <Heart aria-hidden="true" className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-gray-900">
            Your Wishlist is Empty
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Tap the heart icon on any product to save it here for later.
          </p>
          <Link
            href="/products"
            style={{ backgroundColor: settings.primaryColor }}
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md transition hover:opacity-90"
          >
            <span>Browse Products</span>
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
            My Saved Wishlist ({wishlistProducts.length})
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Products you saved for later. Move them to your cart when you are
            ready to order.
          </p>
        </div>
      </div>

      {(wishlistError || actionError) && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {actionError || wishlistError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {wishlistProducts.map((product) => {
          const finalPrice = product.discountPrice ?? product.price;
          const hasVariants = product.variants.length > 0;
          const productUrl = `/products/${encodeURIComponent(product.id)}`;

          return (
            <article
              key={product.id}
              className="group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="relative">
                <Link
                  href={productUrl}
                  className="relative block h-52 overflow-hidden bg-gray-100"
                >
                  <Image
                    src={product.image || fallbackProductImage}
                    alt={product.name}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                </Link>
                <button
                  type="button"
                  onClick={() => void handleRemove(product.id)}
                  disabled={removingId === product.id}
                  aria-label={`Remove ${product.name} from wishlist`}
                  title="Remove from wishlist"
                  className="absolute right-2.5 top-2.5 rounded-full bg-white/90 p-2 text-red-600 shadow transition hover:bg-white disabled:cursor-wait disabled:opacity-50"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-1 flex-col justify-between p-4">
                <div>
                  <div className="text-[11px] font-semibold text-gray-400">
                    {product.category?.name || "Saved Item"}
                  </div>
                  <Link href={productUrl}>
                    <h2 className="mt-1 line-clamp-2 text-sm font-bold text-gray-900 hover:underline">
                      {product.name}
                    </h2>
                  </Link>

                  <div className="mt-2 flex items-baseline gap-2">
                    <span
                      style={{ color: settings.primaryColor }}
                      className="text-lg font-extrabold"
                    >
                      ৳{finalPrice.toLocaleString()}
                    </span>
                    {product.discountPrice !== null &&
                      product.discountPrice !== undefined && (
                        <span className="text-xs text-gray-400 line-through">
                          ৳{product.price.toLocaleString()}
                        </span>
                      )}
                  </div>

                  <div className="mt-1 text-[11px] font-semibold">
                    {product.stock > 0 ? (
                      <span className="text-green-700">In Stock</span>
                    ) : (
                      <span className="text-red-600">Out of Stock</span>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  {hasVariants ? (
                    <Link
                      href={productUrl}
                      style={{ backgroundColor: settings.primaryColor }}
                      className="block w-full rounded-xl py-2.5 text-center text-xs font-bold text-white transition hover:opacity-90"
                    >
                      Select Size / Color
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={product.stock <= 0 || movedId === product.id}
                      onClick={() => handleMoveToCart(product)}
                      style={{ backgroundColor: settings.primaryColor }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                    >
                      {movedId === product.id ? (
                        <>
                          <CheckCircle2
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                          <span>Added to Cart</span>
                        </>
                      ) : (
                        <>
                          <ShoppingCart
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                          <span>Move to Cart</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
