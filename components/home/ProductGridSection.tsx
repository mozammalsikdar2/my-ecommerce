"use client";

import Image from "next/image";
import Link from "next/link";
import { useSettings } from "@/context/SettingsContext";
import AddToCartButton from "@/components/AddToCartButton";
import WishlistButton from "@/components/WishlistButton";

export interface StoreProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  discountPrice: number | null;
  stock: number;
  image: string;
  images: string[];
  categoryId: string | null;
  isFeatured: boolean;
  isFlashSale: boolean;
  category: { id: string; name: string; slug: string } | null;
  subCategory: { id: string; name: string; slug: string } | null;
  variants: {
    id: string;
    size: string | null;
    color: string | null;
    price: number | null;
    stock: number;
  }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProductVariant(
  value: unknown,
): value is StoreProduct["variants"][number] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (typeof value.size === "string" || value.size === null) &&
    (typeof value.color === "string" || value.color === null) &&
    (typeof value.price === "number" || value.price === null) &&
    typeof value.stock === "number"
  );
}

function isProductCategory(
  value: unknown,
): value is NonNullable<StoreProduct["category"]> {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string"
  );
}

export function isStoreProduct(value: unknown): value is StoreProduct {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.name === "string" &&
    (typeof value.description === "string" || value.description === null) &&
    typeof value.price === "number" &&
    (typeof value.discountPrice === "number" ||
      value.discountPrice === null) &&
    typeof value.stock === "number" &&
    typeof value.image === "string" &&
    Array.isArray(value.images) &&
    value.images.every((image) => typeof image === "string") &&
    (typeof value.categoryId === "string" || value.categoryId === null) &&
    typeof value.isFeatured === "boolean" &&
    typeof value.isFlashSale === "boolean" &&
    (value.category === null || isProductCategory(value.category)) &&
    (value.subCategory === null || isProductCategory(value.subCategory)) &&
    Array.isArray(value.variants) &&
    value.variants.every(isProductVariant)
  );
}

interface ProductGridSectionProps {
  title: string;
  subtitle?: string;
  products: StoreProduct[];
  activeFilterLabel?: string | null;
  onClearFilter?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function ProductGridSection({
  title,
  subtitle,
  products,
  activeFilterLabel,
  onClearFilter,
  isLoading = false,
  error = null,
}: ProductGridSectionProps) {
  const { settings } = useSettings();
  return (
    <section id="products" className="mx-auto max-w-7xl px-4 py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900">
            {activeFilterLabel || title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>

        {activeFilterLabel && onClearFilter && (
          <button
            type="button"
            onClick={onClearFilter}
            className="rounded-lg border bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100"
          >
            Show All Featured Products
          </button>
        )}
      </div>

      {isLoading ? (
        <p role="status" className="rounded-2xl border bg-white py-16 text-center text-sm text-gray-500">
          Loading products...
        </p>
      ) : error ? (
        <p role="alert" className="rounded-2xl border bg-red-50 p-6 text-sm text-red-800">
          {error}
        </p>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border bg-white py-16 text-center">
          <p className="text-sm font-semibold text-gray-500">
            No products found matching your selection.
          </p>
          {onClearFilter && (
            <button
              type="button"
              onClick={onClearFilter}
              style={{ backgroundColor: settings.primaryColor }}
              className="mt-4 rounded-lg px-5 py-2 text-xs font-bold text-white"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => {
            const displayPrice = product.discountPrice ?? product.price;
            const hasVariants = product.variants.length > 0;
            const image =
              product.image ||
              product.images[0] ||
              "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80";
            const productUrl = `/products/${encodeURIComponent(product.id)}`;

            return (
              <article
                key={product.id}
                className="group flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="relative">
                  <Link
                    href={productUrl}
                    className="relative block h-52 overflow-hidden bg-gray-100"
                  >
                    <Image
                      src={image}
                      alt={product.name}
                      fill
                      unoptimized
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition duration-300 group-hover:scale-105"
                    />
                    {product.stock <= 0 && (
                      <span className="absolute left-2.5 top-2.5 rounded-full bg-gray-900/80 px-2.5 py-1 text-[10px] font-bold text-white">
                        Sold Out
                      </span>
                    )}
                  </Link>
                  <WishlistButton
                    productId={product.id}
                    className="absolute right-2.5 top-2.5 z-10"
                  />
                </div>

                <div className="flex flex-1 flex-col justify-between p-4">
                  <div>
                    <div className="text-xs font-medium text-gray-400">
                      {product.category?.name || "Featured"}
                      {product.subCategory && ` › ${product.subCategory.name}`}
                    </div>

                    <Link href={productUrl}>
                      <h3 className="mt-1 line-clamp-2 font-bold text-gray-800 hover:underline">
                        {product.name}
                      </h3>
                    </Link>

                    <div className="mt-2 flex items-baseline gap-2">
                      <span
                        style={{ color: settings.primaryColor }}
                        className="text-lg font-extrabold"
                      >
                        ৳{displayPrice}
                      </span>
                      {product.discountPrice !== null && (
                        <span className="text-xs text-gray-400 line-through">
                          ৳{product.price}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    {hasVariants ? (
                      <Link
                        href={productUrl}
                        style={{ backgroundColor: settings.primaryColor }}
                        className="block w-full rounded-lg py-2.5 text-center text-xs font-bold text-white transition hover:opacity-90"
                      >
                        Choose Size / Color
                      </Link>
                    ) : (
                      <AddToCartButton
                        productId={product.id}
                        variantId={null}
                        name={product.name}
                        price={displayPrice}
                        image={image}
                        stock={product.stock}
                        quantity={1}
                        label={
                          product.stock > 0 ? "Add to Cart" : "Out of Stock"
                        }
                        addedLabel="Added to Cart"
                        disabled={product.stock <= 0}
                        style={{ backgroundColor: settings.primaryColor }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                      />
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
