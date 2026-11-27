"use client";

import type { MouseEvent } from "react";
import { useState } from "react";
import { Heart } from "lucide-react";
import { useWishlist } from "@/context/WishlistContext";

interface WishlistButtonProps {
  productId: string;
  variant?: "icon" | "button";
  className?: string;
}

export default function WishlistButton({
  productId,
  variant = "icon",
  className = "",
}: WishlistButtonProps) {
  const { isWishlisted, toggleWishlist } = useWishlist();
  const [actionError, setActionError] = useState<string | null>(null);
  const saved = isWishlisted(productId);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActionError(null);
    void toggleWishlist(productId).catch((error: unknown) => {
      setActionError(
        error instanceof Error ? error.message : "Unable to update wishlist",
      );
    });
  };

  if (variant === "button") {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={handleClick}
          aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
          aria-pressed={saved}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold transition ${
            saved
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          <Heart
            aria-hidden="true"
            className={`h-4 w-4 transition ${
              saved ? "fill-red-500 text-red-500" : "text-gray-600"
            }`}
          />
          <span>{saved ? "Saved in Wishlist" : "Save to Wishlist"}</span>
        </button>
        {actionError && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            {actionError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        title={saved ? "Remove from wishlist" : "Save to wishlist"}
        aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
        aria-pressed={saved}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur-sm transition hover:scale-105 hover:bg-white"
      >
        <Heart
          aria-hidden="true"
          className={`h-4 w-4 transition ${
            saved ? "fill-red-500 text-red-500" : "text-gray-700"
          }`}
        />
      </button>
      {actionError && (
        <span
          role="alert"
          className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg bg-red-50 p-2 text-xs text-red-700 shadow"
        >
          {actionError}
        </span>
      )}
    </div>
  );
}
