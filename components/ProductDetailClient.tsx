"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Share2,
  ShieldCheck,
  Truck,
  Zap,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { useCart } from "@/context/CartContext";
import AddToCartButton from "@/components/AddToCartButton";
import WishlistButton from "@/components/WishlistButton";
import ImageZoomViewer from "@/components/product/ImageZoomViewer";
import { trackGa4ViewItem } from "@/lib/ga4";
import { trackMetaEvent } from "@/lib/meta-pixel";

interface ProductVariant {
  id: string;
  size: string | null;
  color: string | null;
  price: number | null;
  stock: number;
}

export interface ProductDetail {
  id: string;
  name: string;
  description: string | null;
  price: number;
  discountPrice: number | null;
  stock: number;
  image: string;
  images: string[];
  categoryId: string | null;
  category: { id: string; name: string } | null;
  subCategory: { name: string } | null;
  variants: ProductVariant[];
}

const fallbackProductImage =
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80";

export default function ProductDetailClient({
  product,
  relatedProducts,
}: {
  product: ProductDetail;
  relatedProducts: ProductDetail[];
}) {
  const { settings } = useSettings();
  const { addToCart, isLoaded: isCartLoaded } = useCart();
  const router = useRouter();
  const [selectedVariant, setSelectedVariant] =
    useState<ProductVariant | null>(
      () =>
        product.variants.find((variant) => variant.stock > 0) ??
        product.variants[0] ??
        null,
    );
  const [quantity, setQuantity] = useState(1);
  const [cartFeedback, setCartFeedback] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"copied" | "error" | null>(
    null,
  );

  useEffect(() => {
    const price = product.discountPrice ?? product.price;

    trackGa4ViewItem({
      item_id: product.id,
      item_name: product.name,
      item_category: product.category?.name,
      price,
      quantity: 1,
    });

    trackMetaEvent({
      eventName: "ViewContent",
      eventId: `vc_${product.id}_${Date.now()}`,
      customData: {
        currency: "BDT",
        value: price,
        content_ids: [product.id],
        content_name: product.name,
        content_type: "product",
      },
      sendServerCapi: true,
    });
  }, [
    product.id,
    product.name,
    product.price,
    product.discountPrice,
    product.category?.name,
  ]);

  useEffect(() => {
    if (!cartFeedback) return;
    const timer = window.setTimeout(() => setCartFeedback(null), 2000);
    return () => window.clearTimeout(timer);
  }, [cartFeedback]);

  useEffect(() => {
    if (!shareStatus) return;
    const timer = window.setTimeout(() => setShareStatus(null), 2000);
    return () => window.clearTimeout(timer);
  }, [shareStatus]);

  const gallery = [
    ...new Set([product.image, ...product.images].filter(Boolean)),
  ];
  const displayPrice =
    selectedVariant?.price ?? product.discountPrice ?? product.price;
  const availableStock = selectedVariant
    ? selectedVariant.stock
    : product.stock;
  const categoryLabel = [
    product.category?.name || "General",
    product.subCategory?.name,
  ]
    .filter(Boolean)
    .join(" / ");
  const variantLabel = selectedVariant
    ? [selectedVariant.size, selectedVariant.color]
        .filter(Boolean)
        .join(" / ") || undefined
    : undefined;
  const cartItem = {
    productId: product.id,
    variantId: selectedVariant?.id ?? null,
    name: product.name,
    image: product.image || gallery[0] || fallbackProductImage,
    price: displayPrice,
    stock: availableStock,
    variantInfo: selectedVariant
      ? [
          selectedVariant.size ? `Size: ${selectedVariant.size}` : null,
          selectedVariant.color ? `Color: ${selectedVariant.color}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || null
      : null,
    variantLabel,
    quantity,
  };
  const handleOrderNow = () => {
    const addError = addToCart(cartItem);
    if (addError) {
      setCartFeedback(addError);
      return;
    }
    router.push("/checkout");
  };

  const handleShareProduct = async () => {
    const url = window.location.href;
    const shareData = {
      title: `${product.name} — ৳${displayPrice}`,
      text: `Check out ${product.name} at ${settings.storeName}!`,
      url,
    };

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (shareError) {
        if (
          shareError instanceof DOMException &&
          shareError.name === "AbortError"
        ) {
          return;
        }
      }
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is unavailable");
      }
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
    } catch (shareError) {
      console.error("Could not share product link:", shareError);
      setShareStatus("error");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs text-gray-500"
        >
          <Link
            href="/products"
            className="flex items-center gap-1 hover:text-black"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Products
          </Link>
          {product.category && (
            <>
              <span aria-hidden="true">/</span>
              <Link
                href={`/products?categoryId=${encodeURIComponent(
                  product.category.id,
                )}`}
                className="hover:text-black"
              >
                {product.category.name}
              </Link>
            </>
          )}
          {product.subCategory && (
            <>
              <span aria-hidden="true">/</span>
              <span>{product.subCategory.name}</span>
            </>
          )}
        </nav>

        <button
          type="button"
          onClick={() => void handleShareProduct()}
          className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          {shareStatus === "copied" ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-600" />
              <span aria-live="polite" className="text-green-700">
                Link Copied!
              </span>
            </>
          ) : shareStatus === "error" ? (
            <span role="alert" className="text-red-700">
              Unable to share link
            </span>
          ) : (
            <>
              <Share2 className="h-3.5 w-3.5" />
              <span>Share Product</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-10 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-2">
        <ImageZoomViewer images={gallery} alt={product.name} />

        <div className="flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              {categoryLabel}
            </div>

            <h1 className="mt-2 text-2xl font-extrabold text-gray-900 sm:text-3xl">
              {product.name}
            </h1>

            <div className="mt-4 flex items-baseline gap-3">
              <span
                style={{ color: settings.primaryColor }}
                className="text-3xl font-extrabold"
              >
                ৳{displayPrice}
              </span>
              {product.discountPrice !== null &&
                (selectedVariant === null || selectedVariant.price === null) && (
                  <span className="text-base text-gray-400 line-through">
                    ৳{product.price}
                  </span>
                )}
            </div>

            {product.variants.length > 0 && (
              <div className="mt-6">
                <p className="block text-xs font-bold uppercase text-gray-700">
                  Select Option (Size / Color)
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.variants.map((variant) => {
                    const isSelected = selectedVariant?.id === variant.id;
                    const label =
                      [variant.size, variant.color]
                        .filter(Boolean)
                        .join(" - ") || "Option";
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        disabled={variant.stock <= 0}
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedVariant(variant);
                          setQuantity(1);
                          setCartFeedback(null);
                        }}
                        style={
                          isSelected
                            ? {
                                borderColor: settings.primaryColor,
                                backgroundColor: settings.primaryColor,
                                color: "#fff",
                              }
                            : {}
                        }
                        className="rounded-lg border px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center gap-2 text-sm">
              <CheckCircle2
                className={`h-4 w-4 ${
                  availableStock > 0 ? "text-green-600" : "text-red-500"
                }`}
              />
              <span className="font-medium text-gray-700">
                {availableStock > 0
                  ? `In Stock (${availableStock} units available)`
                  : "Out of Stock"}
              </span>
            </div>

            {availableStock > 0 && (
              <div className="mt-6">
                <label className="block text-xs font-bold uppercase text-gray-700">
                  Quantity
                </label>
                <div className="mt-2 inline-flex items-center rounded-lg border bg-gray-50">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    className="px-3.5 py-2 text-sm font-bold text-gray-700 hover:bg-gray-200"
                  >
                    -
                  </button>
                  <span className="min-w-[44px] text-center text-sm font-extrabold">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() =>
                      setQuantity((value) =>
                        Math.min(availableStock, 10000, value + 1),
                      )
                    }
                    disabled={quantity >= availableStock || quantity >= 10000}
                    className="px-3.5 py-2 text-sm font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {product.description && (
              <div className="mt-6 border-t pt-5">
                <h2 className="text-xs font-bold uppercase text-gray-700">
                  Product Description
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                  {product.description}
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 space-y-4 border-t pt-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AddToCartButton
                key={`${product.id}:${selectedVariant?.id ?? "default"}`}
                productId={cartItem.productId}
                variantId={cartItem.variantId}
                variantInfo={cartItem.variantInfo}
                variantLabel={cartItem.variantLabel}
                name={cartItem.name}
                price={cartItem.price}
                image={cartItem.image}
                stock={cartItem.stock}
                quantity={cartItem.quantity}
                label="Add to Cart"
                addedLabel="Added to Cart"
                disabled={availableStock <= 0}
                style={{
                  backgroundColor: "white",
                  borderColor: settings.primaryColor,
                  color: settings.primaryColor,
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 bg-white py-3.5 text-sm font-bold transition hover:bg-gray-50 disabled:opacity-40"
              />
              <button
                type="button"
                disabled={availableStock <= 0 || !isCartLoaded}
                onClick={handleOrderNow}
                style={{ backgroundColor: settings.primaryColor }}
                className="flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-40"
              >
                <Zap className="h-4 w-4" /> Order Now
              </button>
            </div>
            <WishlistButton
              productId={product.id}
              variant="button"
              className="w-full"
            />
            {cartFeedback && (
              <p
                role="alert"
                className="mt-2 text-center text-sm text-red-700"
              >
                {cartFeedback}
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 rounded-xl bg-gray-50 p-3 text-[11px] text-gray-600 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Truck
                  style={{ color: settings.primaryColor }}
                  className="h-4 w-4 shrink-0"
                />
                <span>
                  Dhaka: ৳{settings.deliveryChargeInside} | Outside: ৳
                  {settings.deliveryChargeOutside}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck
                  style={{ color: settings.primaryColor }}
                  className="h-4 w-4 shrink-0"
                />
                <span>100% Authentic & Cash on Delivery</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {relatedProducts.length > 0 && (
        <section aria-labelledby="related-products-heading">
          <h2
            id="related-products-heading"
            className="mb-4 text-xl font-extrabold text-gray-900"
          >
            Related Products
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="relative">
                  <Link
                    href={`/products/${encodeURIComponent(item.id)}`}
                    className="relative block h-44 overflow-hidden"
                  >
                    <Image
                      src={
                        item.image || item.images[0] || fallbackProductImage
                      }
                      alt={item.name}
                      fill
                      unoptimized
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover"
                    />
                  </Link>
                  <WishlistButton
                    productId={item.id}
                    className="absolute right-2.5 top-2.5 z-10"
                  />
                </div>
                <div className="p-3.5">
                  <Link href={`/products/${encodeURIComponent(item.id)}`}>
                    <h3 className="line-clamp-1 text-sm font-bold text-gray-800">
                      {item.name}
                    </h3>
                  </Link>
                  <p
                    style={{ color: settings.primaryColor }}
                    className="mt-1 text-base font-extrabold"
                  >
                    ৳{item.discountPrice ?? item.price}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
