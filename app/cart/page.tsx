"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useSettings } from "@/context/SettingsContext";

function money(value: number) {
  return `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

export default function CartPage() {
  const {
    items,
    itemCount,
    subtotal,
    isLoaded,
    setQuantity,
    removeItem,
    clearCart,
  } = useCart();
  const { settings } = useSettings();

  if (!isLoaded) {
    return <div className="py-20 text-center text-gray-500">Loading cart...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="rounded-2xl border bg-white p-10 shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-gray-900">
            Your Shopping Cart is Empty
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Looks like you have not added any products to your cart yet.
          </p>
          <Link
            href="/products"
            style={{ backgroundColor: settings.primaryColor }}
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md transition hover:opacity-90"
          >
            <span>Explore Products</span>
            <ArrowRight className="h-4 w-4" />
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
            Shopping Cart ({itemCount} {itemCount === 1 ? "item" : "items"})
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Review your selected items and quantities before placing your order.
          </p>
        </div>
        <button
          type="button"
          onClick={clearCart}
          className="rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50"
        >
          Clear Cart
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section
          aria-label="Cart items"
          className="space-y-4 lg:col-span-2"
        >
            {items.map((item) => {
              const maxQuantity = item.stock ?? 10000;
              return (
                <article
                  key={item.key}
                  className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <Link
                    href={`/products/${encodeURIComponent(item.productId)}`}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-gray-50"
                  >
                    <Image
                      src={
                        item.image ||
                        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=300&q=80"
                      }
                      alt={item.name}
                      fill
                      unoptimized
                      sizes="96px"
                      className="object-cover"
                    />
                  </Link>

                  <div className="min-w-[140px] flex-1">
                    <Link
                      href={`/products/${encodeURIComponent(item.productId)}`}
                      className="font-bold text-gray-900 hover:underline"
                    >
                      {item.name}
                    </Link>
                    {(item.variantLabel || item.variantInfo) && (
                      <p className="mt-1 text-xs text-gray-500">
                        {item.variantLabel || item.variantInfo}
                      </p>
                    )}
                    <p
                      style={{ color: settings.primaryColor }}
                      className="mt-1.5 text-sm font-extrabold"
                    >
                      {money(item.price)} each
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t pt-3 sm:justify-end sm:border-t-0 sm:pt-0">
                    <div className="inline-flex items-center rounded-lg border bg-gray-50">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.name} quantity`}
                        disabled={item.quantity <= 1}
                        onClick={() => setQuantity(item.key, item.quantity - 1)}
                        className="p-2 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span
                        aria-label={`Quantity ${item.quantity}`}
                        className="min-w-[36px] text-center text-sm font-extrabold"
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${item.name} quantity`}
                        disabled={item.quantity >= maxQuantity}
                        onClick={() => setQuantity(item.key, item.quantity + 1)}
                        className="p-2 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="min-w-[85px] text-right text-base font-extrabold text-gray-900">
                      <p>{money(item.price * item.quantity)}</p>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name} from cart`}
                        onClick={() => removeItem(item.key)}
                        className="mt-2 rounded-lg p-2 text-red-500 transition hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          <div className="pt-2">
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-600 hover:text-black"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Continue Shopping</span>
            </Link>
          </div>
        </section>

        <aside className="h-fit space-y-5 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="border-b pb-3 text-lg font-extrabold text-gray-900">
            Cart Summary
          </h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Items Subtotal ({itemCount})</span>
              <span className="font-bold text-gray-900">{money(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Delivery Fee</span>
              <span className="text-xs font-semibold text-gray-500">
                {money(settings.deliveryChargeInside)} –{" "}
                {money(settings.deliveryChargeOutside)} (at checkout)
              </span>
            </div>
            <div className="flex justify-between border-t pt-3 text-base font-extrabold text-gray-900">
              <span>Estimated Subtotal</span>
              <span style={{ color: settings.primaryColor }}>
                {money(subtotal)}
              </span>
            </div>
          </div>

          <Link
            href="/checkout"
            style={{ backgroundColor: settings.primaryColor }}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition hover:opacity-90"
          >
            <span>Proceed to Checkout</span>
            <ArrowRight className="h-4 w-4" />
          </Link>

          <div className="space-y-2 rounded-xl bg-gray-50 p-3.5 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <Truck
                style={{ color: settings.primaryColor }}
                className="h-4 w-4 shrink-0"
              />
              <span>
                Inside Dhaka: {money(settings.deliveryChargeInside)} | Outside
                Dhaka: {money(settings.deliveryChargeOutside)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck
                style={{ color: settings.primaryColor }}
                className="h-4 w-4 shrink-0"
              />
              <span>Cash on Delivery, bKash & Nagad supported</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
