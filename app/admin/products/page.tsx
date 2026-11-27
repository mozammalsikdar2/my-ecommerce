"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FolderTree,
  Layers,
  Package,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

interface SubCategory {
  id: string;
  name: string;
  categoryId: string;
}

interface Category {
  id: string;
  name: string;
  subCategories: SubCategory[];
  _count?: { products: number };
}

interface VariantInput {
  size: string;
  color: string;
  price: string;
  stock: number;
}

interface ProductVariant {
  id: string;
  size: string | null;
  color: string | null;
  price: number | null;
  stock: number;
}

interface ProductRecord {
  id: string;
  name: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  image: string;
  images: string[];
  isActive: boolean;
  isFeatured: boolean;
  isFlashSale: boolean;
  category: { name: string } | null;
  subCategory: { name: string } | null;
  variants: ProductVariant[];
}

interface ProductForm {
  name: string;
  description: string;
  price: string;
  discountPrice: string;
  stock: string;
  image: string;
  extraImages: string;
  categoryId: string;
  subCategoryId: string;
  isFeatured: boolean;
  isFlashSale: boolean;
}

const initialProductForm: ProductForm = {
  name: "",
  description: "",
  price: "",
  discountPrice: "",
  stock: "10",
  image: "",
  extraImages: "",
  categoryId: "",
  subCategoryId: "",
  isFeatured: true,
  isFlashSale: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSubCategory(value: unknown): value is SubCategory {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.categoryId === "string"
  );
}

function isCategory(value: unknown): value is Category {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.subCategories) &&
    value.subCategories.every(isSubCategory) &&
    (value._count === undefined ||
      (isRecord(value._count) && typeof value._count.products === "number"))
  );
}

function isProductVariant(value: unknown): value is ProductVariant {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (typeof value.size === "string" || value.size === null) &&
    (typeof value.color === "string" || value.color === null) &&
    (typeof value.price === "number" || value.price === null) &&
    typeof value.stock === "number"
  );
}

function isProduct(value: unknown): value is ProductRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.price === "number" &&
    (typeof value.discountPrice === "number" || value.discountPrice === null) &&
    typeof value.stock === "number" &&
    typeof value.image === "string" &&
    Array.isArray(value.images) &&
    value.images.every((image) => typeof image === "string") &&
    typeof value.isActive === "boolean" &&
    typeof value.isFeatured === "boolean" &&
    typeof value.isFlashSale === "boolean" &&
    (value.category === null ||
      (isRecord(value.category) && typeof value.category.name === "string")) &&
    (value.subCategory === null ||
      (isRecord(value.subCategory) &&
        typeof value.subCategory.name === "string")) &&
    Array.isArray(value.variants) &&
    value.variants.every(isProductVariant)
  );
}

async function getApiError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Keep the status-based message for non-JSON responses.
  }
  return `Request failed (${response.status})`;
}

async function fetchAdminData(signal?: AbortSignal) {
  const [categoryResponse, productResponse] = await Promise.all([
    fetch("/api/categories", { cache: "no-store", signal }),
    fetch("/api/products?includeInactive=true", {
      cache: "no-store",
      signal,
    }),
  ]);
  if (!categoryResponse.ok) {
    throw new Error(await getApiError(categoryResponse));
  }
  if (!productResponse.ok) {
    throw new Error(await getApiError(productResponse));
  }

  const [categoryData, productData]: [unknown, unknown] = await Promise.all([
    categoryResponse.json(),
    productResponse.json(),
  ]);
  if (
    !Array.isArray(categoryData) ||
    !categoryData.every(isCategory) ||
    !Array.isArray(productData) ||
    !productData.every(isProduct)
  ) {
    throw new Error("Category or product API returned invalid data");
  }

  return { categories: categoryData, products: productData };
}

