"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  FolderTree,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { slugifyProductName } from "@/lib/product-utils";

interface SubCategoryRecord {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  _count?: { products: number };
}

interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  subCategories: SubCategoryRecord[];
  _count: { products: number };
}

type EditingRecord =
  | {
      type: "category";
      id: string;
      name: string;
      slug: string;
      imageUrl: string;
    }
  | {
      type: "subcategory";
      id: string;
      categoryId: string;
      name: string;
      slug: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSubCategory(value: unknown): value is SubCategoryRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    typeof value.categoryId === "string" &&
    (value._count === undefined ||
      (isRecord(value._count) && typeof value._count.products === "number"))
  );
}

function isCategory(value: unknown): value is CategoryRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    (typeof value.imageUrl === "string" || value.imageUrl === null) &&
    Array.isArray(value.subCategories) &&
    value.subCategories.every(isSubCategory) &&
    isRecord(value._count) &&
    typeof value._count.products === "number"
  );
}

async function getApiError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string") return body.error;
  } catch {
    // Keep the status-based message for non-JSON responses.
  }
  return `Request failed (${response.status})`;
}

async function fetchCategories(signal?: AbortSignal): Promise<CategoryRecord[]> {
  const response = await fetch("/api/categories", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(await getApiError(response));
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every(isCategory)) {
    throw new Error("Categories API returned invalid data");
  }
  return data;
}

function resetSlugEditState(form: HTMLFormElement) {
  const slugInput = form.elements.namedItem("slug");
  if (slugInput instanceof HTMLInputElement) {
    delete slugInput.dataset.edited;
  }
}

