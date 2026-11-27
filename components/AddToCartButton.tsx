"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useSettings } from "@/context/SettingsContext";

interface AddToCartButtonProps {
  productId: string;
  variantId?: string | null;
  variantInfo?: string | null;
  variantLabel?: string;
  name: string;
  price: number;
  image: string;
  stock?: number;
  quantity?: number;
  label?: string;
  addedLabel?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export default function AddToCartButton({
  productId,
  variantId = null,
  variantInfo,
  variantLabel,
  name,
  price,
  image,
  stock,
  quantity = 1,
  label = "Add to Cart",
  addedLabel = "Added to Cart",
  disabled = false,
  className,
  style,
}: AddToCartButtonProps) {
  const { addToCart, isLoaded } = useCart();
  const { settings } = useSettings();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outOfStock = stock !== undefined && stock <= 0;
  const isDisabled = !isLoaded || disabled || outOfStock;

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 1500);
    return () => window.clearTimeout(timer);
  }, [added]);

  const handleAdd = () => {
    setError(null);
    if (isDisabled) return;
    const addError = addToCart({
      productId,
      variantId,
      variantInfo,
      variantLabel,
      name,
      price,
      image,
      ...(stock !== undefined ? { stock } : {}),
      quantity,
    });
    if (addError) {
      setAdded(false);
      setError(addError);
      return;
    }
    setAdded(true);
  };

  return (
    <div>
      <button
        type="button"
        disabled={isDisabled}
        onClick={handleAdd}
        style={{ backgroundColor: settings.primaryColor, ...style }}
        className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
      >
        {added ? (
          <>
            <Check className="h-4 w-4" /> {addedLabel}
          </>
        ) : (
          <>
            <ShoppingCart className="h-4 w-4" />{" "}
            {outOfStock ? "Out of Stock" : label}
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
