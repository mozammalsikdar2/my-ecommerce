"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import AddToCartButton from "@/components/AddToCartButton";
import WishlistButton from "@/components/WishlistButton";
import type { CategoryItem } from "@/components/home/CategoryBar";
import {
  isStoreProduct,
  type StoreProduct,
} from "@/components/home/ProductGridSection";

interface SubCategory {
  id: string;
  name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSubCategory(value: unknown): value is SubCategory {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isCategory(value: unknown): value is CategoryItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    (typeof value.imageUrl === "string" ||
      value.imageUrl === null ||
      value.imageUrl === undefined) &&
    Array.isArray(value.subCategories) &&
    value.subCategories.every(isSubCategory) &&
    (value._count === undefined ||
      (isRecord(value._count) && typeof value._count.products === "number"))
  );
}

function ProductCatalogContent() {
  const { settings } = useSettings();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [productError, setProductError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [categoryId, setCategoryId] = useState(
    searchParams.get("categoryId") || "ALL"
  );
  const [subCategoryId, setSubCategoryId] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [flashSaleOnly, setFlashSaleOnly] = useState(false);
  const [sort, setSort] = useState("newest");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch("/api/categories", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Categories request failed (${response.status})`);
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isCategory)) {
          throw new Error("Categories response has an invalid format");
        }
        setCategories(data);
        setCategoryError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Unable to load categories";
        setCategoryError(message);
        console.error("Product catalog categories could not load:", error);
      }
    }

    void loadCategories();
    return () => controller.abort();
  }, []);

  const fetchFilteredProducts = useCallback(
    async (signal: AbortSignal) => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (categoryId !== "ALL") params.set("categoryId", categoryId);
      if (subCategoryId) params.set("subCategoryId", subCategoryId);
      if (minPrice.trim()) params.set("minPrice", minPrice.trim());
      if (maxPrice.trim()) params.set("maxPrice", maxPrice.trim());
      if (inStockOnly) params.set("inStock", "true");
      if (flashSaleOnly) params.set("flashSale", "true");
      params.set("sort", sort);

      setLoading(true);
      setProductError(null);
      try {
        const response = await fetch(`/api/products?${params.toString()}`, {
          cache: "no-store",
          signal,
        });
        if (!response.ok) {
          throw new Error(`Products request failed (${response.status})`);
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isStoreProduct)) {
          throw new Error("Products response has an invalid format");
        }
        setProducts(data);
      } catch (error) {
        if (signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Unable to load products";
        setProductError(message);
        console.error("Product catalog products could not load:", error);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [
      categoryId,
      flashSaleOnly,
      inStockOnly,
      maxPrice,
      minPrice,
      search,
      sort,
      subCategoryId,
    ]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchFilteredProducts(controller.signal);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchFilteredProducts]);

  const resetAllFilters = () => {
    setSearch("");
    setCategoryId("ALL");
    setSubCategoryId("");
    setMinPrice("");
    setMaxPrice("");
    setInStockOnly(false);
    setFlashSaleOnly(false);
    setSort("newest");
  };

  const renderFilterSidebar = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-3">
        <span className="text-sm font-extrabold uppercase tracking-wider text-gray-800">
          Filters
        </span>
        <button
          type="button"
          onClick={resetAllFilters}
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-black"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      <div>
        <h2 className="mb-2.5 text-xs font-bold uppercase text-gray-700">
          Categories
        </h2>
        {categoryError ? (
          <p role="alert" className="text-xs text-red-700">
            {categoryError}
          </p>
        ) : (
          <div className="space-y-1.5">
            <button
              type="button"
              aria-pressed={categoryId === "ALL"}
              onClick={() => {
                setCategoryId("ALL");
                setSubCategoryId("");
              }}
              style={
                categoryId === "ALL"
                  ? { backgroundColor: settings.primaryColor, color: "#fff" }
                  : undefined
              }
              className={`w-full rounded-lg px-3 py-2 text-left text-xs font-bold transition ${
                categoryId === "ALL"
                  ? ""
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              All Categories
            </button>

            {categories.map((category) => {
              const isSelected = categoryId === category.id;
              return (
                <div key={category.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setCategoryId(isSelected ? "ALL" : category.id);
                      setSubCategoryId("");
                    }}
                    style={
                      isSelected
                        ? {
                            backgroundColor: settings.primaryColor,
                            color: "#fff",
                          }
                        : undefined
                    }
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                      isSelected ? "" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span>{category.name}</span>
                    <span className="text-[10px] opacity-75">
                      ({category._count?.products ?? 0})
                    </span>
                  </button>

                  {isSelected && category.subCategories.length > 0 && (
                    <div className="ml-3 mt-1 space-y-1 border-l-2 border-gray-200 pl-2.5">
                      {category.subCategories.map((subCategory) => (
                        <button
                          key={subCategory.id}
                          type="button"
                          aria-pressed={subCategoryId === subCategory.id}
                          onClick={() =>
                            setSubCategoryId(
                              subCategoryId === subCategory.id
                                ? ""
                                : subCategory.id
                            )
                          }
                          style={
                            subCategoryId === subCategory.id
                              ? { color: settings.primaryColor }
                              : undefined
                          }
                          className={`block w-full py-1 text-left text-xs ${
                            subCategoryId === subCategory.id
                              ? "font-extrabold"
                              : "text-gray-600 hover:text-black"
                          }`}
                        >
                          {subCategory.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2.5 text-xs font-bold uppercase text-gray-700">
          Price Range (৳)
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step="any"
            aria-label="Minimum price"
            placeholder="Min"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
            className="w-full rounded-lg border p-2 text-xs"
          />
          <span className="text-gray-400">–</span>
          <input
            type="number"
            min={0}
            step="any"
            aria-label="Maximum price"
            placeholder="Max"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            className="w-full rounded-lg border p-2 text-xs"
          />
        </div>
      </div>

      <div className="space-y-2.5 border-t pt-4">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(event) => setInStockOnly(event.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span>In Stock Only</span>
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
          <input
            type="checkbox"
            checked={flashSaleOnly}
            onChange={(event) => setFlashSaleOnly(event.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span>Flash Sale Deals Only</span>
        </label>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="search"
            aria-label="Search products"
            placeholder="Search products by name or keyword..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-8 text-sm focus:border-gray-500 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-expanded={mobileFiltersOpen}
            aria-controls="mobile-product-filters"
            onClick={() => setMobileFiltersOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-bold text-gray-700 lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filters</span>
          </button>

          <label className="sr-only" htmlFor="product-sort">
            Sort products
          </label>
          <select
            id="product-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="rounded-lg border bg-white px-3.5 py-2 text-xs font-bold text-gray-700"
          >
            <option value="newest">Sort: Newest Arrivals</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/50 lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setMobileFiltersOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default"
          />
          <aside
            id="mobile-product-filters"
            aria-label="Product filters"
            className="relative z-10 h-full w-72 overflow-y-auto bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderFilterSidebar()}
          </aside>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        <aside
          aria-label="Product filters"
          className="hidden h-fit rounded-xl border bg-white p-5 shadow-sm lg:block"
        >
          {renderFilterSidebar()}
        </aside>

        <section aria-label="Product results" className="lg:col-span-3">
          <div className="mb-4 text-xs font-semibold text-gray-500">
            Showing {products.length} product(s)
          </div>

          {loading ? (
            <p
              role="status"
              className="rounded-xl border bg-white py-20 text-center text-sm text-gray-400"
            >
              Searching catalog...
            </p>
          ) : productError ? (
            <p
              role="alert"
              className="rounded-xl border bg-red-50 p-6 text-sm text-red-800"
            >
              {productError}
            </p>
          ) : products.length === 0 ? (
            <div className="rounded-xl border bg-white py-20 text-center">
              <p className="text-sm font-bold text-gray-700">
                No products match your current filters.
              </p>
              <button
                type="button"
                onClick={resetAllFilters}
                style={{ backgroundColor: settings.primaryColor }}
                className="mt-4 rounded-lg px-5 py-2 text-xs font-bold text-white"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
              {products.map((product) => {
                const finalPrice = product.discountPrice ?? product.price;
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
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover transition duration-300 group-hover:scale-105"
                        />
                        {product.stock <= 0 && (
                          <span className="absolute left-2.5 top-2.5 rounded-full bg-gray-900/85 px-2.5 py-1 text-[10px] font-bold text-white">
                            Out of Stock
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
                        <div className="text-[11px] font-semibold text-gray-400">
                          {product.category?.name || "General"}
                          {product.subCategory &&
                            ` › ${product.subCategory.name}`}
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
                            ৳{finalPrice}
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
                            className="block w-full rounded-lg py-2 text-center text-xs font-bold text-white transition hover:opacity-90"
                          >
                            Select Options
                          </Link>
                        ) : (
                          <AddToCartButton
                            productId={product.id}
                            variantId={null}
                            name={product.name}
                            price={finalPrice}
                            image={image}
                            stock={product.stock}
                            quantity={1}
                            label={
                              product.stock > 0
                                ? "Add to Cart"
                                : "Out of Stock"
                            }
                            addedLabel="Added"
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
          )}
        </section>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-gray-500">
          Loading products...
        </div>
      }
    >
      <ProductCatalogContent />
    </Suspense>
  );
}