export default function AdminCategoriesPage() {
  const { settings } = useSettings();
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingRecord | null>(null);
  const [categoryImageUrl, setCategoryImageUrl] = useState("");
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchCategories(controller.signal)
      .then(setCategories)
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load categories",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function refreshCategories() {
    const data = await fetchCategories();
    setCategories(data);
  }

  async function uploadCategoryImage(file: File, targetId: string) {
    setUploadingImageFor(targetId);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "ecommerce-categories");
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
      if (targetId === "new-category") {
        setCategoryImageUrl(imageUrl);
      } else {
        setEditing((current) =>
          current?.type === "category" && current.id === targetId
            ? { ...current, imageUrl }
            : current,
        );
      }
      setMessage("Category image uploaded.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload category image",
      );
    } finally {
      setUploadingImageFor(null);
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    setPendingId("new-category");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "category",
          name: String(formData.get("name") ?? ""),
          slug: String(formData.get("slug") ?? ""),
          imageUrl: categoryImageUrl.trim() || null,
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      formElement.reset();
      resetSlugEditState(formElement);
      setCategoryImageUrl("");
      await refreshCategories();
      setMessage("Category created.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create category",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function createSubCategory(
    event: FormEvent<HTMLFormElement>,
    categoryId: string,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    setPendingId(`new-subcategory:${categoryId}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "subcategory",
          categoryId,
          name: String(formData.get("name") ?? ""),
          slug: String(formData.get("slug") ?? ""),
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      formElement.reset();
      resetSlugEditState(formElement);
      await refreshCategories();
      setMessage("Sub-category created.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create sub-category",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setPendingId(`${editing.type}:${editing.id}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/categories/${encodeURIComponent(editing.id)}?type=${editing.type}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editing.type === "category"
              ? {
                  name: editing.name,
                  slug: editing.slug,
                  imageUrl: editing.imageUrl.trim() || null,
                }
              : {
                  name: editing.name,
                  slug: editing.slug,
                  categoryId: editing.categoryId,
                },
          ),
        },
      );
      if (!response.ok) throw new Error(await getApiError(response));
      setEditing(null);
      await refreshCategories();
      setMessage(
        editing.type === "category"
          ? "Category updated."
          : "Sub-category updated.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update category",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function deleteRecord(
    type: "category" | "subcategory",
    id: string,
    name: string,
  ) {
    const label = type === "category" ? "category" : "sub-category";
    if (!window.confirm(`Delete ${label} "${name}"?`)) return;
    setPendingId(`${type}:${id}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/categories/${encodeURIComponent(id)}?type=${type}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await getApiError(response));
      if (editing?.id === id) setEditing(null);
      await refreshCategories();
      setMessage(`${label[0].toUpperCase()}${label.slice(1)} deleted.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : `Unable to delete ${label}`,
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link
        href="/admin"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-black"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>
      <div className="mb-6 flex items-center gap-2">
        <FolderTree
          className="h-6 w-6"
          style={{ color: settings.primaryColor }}
        />
        <h1 className="text-2xl font-bold text-gray-900">
          Categories &amp; Sub-Categories
        </h1>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {message}
        </p>
      )}

      <form
        onSubmit={createCategory}
        className="mb-6 grid gap-4 rounded-xl border bg-white p-5 shadow-sm md:grid-cols-4"
      >
        <h2 className="text-lg font-bold md:col-span-4">Add category</h2>
        <label className="text-sm font-medium">
          Category name
          <input
            name="name"
            required
            maxLength={100}
            onChange={(event) => {
              const slugInput = event.currentTarget.form?.elements.namedItem(
                "slug",
              );
              if (slugInput instanceof HTMLInputElement && !slugInput.dataset.edited) {
                slugInput.value = slugifyProductName(event.target.value);
              }
            }}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          URL slug
          <input
            name="slug"
            required
            maxLength={160}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            onInput={(event) => {
              event.currentTarget.dataset.edited = "true";
            }}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Image URL (optional)
          <input
            type="url"
            maxLength={2000}
            placeholder="https://..."
            value={categoryImageUrl}
            onChange={(event) => setCategoryImageUrl(event.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          <Upload className="h-4 w-4" />
          {uploadingImageFor === "new-category" ? "Uploading..." : "Upload image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploadingImageFor === "new-category"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadCategoryImage(file, "new-category");
              event.target.value = "";
            }}
            className="sr-only"
          />
        </label>
        <button
          type="submit"
          disabled={
            pendingId === "new-category" ||
            uploadingImageFor === "new-category"
          }
          style={{ backgroundColor: settings.primaryColor }}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {pendingId === "new-category" ? "Adding..." : "Add category"}
        </button>
      </form>

      {isLoading ? (
        <div role="status" className="rounded-xl border bg-white p-8 text-center text-gray-500">
          Loading categories...
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
          No categories created yet.
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((category) => {
            const categoryEditing =
              editing?.type === "category" && editing.id === category.id;
            return (
              <section
                key={category.id}
                className="rounded-xl border bg-white p-5 shadow-sm"
              >
                {categoryEditing ? (
                  <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-4">
                    <label className="text-sm font-medium">
                      Category name
                      <input
                        required
                        maxLength={100}
                        value={editing.name}
                        onChange={(event) =>
                          setEditing({ ...editing, name: event.target.value })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium">
                      URL slug
                      <input
                        required
                        maxLength={160}
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        value={editing.slug}
                        onChange={(event) =>
                          setEditing({ ...editing, slug: event.target.value })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium md:col-span-2">
                      Image URL
                      <input
                        type="url"
                        maxLength={2000}
                        value={editing.imageUrl}
                        onChange={(event) =>
                          setEditing({
                            ...editing,
                            imageUrl: event.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                      />
                    </label>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                      <Upload className="h-4 w-4" />
                      {uploadingImageFor === category.id
                        ? "Uploading..."
                        : "Upload image"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={uploadingImageFor === category.id}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void uploadCategoryImage(file, category.id);
                          }
                          event.target.value = "";
                        }}
                        className="sr-only"
                      />
                    </label>
                    <div className="flex gap-2 md:col-span-4">
                      <button
                        type="submit"
                        disabled={
                          pendingId === `category:${category.id}` ||
                          uploadingImageFor === category.id
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" /> Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold"
                      >
                        <X className="h-4 w-4" /> Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold">{category.name}</h2>
                      <p className="text-xs text-gray-500">
                        /{category.slug} · {category._count.products} products
                        {category.imageUrl ? " · image set" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/products?categoryId=${encodeURIComponent(category.id)}`}
                        aria-label={`Add item to ${category.name}`}
                        style={{
                          backgroundColor: `${settings.primaryColor}15`,
                          color: settings.primaryColor,
                        }}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-extrabold hover:opacity-80"
                      >
                        + Add Item
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            type: "category",
                            id: category.id,
                            name: category.name,
                            slug: category.slug,
                            imageUrl: category.imageUrl ?? "",
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        disabled={pendingId === `category:${category.id}`}
                        onClick={() =>
                          void deleteRecord("category", category.id, category.name)
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 border-t pt-4">
                  <h3 className="mb-3 text-sm font-bold text-gray-800">
                    Sub-categories
                  </h3>
                  {category.subCategories.length > 0 ? (
                    <ul className="mb-4 space-y-2">
                      {category.subCategories.map((subCategory) => {
                        const subCategoryEditing =
                          editing?.type === "subcategory" &&
                          editing.id === subCategory.id;
                        return (
                          <li
                            key={subCategory.id}
                            className="rounded-lg border bg-gray-50 p-3"
                          >
                            {subCategoryEditing ? (
                              <form
                                onSubmit={saveEdit}
                                className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]"
                              >
                                <input
                                  aria-label="Sub-category name"
                                  required
                                  maxLength={100}
                                  value={editing.name}
                                  onChange={(event) =>
                                    setEditing({
                                      ...editing,
                                      name: event.target.value,
                                    })
                                  }
                                  className="rounded-lg border px-3 py-2 text-sm"
                                />
                                <input
                                  aria-label="Sub-category URL slug"
                                  required
                                  maxLength={160}
                                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                                  value={editing.slug}
                                  onChange={(event) =>
                                    setEditing({
                                      ...editing,
                                      slug: event.target.value,
                                    })
                                  }
                                  className="rounded-lg border px-3 py-2 text-sm"
                                />
                                <button
                                  type="submit"
                                  disabled={
                                    pendingId === `subcategory:${subCategory.id}`
                                  }
                                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  <Check className="h-4 w-4" /> Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditing(null)}
                                  className="inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"
                                >
                                  <X className="h-4 w-4" /> Cancel
                                </button>
                              </form>
                            ) : (
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold">
                                    {subCategory.name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    /{subCategory.slug} ·{" "}
                                    {subCategory._count?.products ?? 0} products
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditing({
                                        type: "subcategory",
                                        id: subCategory.id,
                                        categoryId: category.id,
                                        name: subCategory.name,
                                        slug: subCategory.slug,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                                  >
                                    <Pencil className="h-3.5 w-3.5" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      pendingId === `subcategory:${subCategory.id}`
                                    }
                                    onClick={() =>
                                      void deleteRecord(
                                        "subcategory",
                                        subCategory.id,
                                        subCategory.name,
                                      )
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Delete
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mb-4 text-xs text-gray-500">
                      No sub-categories yet.
                    </p>
                  )}

                  <form
                    onSubmit={(event) =>
                      void createSubCategory(event, category.id)
                    }
                    className="grid gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input
                      name="name"
                      required
                      maxLength={100}
                      placeholder="Sub-category name"
                      aria-label={`New sub-category name for ${category.name}`}
                      onChange={(event) => {
                        const slugInput =
                          event.currentTarget.form?.elements.namedItem("slug");
                        if (
                          slugInput instanceof HTMLInputElement &&
                          !slugInput.dataset.edited
                        ) {
                          slugInput.value = slugifyProductName(
                            event.target.value,
                          );
                        }
                      }}
                      className="rounded-lg border px-3 py-2 text-sm"
                    />
                    <input
                      name="slug"
                      required
                      maxLength={160}
                      pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                      placeholder="url-slug"
                      aria-label={`New sub-category slug for ${category.name}`}
                      onInput={(event) => {
                        event.currentTarget.dataset.edited = "true";
                      }}
                      className="rounded-lg border px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={pendingId === `new-subcategory:${category.id}`}
                      style={{ backgroundColor: settings.primaryColor }}
                      className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      {pendingId === `new-subcategory:${category.id}`
                        ? "Adding..."
                        : "Add sub-category"}
                    </button>
                  </form>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
