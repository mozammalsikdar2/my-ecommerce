"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { trackGa4AddToCart } from "@/lib/ga4";
import { trackMetaEvent } from "@/lib/meta-pixel";

export interface CartItem {
  key: string;
  productId: string;
  variantId?: string | null;
  name: string;
  image: string;
  price: number;
  stock?: number;
  variantInfo?: string | null;
  variantLabel?: string;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  totalItems: number;
  subtotal: number;
  isLoaded: boolean;
  addItem: (item: Omit<CartItem, "key" | "quantity">) => string | null;
  addToCart: (item: Omit<CartItem, "key">) => string | null;
  setQuantity: (key: string, quantity: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "ecommerce_cart";
const LEGACY_STORAGE_KEY = "my-ecommerce-cart";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCartItem(value: unknown): value is CartItem {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.productId === "string" &&
    (typeof value.variantId === "string" || value.variantId === null) &&
    typeof value.name === "string" &&
    typeof value.image === "string" &&
    typeof value.price === "number" &&
    Number.isFinite(value.price) &&
    value.price >= 0 &&
    (value.stock === undefined ||
      (typeof value.stock === "number" &&
        Number.isSafeInteger(value.stock) &&
        value.stock >= 0)) &&
    (value.variantId === undefined ||
      typeof value.variantId === "string" ||
      value.variantId === null) &&
    (value.variantInfo === undefined ||
      typeof value.variantInfo === "string" ||
      value.variantInfo === null) &&
    (value.variantLabel === undefined ||
      typeof value.variantLabel === "string") &&
    typeof value.quantity === "number" &&
    Number.isSafeInteger(value.quantity) &&
    value.quantity > 0 &&
    value.quantity <= 10000 &&
    (value.stock === undefined || value.quantity <= value.stock)
  );
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const itemsRef = useRef<CartItem[]>([]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      try {
        const saved =
          localStorage.getItem(STORAGE_KEY) ??
          localStorage.getItem(LEGACY_STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.every(isCartItem)) {
            const restored = parsed.map((item) => ({
              ...item,
              key: item.variantId
                ? `${item.productId}:${item.variantId}`
                : item.productId,
              variantId: item.variantId ?? null,
              variantInfo: item.variantInfo ?? item.variantLabel ?? null,
            }));
            itemsRef.current = restored;
            setItems(restored);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
          }
        }
      } catch (error) {
        console.error("Unable to restore the shopping cart:", error);
      } finally {
        if (active) setIsLoaded(true);
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      if (items.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      }
    } catch (error) {
      console.error("Unable to save the shopping cart:", error);
    }
  }, [isLoaded, items]);

  const addToCart = useCallback((newItem: Omit<CartItem, "key">) => {
    if (
      !Number.isSafeInteger(newItem.quantity) ||
      newItem.quantity <= 0 ||
      newItem.quantity > 10000 ||
      !Number.isFinite(newItem.price) ||
      newItem.price < 0 ||
      (newItem.stock !== undefined &&
        (!Number.isSafeInteger(newItem.stock) || newItem.stock <= 0))
    ) {
      return "This product has invalid price or stock information.";
    }

    const key = newItem.variantId
      ? `${newItem.productId}:${newItem.variantId}`
      : newItem.productId;
    const item: CartItem = {
      ...newItem,
      key,
      stock: newItem.stock ?? undefined,
      variantId: newItem.variantId ?? null,
      variantInfo: newItem.variantInfo ?? newItem.variantLabel ?? null,
      variantLabel: newItem.variantLabel ?? newItem.variantInfo ?? undefined,
    };
    const current = itemsRef.current;
    const existing = current.find((cartItem) => cartItem.key === key);
    if (
      item.stock !== undefined &&
      item.stock < (existing?.quantity ?? 0) + item.quantity
    ) {
      return "There is not enough stock to add another item.";
    }

    const next = existing
      ? current.map((cartItem) =>
          cartItem.key === key
            ? {
                ...cartItem,
                ...item,
                key,
                stock: item.stock ?? cartItem.stock,
                quantity: cartItem.quantity + item.quantity,
              }
            : cartItem,
        )
      : [...current, item];
    itemsRef.current = next;
    setItems(next);

    trackGa4AddToCart({
      item_id: item.productId,
      item_name: item.name,
      item_variant: item.variantLabel,
      price: item.price,
      quantity: item.quantity,
    });

    trackMetaEvent({
      eventName: "AddToCart",
      eventId: `atc_${newItem.productId}_${Date.now()}`,
      customData: {
        currency: "BDT",
        value: newItem.price * newItem.quantity,
        content_ids: [newItem.productId],
        content_name: newItem.name,
        content_type: "product",
        contents: [
          {
            id: newItem.productId,
            quantity: newItem.quantity,
            item_price: newItem.price,
          },
        ],
        num_items: newItem.quantity,
      },
      sendServerCapi: true,
    });

    return null;
  }, []);
  const addItem = useCallback(
    (item: Omit<CartItem, "key" | "quantity">) =>
      addToCart({ ...item, quantity: 1 }),
    [addToCart],
  );

  const setQuantity = useCallback((key: string, quantity: number) => {
    if (!Number.isSafeInteger(quantity)) return;
    const next = itemsRef.current.flatMap((item) => {
      if (item.key !== key) return [item];
      const nextQuantity = Math.min(quantity, item.stock ?? 10000);
      return nextQuantity > 0 ? [{ ...item, quantity: nextQuantity }] : [];
    });
    itemsRef.current = next;
    setItems(next);
  }, []);

  const removeItem = useCallback((key: string) => {
    const next = itemsRef.current.filter((item) => item.key !== key);
    itemsRef.current = next;
    setItems(next);
  }, []);

  const clearCart = useCallback(() => {
    itemsRef.current = [];
    setItems([]);
  }, []);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        totalItems: itemCount,
        subtotal: Math.round((subtotal + Number.EPSILON) * 100) / 100,
        isLoaded,
        addItem,
        addToCart,
        setQuantity,
        updateQuantity: setQuantity,
        removeItem,
        removeFromCart: removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
