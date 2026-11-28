"use client";

import { useState, type FormEvent } from "react";
import { Upload, X } from "lucide-react";

interface EditorProduct {
  id: string;
  name: string;
  sku: string | null;
  description: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  image: string;
  images: string[];
  categoryId: string;
  subCategoryId: string | null;
  isActive: boolean;
  variants: { id: string }[];
}

interface EditorCategory {
  id: string;
  name: string;
  subCategories: { id: string; name: string }[];
}

export default function AdminProductEditor({
  product, categories, primaryColor, onClose, onSaved, getApiError,
}: {
  product: EditorProduct;
  categories: EditorCategory[];
  primaryColor: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  getApiError: (response: Response) => Promise<string>;
}) {
  const [form, setForm] = useState({
    name: product.name,
    sku: product.sku ?? "",
    description: product.description,
    price: String(product.price),
    discountPrice: product.discountPrice === null ? "" : String(product.discountPrice),
    stock: String(product.stock),
    categoryId: product.categoryId,
    subCategoryId: product.subCategoryId ?? "",
    image: product.image,
    isActive: product.isActive,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "ecommerce-products");
      const response = await fetch("/api/upload", { method: "POST", body });
      if (!response.ok) throw new Error(await getApiError(response));
      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null || !("url" in result) || typeof result.url !== "string") {
        throw new Error("Upload API returned an invalid image URL");
      }
      const imageUrl = result.url;
      setForm((current) => ({ ...current, image: imageUrl }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload image");
    } finally {
      setUploading(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const image = form.image.trim();
    const images = image === product.image
      ? product.images
      : Array.from(new Set([image, ...product.images.filter((url) => url !== product.image)]));
    if (images.length > 20) {
      setError("A product can have at most 20 images.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          image,
          images,
          subCategoryId: form.subCategoryId || null,
          ...(product.variants.length ? { stock: undefined } : {}),
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save product");
    } finally {
      setBusy(false);
    }
  };

  const subCategories = categories.find((category) => category.id === form.categoryId)?.subCategories ?? [];
  const inputClass = "mt-1 w-full rounded-lg border p-2.5 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="edit-product-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 id="edit-product-title" className="text-lg font-bold">Edit product</h2>
          <button type="button" onClick={onClose} disabled={busy || uploading} aria-label="Close editor">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <form onSubmit={save} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold">Product name
              <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
            </label>
            <label className="text-xs font-semibold">SKU
              <input maxLength={100} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} className={inputClass} />
            </label>
            <label className="text-xs font-semibold">Category
              <select required value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value, subCategoryId: "" })} className={inputClass}>
                <option value="">Select category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold">Subcategory
              <select value={form.subCategoryId} onChange={(event) => setForm({ ...form, subCategoryId: event.target.value })} className={inputClass}>
                <option value="">None</option>
                {subCategories.map((subCategory) => <option key={subCategory.id} value={subCategory.id}>{subCategory.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold">Regular price
              <input type="number" min="0.01" step="0.01" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className={inputClass} />
            </label>
            <label className="text-xs font-semibold">Sale price
              <input type="number" min="0" step="0.01" value={form.discountPrice} onChange={(event) => setForm({ ...form, discountPrice: event.target.value })} className={inputClass} />
            </label>
            <label className="text-xs font-semibold">Stock {product.variants.length > 0 && "(managed by variant)"}
              <input type="number" min="0" step="1" required disabled={product.variants.length > 0} value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} className={`${inputClass} disabled:bg-gray-100`} />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Visible on storefront
            </label>
            <label className="text-xs font-semibold sm:col-span-2">Image URL
              <input type="url" required value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} className={inputClass} />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
              <Upload className="h-4 w-4" /> {uploading ? "Uploading..." : "Upload image"}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/x-icon" disabled={busy || uploading} className="sr-only" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }} />
            </label>
            <label className="text-xs font-semibold sm:col-span-2">Description
              <textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" onClick={onClose} disabled={busy || uploading} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={busy || uploading} style={{ backgroundColor: primaryColor }} className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "Saving..." : "Save product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