export default function AdminProductsPage() {
  const { settings } = useSettings();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedParentCat, setSelectedParentCat] = useState("");
  const [newSubCategoryName, setNewSubCategoryName] = useState("");
  const [productForm, setProductForm] =
    useState<ProductForm>(initialProductForm);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [variants, setVariants] = useState<VariantInput[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      try {
        const data = await fetchAdminData(controller.signal);
        if (controller.signal.aborted) return;
        setCategories(data.categories);
        setProducts(data.products);
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load categories and products",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadInitialData();
    return () => controller.abort();
  }, []);

  const refreshData = async () => {
    const data = await fetchAdminData();
    setCategories(data.categories);
    setProducts(data.products);
    setError(null);
  };

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3500);
  };

  const handleAddCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName }),
      });
      if (!response.ok) throw new Error(await getApiError(response));

      await refreshData();
      setNewCategoryName("");
      notify("Category created.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create category",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSubCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSubCategoryName,
          categoryId: selectedParentCat,
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));

      await refreshData();
      setNewSubCategoryName("");
      notify("Subcategory created.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create subcategory",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (id: string, isSubCategory = false) => {
    const prompt = isSubCategory
      ? "Delete this subcategory? Products will remain in the main category."
      : "Delete this category and its subcategories? Products will become uncategorized.";
    if (!window.confirm(prompt)) return;

    const itemKey = `category:${id}`;
    setBusyItem(itemKey);
    setError(null);
    setMessage(null);
    try {
      const type = isSubCategory ? "?type=sub" : "";
      const response = await fetch(`/api/categories/${encodeURIComponent(id)}${type}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await getApiError(response));

      await refreshData();
      notify(isSubCategory ? "Subcategory deleted." : "Category deleted.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to delete category",
      );
    } finally {
      setBusyItem(null);
    }
  };

  const addVariantRow = () => {
    setVariants((current) => [
      ...current,
      { size: "", color: "", price: "", stock: 5 },
    ]);
  };

  const updateVariantRow = (
    index: number,
    field: keyof VariantInput,
    value: string | number,
  ) => {
    setVariants((current) =>
      current.map((variant, position) =>
        position === index ? { ...variant, [field]: value } : variant,
      ),
    );
  };

  const removeVariantRow = (index: number) => {
    setVariants((current) => current.filter((_, position) => position !== index));
  };

  const handleCloudinaryUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (files.length + uploadedImages.length > 20) {
      setError("A product can have at most 20 images.");
      return;
    }

    setError(null);
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "ecommerce-products");

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error(await getApiError(response));

        const result: unknown = await response.json();
        if (!isRecord(result) || typeof result.url !== "string") {
          throw new Error("Upload API returned an invalid image URL");
        }
        const imageUrl = result.url;
        setUploadedImages((current) => [...current, imageUrl]);
      }
      setMessage("Product images uploaded to Cloudinary.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload product images",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const removeUploadedImage = (index: number) => {
    setUploadedImages((current) =>
      current.filter((_, position) => position !== index),
    );
  };

  const makePrimaryImage = (index: number) => {
    setUploadedImages((current) => {
      if (index <= 0 || index >= current.length) return current;
      const reordered = [...current];
      const [primaryImage] = reordered.splice(index, 1);
      reordered.unshift(primaryImage);
      return reordered;
    });
  };

  const handleCreateProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const manualImages = [
      ...(uploadedImages.length === 0 && productForm.image.trim()
        ? [productForm.image.trim()]
        : []),
      ...productForm.extraImages
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean),
    ];
    const gallery = Array.from(new Set([...uploadedImages, ...manualImages]));
    if (gallery.length === 0) {
      setError("Upload a product image or enter a primary image URL.");
      return;
    }
    if (gallery.length > 20) {
      setError("A product can have at most 20 images.");
      return;
    }

    const productVariants = variants
      .filter((variant) => variant.size.trim() || variant.color.trim())
      .map((variant) => ({
        size: variant.size.trim() || null,
        color: variant.color.trim() || null,
        price: variant.price.trim() ? Number(variant.price) : null,
        stock: Number(variant.stock),
      }));

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productForm.name,
          description: productForm.description,
          price: Number(productForm.price),
          discountPrice: productForm.discountPrice
            ? Number(productForm.discountPrice)
            : null,
          stock: Number(productForm.stock),
          image: gallery[0],
          images: gallery,
          categoryId: productForm.categoryId || null,
          subCategoryId: productForm.subCategoryId || null,
          isFeatured: productForm.isFeatured,
          isFlashSale: productForm.isFlashSale,
          variants: productVariants,
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));

      await refreshData();
      setProductForm(initialProductForm);
      setUploadedImages([]);
      setVariants([]);
      notify("Product added to your store.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create product",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (product: ProductRecord) => {
    if (!window.confirm(`Delete "${product.name}"?`)) return;

    setBusyItem(`product:${product.id}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(product.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await getApiError(response));

      await refreshData();
      notify("Product deleted.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to delete product",
      );
    } finally {
      setBusyItem(null);
    }
  };

  const handleQuickStockAdjust = async (
    product: ProductRecord,
    stockDelta: number,
    variantId?: string,
  ) => {
    const itemKey = `stock:${product.id}:${variantId ?? "product"}`;
    setBusyItem(itemKey);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(product.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stockDelta,
            ...(variantId ? { variantId } : {}),
          }),
        },
      );
      if (!response.ok) throw new Error(await getApiError(response));

      await refreshData();
      notify("Inventory updated.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update inventory",
      );
    } finally {
      setBusyItem(null);
    }
  };

  const handleToggleProductActive = async (product: ProductRecord) => {
    const itemKey = `status:${product.id}`;
    setBusyItem(itemKey);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(product.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !product.isActive }),
        },
      );
      if (!response.ok) throw new Error(await getApiError(response));

      await refreshData();
      notify(product.isActive ? "Product hidden." : "Product activated.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update product visibility",
      );
    } finally {
      setBusyItem(null);
    }
  };

  const handleToggleProductFlashSale = async (product: ProductRecord) => {
    const itemKey = `flash-sale:${product.id}`;
    setBusyItem(itemKey);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(product.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isFlashSale: !product.isFlashSale }),
        },
      );
      if (!response.ok) throw new Error(await getApiError(response));

      await refreshData();
      notify(
        product.isFlashSale
          ? "Product removed from the flash sale."
          : "Product added to the flash sale.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update flash-sale status",
      );
    } finally {
      setBusyItem(null);
    }
  };

  const availableSubCategories =
    categories.find((category) => category.id === productForm.categoryId)
      ?.subCategories ?? [];
  const filteredProducts = products.filter((product) => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return (
      query.length === 0 ||
      product.name.toLocaleLowerCase().includes(query) ||
      product.category?.name.toLocaleLowerCase().includes(query) ||
      product.subCategory?.name.toLocaleLowerCase().includes(query)
    );
  });

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/settings"
            className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Admin Settings
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Categories, Products &amp; Variants Manager
          </h1>
          <p className="text-sm text-gray-500">
            Organize categories and manage product pricing, stock, and variants.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
        >
          View Live Storefront
        </Link>
      </div>

      {message && (
        <div
          role="status"
          className="rounded-lg bg-green-100 p-4 text-sm font-medium text-green-800"
        >
          {message}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700"
        >
          {error}
        </div>
      )}

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 border-b pb-3">
          <FolderTree className="h-5 w-5 text-teal-700" />
          <h2 className="text-lg font-bold text-gray-800">
            1. Categories &amp; Subcategories
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <form
            onSubmit={handleAddCategory}
            className="space-y-3 rounded-lg bg-gray-50 p-4"
          >
            <h3 className="text-sm font-bold text-gray-700">
              Add Main Category
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={100}
                placeholder="e.g., Attar & Perfumes"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                className="w-full rounded-lg border bg-white p-2 text-sm"
                required
              />
              <button
                type="submit"
                disabled={isSubmitting}
                style={{ backgroundColor: settings.primaryColor }}
                className="shrink-0 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </form>

          <form
            onSubmit={handleAddSubCategory}
            className="space-y-3 rounded-lg bg-gray-50 p-4"
          >
            <h3 className="text-sm font-bold text-gray-700">
              Add Subcategory
            </h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={selectedParentCat}
                onChange={(event) => setSelectedParentCat(event.target.value)}
                className="rounded-lg border bg-white p-2 text-sm"
                required
              >
                <option value="">Select Main Category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                maxLength={100}
                placeholder="e.g., Arabian Oud"
                value={newSubCategoryName}
                onChange={(event) => setNewSubCategoryName(event.target.value)}
                className="w-full rounded-lg border bg-white p-2 text-sm"
                required
              />
              <button
                type="submit"
                disabled={isSubmitting}
                style={{ backgroundColor: settings.primaryColor }}
                className="shrink-0 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </form>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-gray-500">Loading categories...</p>
        ) : categories.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <div key={category.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-800">
                    {category.name}
                    {category._count && (
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        ({category._count.products} products)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={busyItem === `category:${category.id}`}
                    onClick={() => void handleDeleteCategory(category.id)}
                    className="text-red-500 hover:text-red-700 disabled:opacity-50"
                    title="Delete category"
                    aria-label={`Delete ${category.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {category.subCategories.length === 0 ? (
                    <span className="text-xs text-gray-400">
                      No subcategories
                    </span>
                  ) : (
                    category.subCategories.map((subCategory) => (
                      <span
                        key={subCategory.id}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                      >
                        {subCategory.name}
                        <button
                          type="button"
                          disabled={busyItem === `category:${subCategory.id}`}
                          onClick={() =>
                            void handleDeleteCategory(subCategory.id, true)
                          }
                          className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                          aria-label={`Delete ${subCategory.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          !error && (
            <p className="mt-6 text-sm text-gray-500">No categories yet.</p>
          )
        )}
      </section>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 border-b pb-3">
          <Package className="h-5 w-5 text-teal-700" />
          <h2 className="text-lg font-bold text-gray-800">
            2. Add New Product
          </h2>
        </div>

        <form onSubmit={handleCreateProduct} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="product-name"
                className="block text-xs font-semibold text-gray-700"
              >
                Product Name *
              </label>
              <input
                id="product-name"
                type="text"
                required
                maxLength={160}
                placeholder="e.g., Royal Amber Oud Attar"
                value={productForm.name}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="product-category"
                className="block text-xs font-semibold text-gray-700"
              >
                Main Category
              </label>
              <select
                id="product-category"
                value={productForm.categoryId}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    categoryId: event.target.value,
                    subCategoryId: "",
                  }))
                }
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              >
                <option value="">Select Category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="product-subcategory"
                className="block text-xs font-semibold text-gray-700"
              >
                Subcategory
              </label>
              <select
                id="product-subcategory"
                value={productForm.subCategoryId}
                disabled={availableSubCategories.length === 0}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    subCategoryId: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border p-2.5 text-sm disabled:bg-gray-100"
              >
                <option value="">Select Subcategory</option>
                {availableSubCategories.map((subCategory) => (
                  <option key={subCategory.id} value={subCategory.id}>
                    {subCategory.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="product-price"
                className="block text-xs font-semibold text-gray-700"
              >
                Regular Price (৳) *
              </label>
              <input
                id="product-price"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={productForm.price}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="product-discount"
                className="block text-xs font-semibold text-gray-700"
              >
                Discount Price (৳)
              </label>
              <input
                id="product-discount"
                type="number"
                min="0"
                step="0.01"
                value={productForm.discountPrice}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    discountPrice: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="product-stock"
                className="block text-xs font-semibold text-gray-700"
              >
                Base Stock Quantity
              </label>
              <input
                id="product-stock"
                type="number"
                min="0"
                step="1"
                disabled={variants.some(
                  (variant) => variant.size.trim() || variant.color.trim(),
                )}
                value={
                  variants.some(
                    (variant) => variant.size.trim() || variant.color.trim(),
                  )
                    ? variants
                        .filter(
                          (variant) =>
                            variant.size.trim() || variant.color.trim(),
                        )
                        .reduce(
                          (sum, variant) => sum + Number(variant.stock || 0),
                          0,
                        )
                    : productForm.stock
                }
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    stock: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border p-2.5 text-sm disabled:bg-gray-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="product-image"
                className="block text-xs font-semibold text-gray-700"
              >
                Primary Image URL{" "}
                {uploadedImages.length > 0 ? "(using uploaded image)" : "*"}
              </label>
              <input
                id="product-image"
                type="url"
                required={uploadedImages.length === 0}
                disabled={uploadedImages.length > 0}
                placeholder="https://images.unsplash.com/..."
                value={productForm.image}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    image: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border p-2.5 text-sm disabled:bg-gray-100"
              />
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor="product-image-upload"
                className="block text-xs font-semibold text-gray-700"
              >
                Upload Product Images to Cloudinary
              </label>
              <div className="mt-1 rounded-lg border border-dashed p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">
                    JPG, PNG, WEBP, or ICO. Up to 20 images, 5 MB each.
                  </p>
                  <label
                    htmlFor="product-image-upload"
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 ${
                      isUploading || uploadedImages.length >= 20
                        ? "pointer-events-none opacity-50"
                        : ""
                    }`}
                  >
                    <Upload className="h-4 w-4" />
                    {isUploading ? "Uploading..." : "Choose images"}
                  </label>
                  <input
                    id="product-image-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/x-icon"
                    multiple
                    disabled={isUploading || uploadedImages.length >= 20}
                    onChange={(event) => {
                      void handleCloudinaryUpload(event.target.files);
                      event.target.value = "";
                    }}
                    className="sr-only"
                  />
                </div>

                {uploadedImages.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                    {uploadedImages.map((url, index) => (
                      <div
                        key={`${url}-${index}`}
                        className="relative rounded-lg border bg-white p-2"
                      >
                        <Image
                          src={url}
                          alt={`Uploaded product image ${index + 1}`}
                          width={120}
                          height={120}
                          unoptimized
                          className="h-24 w-full rounded object-cover"
                        />
                        <div className="mt-2 flex items-center justify-between gap-1">
                          {index === 0 ? (
                            <span className="text-[10px] font-bold text-teal-700">
                              Primary
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => makePrimaryImage(index)}
                              className="text-[10px] font-semibold text-gray-600 hover:text-teal-700"
                            >
                              Set primary
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeUploadedImage(index)}
                            className="rounded p-1 text-red-600 hover:bg-red-50"
                            aria-label={`Remove uploaded image ${index + 1}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor="product-gallery"
                className="block text-xs font-semibold text-gray-700"
              >
                Additional Gallery Image URLs (comma-separated)
              </label>
              <input
                id="product-gallery"
                type="text"
                placeholder="https://example.com/img2.jpg, https://example.com/img3.jpg"
                value={productForm.extraImages}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    extraImages: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor="product-description"
                className="block text-xs font-semibold text-gray-700"
              >
                Product Description
              </label>
              <textarea
                id="product-description"
                rows={3}
                value={productForm.description}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-gray-700" />
                <span className="text-sm font-bold text-gray-800">
                  Size &amp; Color Variants (Optional)
                </span>
              </div>
              <button
                type="button"
                onClick={addVariantRow}
                className="flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-100"
              >
                <Plus className="h-3.5 w-3.5" /> Add Variant
              </button>
            </div>

            {variants.length > 0 && (
              <div className="mt-4 space-y-2">
                {variants.map((variant, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-2 gap-2 rounded border bg-white p-2.5 sm:grid-cols-5"
                  >
                    <input
                      type="text"
                      maxLength={80}
                      placeholder="Size (e.g., 12ml, XL)"
                      aria-label={`Variant ${index + 1} size`}
                      value={variant.size}
                      onChange={(event) =>
                        updateVariantRow(index, "size", event.target.value)
                      }
                      className="rounded border p-2 text-xs"
                    />
                    <input
                      type="text"
                      maxLength={80}
                      placeholder="Color (e.g., Gold, Black)"
                      aria-label={`Variant ${index + 1} color`}
                      value={variant.color}
                      onChange={(event) =>
                        updateVariantRow(index, "color", event.target.value)
                      }
                      className="rounded border p-2 text-xs"
                    />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Price override"
                      aria-label={`Variant ${index + 1} price`}
                      value={variant.price}
                      onChange={(event) =>
                        updateVariantRow(index, "price", event.target.value)
                      }
                      className="rounded border p-2 text-xs"
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Stock"
                      aria-label={`Variant ${index + 1} stock`}
                      value={variant.stock}
                      onChange={(event) =>
                        updateVariantRow(
                          index,
                          "stock",
                          Number(event.target.value),
                        )
                      }
                      className="rounded border p-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeVariantRow(index)}
                      className="flex items-center justify-center rounded border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={productForm.isFeatured}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    isFeatured: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded"
              />
              Show in Homepage Featured Products
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={productForm.isFlashSale}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    isFlashSale: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded"
              />
              Include in Flash Sale
            </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              style={{ backgroundColor: settings.primaryColor }}
              className="rounded-lg px-6 py-2.5 text-sm font-bold text-white shadow hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting
                ? "Saving..."
                : isUploading
                  ? "Uploading images..."
                  : "Save Product"}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center">
          <h2 className="text-lg font-bold text-gray-800">
            3. Product Inventory ({filteredProducts.length}/{products.length})
          </h2>
          <label className="relative block w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search products or categories..."
              aria-label="Search products or categories"
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
            />
          </label>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Variants</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Loading products...
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {products.length === 0
                    ? "No products found."
                    : "No products match your search."}
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Image
                        src={product.image}
                        alt={product.name}
                        width={48}
                        height={48}
                        unoptimized
                        className="h-12 w-12 rounded-lg border object-cover"
                      />
                      <div>
                        <p className="font-semibold text-gray-800">
                          {product.name}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {product.images.length} image
                          {product.images.length === 1 ? "" : "s"} ·{" "}
                          {product.isActive ? "Active" : "Hidden"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {product.category?.name || "Uncategorized"}
                    {product.subCategory && ` › ${product.subCategory.name}`}
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-800">
                    {product.discountPrice !== null ? (
                      <div>
                        <span className="text-teal-700">
                          ৳{product.discountPrice}
                        </span>{" "}
                        <span className="text-xs font-normal text-gray-400 line-through">
                          ৳{product.price}
                        </span>
                      </div>
                    ) : (
                      `৳${product.price}`
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {product.variants.length === 0 ? (
                        <span className="text-xs text-gray-400">Standard</span>
                      ) : (
                        product.variants.map((variant) => (
                          <div
                            key={variant.id}
                            className="mb-1 flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700"
                          >
                            <span className="min-w-0">
                              {[variant.size, variant.color]
                                .filter(Boolean)
                                .join(" / ") || "Variant"}{" "}
                              ({variant.stock})
                            </span>
                            <button
                              type="button"
                              disabled={
                                busyItem ===
                                  `stock:${product.id}:${variant.id}` ||
                                variant.stock <= 0
                              }
                              onClick={() =>
                                void handleQuickStockAdjust(
                                  product,
                                  -1,
                                  variant.id,
                                )
                              }
                              className="rounded px-1 text-gray-600 hover:bg-white disabled:opacity-40"
                              aria-label={`Decrease ${product.name} variant stock`}
                            >
                              −
                            </button>
                            <button
                              type="button"
                              disabled={
                                busyItem ===
                                `stock:${product.id}:${variant.id}`
                              }
                              onClick={() =>
                                void handleQuickStockAdjust(
                                  product,
                                  1,
                                  variant.id,
                                )
                              }
                              className="rounded px-1 text-gray-600 hover:bg-white disabled:opacity-40"
                              aria-label={`Increase ${product.name} variant stock`}
                            >
                              +
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={
                          product.variants.length > 0 ||
                          busyItem === `stock:${product.id}:product` ||
                          product.stock <= 0
                        }
                        onClick={() =>
                          void handleQuickStockAdjust(product, -1)
                        }
                        className="rounded border px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        aria-label={`Decrease ${product.name} stock`}
                        title={
                          product.variants.length > 0
                            ? "Adjust stock on each variant"
                            : "Decrease stock"
                        }
                      >
                        −
                      </button>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          product.stock > 0
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {product.stock} in stock
                      </span>
                      <button
                        type="button"
                        disabled={
                          product.variants.length > 0 ||
                          busyItem === `stock:${product.id}:product`
                        }
                        onClick={() =>
                          void handleQuickStockAdjust(product, 1)
                        }
                        className="rounded border px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        aria-label={`Increase ${product.name} stock`}
                        title={
                          product.variants.length > 0
                            ? "Adjust stock on each variant"
                            : "Increase stock"
                        }
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={busyItem === `flash-sale:${product.id}`}
                      onClick={() =>
                        void handleToggleProductFlashSale(product)
                      }
                      className="mr-1 rounded border px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                    >
                      {product.isFlashSale ? "Remove sale" : "Add to sale"}
                    </button>
                    <button
                      type="button"
                      disabled={busyItem === `status:${product.id}`}
                      onClick={() => void handleToggleProductActive(product)}
                      className="mr-1 rounded border px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {product.isActive ? "Hide" : "Activate"}
                    </button>
                    <button
                      type="button"
                      disabled={busyItem === `product:${product.id}`}
                      onClick={() => void handleDeleteProduct(product)}
                      className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      title="Delete product"
                      aria-label={`Delete ${product.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
