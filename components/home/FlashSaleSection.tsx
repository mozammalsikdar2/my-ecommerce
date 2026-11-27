"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import AddToCartButton from "@/components/AddToCartButton";
import WishlistButton from "@/components/WishlistButton";
import type { StoreProduct } from "@/components/home/ProductGridSection";

export type { StoreProduct } from "@/components/home/ProductGridSection";

interface TimeLeft {
  hours: string;
  minutes: string;
  seconds: string;
}

export default function FlashSaleSection({
  products,
  error = null,
}: {
  products: StoreProduct[];
  error?: string | null;
}) {
  const { settings } = useSettings();
  const [isExpired, setIsExpired] = useState(false);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    hours: "--",
    minutes: "--",
    seconds: "--",
  });

  useEffect(() => {
    let target: number;
    if (settings.flashSaleEndsAt) {
      target = Date.parse(settings.flashSaleEndsAt);
    } else {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      target = endOfDay.getTime();
    }

    const updateCountdown = () => {
      const difference = Number.isFinite(target)
        ? Math.max(0, target - Date.now())
        : 0;
      const hours = Math.floor(difference / 3_600_000);
      const minutes = Math.floor((difference / 60_000) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({
        hours: String(hours).padStart(2, "0"),
        minutes: String(minutes).padStart(2, "0"),
        seconds: String(seconds).padStart(2, "0"),
      });
      setIsExpired(difference === 0);
    };

    const initialTimer = window.setTimeout(updateCountdown, 0);
    const interval = window.setInterval(updateCountdown, 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [settings.flashSaleEndsAt]);

  if (isExpired) return null;
  if (products.length === 0) {
    return error ? (
      <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
        {error}
      </p>
    ) : null;
  }

  return (
    <section
      aria-labelledby="flash-sale-title"
      className="mx-auto max-w-7xl px-4 pt-12"
    >
      <div className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-amber-200/70 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <div>
              <h2
                id="flash-sale-title"
                className="text-xl font-extrabold text-gray-900 sm:text-2xl"
              >
                Flash Sale Deals
              </h2>
              <p className="text-xs text-gray-600">
                Limited-time discounts while stock lasts
              </p>
            </div>
          </div>

          <div
            aria-label={`Flash sale ends in ${timeLeft.hours} hours, ${timeLeft.minutes} minutes, and ${timeLeft.seconds} seconds`}
            className="flex items-center gap-2"
          >
            <span className="text-xs font-bold uppercase text-gray-500">
              Ends in:
            </span>
            {[
              { label: "HRS", value: timeLeft.hours },
              { label: "MIN", value: timeLeft.minutes },
              { label: "SEC", value: timeLeft.seconds },
            ].map((unit) => (
              <div
                key={unit.label}
                className="flex flex-col items-center rounded-lg bg-gray-900 px-2.5 py-1.5 text-white"
              >
                <span
                  aria-live="polite"
                  className="font-mono text-sm font-extrabold"
                >
                  {unit.value}
                </span>
                <span className="text-[9px] text-gray-400">{unit.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => {
            const salePrice = product.discountPrice ?? product.price;
            const discountPercent =
              product.discountPrice !== null &&
              product.discountPrice < product.price &&
              product.price > 0
                ? Math.round(
                    ((product.price - product.discountPrice) / product.price) *
                      100,
                  )
                : 0;
            const hasVariants = product.variants.length > 0;
            const image =
              product.image ||
              product.images[0] ||
              "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80";

            return (
              <article
                key={product.id}
                className="group flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="relative">
                  <Link
                    href={`/products/${encodeURIComponent(product.id)}`}
                    className="relative block h-48 overflow-hidden bg-gray-100"
                  >
                    <Image
                      src={image}
                      alt={product.name}
                      fill
                      unoptimized
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition duration-300 group-hover:scale-105"
                    />
                    {discountPercent > 0 && (
                      <span className="absolute left-2.5 top-2.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-extrabold text-white shadow">
                        -{discountPercent}% OFF
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
                    <span className="text-[11px] font-semibold uppercase text-gray-400">
                      {product.category?.name || "Hot Deal"}
                    </span>
                    <Link href={`/products/${encodeURIComponent(product.id)}`}>
                      <h3 className="mt-1 line-clamp-2 text-sm font-bold text-gray-900 hover:underline">
                        {product.name}
                      </h3>
                    </Link>

                    <div className="mt-2 flex items-baseline gap-2">
                      <span
                        style={{ color: settings.primaryColor }}
                        className="text-lg font-extrabold"
                      >
                        ৳{salePrice}
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
                        href={`/products/${encodeURIComponent(product.id)}`}
                        style={{ backgroundColor: settings.primaryColor }}
                        className="block w-full rounded-lg py-2 text-center text-xs font-bold text-white transition hover:opacity-90"
                      >
                        Select Options
                      </Link>
                    ) : (
                      <AddToCartButton
                        productId={product.id}
                        variantId={null}
                        name={product.name}
                        price={salePrice}
                        image={image}
                        stock={product.stock}
                        quantity={1}
                        label={
                          product.stock > 0 ? "Add to Cart" : "Out of Stock"
                        }
                        addedLabel="Added to Cart"
                        disabled={product.stock <= 0}
                        style={{ backgroundColor: settings.primaryColor }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                      />
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
