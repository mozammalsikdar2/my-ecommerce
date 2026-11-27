"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";

export interface WishlistProduct {
  id: string;
  name: string;
  price: number;
  discountPrice?: number | null;
  stock: number;
  image: string;
  category?: { id: string; name: string } | null;
  variants: {
    id: string;
    size?: string | null;
    color?: string | null;
    stock: number;
  }[];
}

interface WishlistContextType {
  wishlistIds: string[];
  wishlistProducts: WishlistProduct[];
  totalWishlistItems: number;
  loading: boolean;
  error: string | null;
  isWishlisted: (productId: string) => boolean;
  toggleWishlist: (productId: string) => Promise<void>;
  removeFromWishlist: (productId: string) => Promise<void>;
}

const STORAGE_KEY = "ecommerce_wishlist_ids";
const maxWishlistItems = 500;

const WishlistContext = createContext<WishlistContextType | undefined>(
  undefined,
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWishlistProduct(value: unknown): value is WishlistProduct {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.price === "number" &&
    Number.isFinite(value.price) &&
    (value.discountPrice === undefined ||
      value.discountPrice === null ||
      (typeof value.discountPrice === "number" &&
        Number.isFinite(value.discountPrice))) &&
    typeof value.stock === "number" &&
    Number.isSafeInteger(value.stock) &&
    typeof value.image === "string" &&
    (value.category === undefined ||
      value.category === null ||
      (isRecord(value.category) &&
        typeof value.category.id === "string" &&
        typeof value.category.name === "string")) &&
    (value.variants === undefined ||
      (Array.isArray(value.variants) &&
        value.variants.every(
          (variant) =>
            isRecord(variant) &&
            typeof variant.id === "string" &&
            typeof variant.stock === "number" &&
            Number.isSafeInteger(variant.stock) &&
            (variant.size === undefined ||
              variant.size === null ||
              typeof variant.size === "string") &&
            (variant.color === undefined ||
              variant.color === null ||
              typeof variant.color === "string"),
        )))
  );
}

function parseWishlistProducts(value: unknown): WishlistProduct[] {
  if (!Array.isArray(value) || !value.every(isWishlistProduct)) {
    throw new Error("The wishlist API returned invalid product data");
  }
  return value.map((product) => ({
    ...product,
    variants: product.variants ?? [],
  }));
}

function parseStoredIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (id) =>
        typeof id === "string" &&
        id.trim().length > 0 &&
        id.length <= 128,
    )
  ) {
    throw new Error("Saved wishlist data is invalid");
  }
  return Array.from(new Set(value.map((id) => id.trim()))).slice(
    0,
    maxWishlistItems,
  );
}

async function getResponseError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  return isRecord(body) && typeof body.error === "string"
    ? body.error
    : `Wishlist request failed (${response.status})`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to update wishlist";
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [wishlistProducts, setWishlistProducts] = useState<WishlistProduct[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hydrateGuestProducts = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return [];

    const response = await fetch("/api/products", { cache: "no-store" });
    if (!response.ok) throw new Error(await getResponseError(response));

    const products = parseWishlistProducts(await response.json());
    const idSet = new Set(ids);
    return products.filter((product) => idSet.has(product.id));
  }, []);

  useEffect(() => {
    if (authLoading) return;

    let active = true;
    async function initWishlist() {
      setLoading(true);
      setError(null);

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const localIds = raw ? parseStoredIds(JSON.parse(raw)) : [];
        if (active) setWishlistIds(localIds);

        if (user) {
          if (localIds.length > 0) {
            const syncResponse = await fetch("/api/wishlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ syncProductIds: localIds }),
            });
            if (!syncResponse.ok) {
              throw new Error(await getResponseError(syncResponse));
            }
            localStorage.removeItem(STORAGE_KEY);
          }

          const response = await fetch("/api/wishlist", {
            cache: "no-store",
          });
          if (!response.ok) throw new Error(await getResponseError(response));

          const data: unknown = await response.json();
          if (!isRecord(data) || !("items" in data)) {
            throw new Error("The wishlist API returned invalid data");
          }
          const products = parseWishlistProducts(data.items);
          if (active) {
            setWishlistProducts(products);
            setWishlistIds(products.map((product) => product.id));
          }
        } else {
          const products = await hydrateGuestProducts(localIds);
          if (active) setWishlistProducts(products);
        }
      } catch (loadError) {
        console.error("Unable to load wishlist:", loadError);
        if (active) setError(errorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }

    void initWishlist();
    return () => {
      active = false;
    };
  }, [authLoading, hydrateGuestProducts, user]);

  const isWishlisted = useCallback(
    (productId: string) => wishlistIds.includes(productId),
    [wishlistIds],
  );

  const toggleWishlist = useCallback(
    async (productId: string) => {
      const normalizedId = productId.trim();
      if (!normalizedId || normalizedId.length > 128) {
        setError("A valid product is required");
        return;
      }

      setError(null);
      const exists = wishlistIds.includes(normalizedId);

      try {
        if (user) {
          const response = await fetch("/api/wishlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: normalizedId }),
          });
          if (!response.ok) throw new Error(await getResponseError(response));

          const data: unknown = await response.json();
          if (!isRecord(data) || typeof data.saved !== "boolean") {
            throw new Error("The wishlist API returned invalid data");
          }

          const nextIds = data.saved
            ? [
                normalizedId,
                ...wishlistIds.filter((id) => id !== normalizedId),
              ]
            : wishlistIds.filter((id) => id !== normalizedId);
          setWishlistIds(nextIds);

          if (!data.saved) {
            setWishlistProducts((products) =>
              products.filter((product) => product.id !== normalizedId),
            );
            return;
          }

          const listResponse = await fetch("/api/wishlist", {
            cache: "no-store",
          });
          if (!listResponse.ok) {
            throw new Error(await getResponseError(listResponse));
          }
          const listData: unknown = await listResponse.json();
          if (!isRecord(listData) || !("items" in listData)) {
            throw new Error("The wishlist API returned invalid data");
          }
          setWishlistProducts(parseWishlistProducts(listData.items));
          return;
        }

        const nextIds = exists
          ? wishlistIds.filter((id) => id !== normalizedId)
          : [normalizedId, ...wishlistIds];
        if (nextIds.length > maxWishlistItems) {
          setError(`A maximum of ${maxWishlistItems} wishlist items is allowed`);
          return;
        }

        if (nextIds.length === 0) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextIds));
        }
        setWishlistIds(nextIds);
        setWishlistProducts(await hydrateGuestProducts(nextIds));
      } catch (updateError) {
        console.error("Unable to update wishlist:", updateError);
        setError(errorMessage(updateError));
        throw updateError;
      }
    },
    [hydrateGuestProducts, user, wishlistIds],
  );

  const removeFromWishlist = useCallback(
    async (productId: string) => {
      if (wishlistIds.includes(productId)) {
        await toggleWishlist(productId);
      }
    },
    [toggleWishlist, wishlistIds],
  );

  return (
    <WishlistContext.Provider
      value={{
        wishlistIds,
        wishlistProducts,
        totalWishlistItems: wishlistIds.length,
        loading,
        error,
        isWishlisted,
        toggleWishlist,
        removeFromWishlist,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error("useWishlist must be used within a WishlistProvider");
  }
  return context;
}
