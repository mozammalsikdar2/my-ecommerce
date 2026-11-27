"use client";

import Image from "next/image";
import { useSettings } from "@/context/SettingsContext";
import { LayoutGrid, Tag } from "lucide-react";

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  subCategories: { id: string; name: string }[];
  _count?: { products: number };
}

interface CategoryBarProps {
  categories: CategoryItem[];
  selectedCategoryId: string;
  selectedSubCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onSelectSubCategory: (subCategoryId: string | null) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function CategoryBar({
  categories,
  selectedCategoryId,
  selectedSubCategoryId,
  onSelectCategory,
  onSelectSubCategory,
  isLoading = false,
  error = null,
}: CategoryBarProps) {
  const { settings } = useSettings();

  if (!isLoading && categories.length === 0 && !error) return null;

  const selectedCategory = categories.find(
    (category) => category.id === selectedCategoryId,
  );
  const selectedCardStyle = {
    borderColor: settings.primaryColor,
    backgroundColor: settings.primaryColor,
    color: "#ffffff",
  };

  return (
    <section
      aria-label="Shop by category"
      className="mx-auto max-w-7xl px-4 pt-10"
    >
      <div className="mb-4">
        <h2 className="text-xl font-extrabold text-gray-900 sm:text-2xl">
          Shop by Category
        </h2>
        <p className="text-xs text-gray-500">
          Browse collections tailored to your needs
        </p>
      </div>

      {isLoading ? (
        <p role="status" className="text-sm text-gray-500">
          Loading categories...
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            <button
              type="button"
              aria-pressed={selectedCategoryId === "ALL"}
              onClick={() => onSelectCategory("ALL")}
              style={
                selectedCategoryId === "ALL" ? selectedCardStyle : undefined
              }
              className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center shadow-sm transition ${
                selectedCategoryId === "ALL"
                  ? "shadow-md"
                  : "bg-white text-gray-800 hover:border-gray-300 hover:shadow"
              }`}
            >
              <LayoutGrid className="mb-2 h-6 w-6" />
              <span className="text-xs font-bold sm:text-sm">All Products</span>
              <span
                className={`mt-0.5 text-[11px] ${
                  selectedCategoryId === "ALL"
                    ? "text-white/80"
                    : "text-gray-400"
                }`}
              >
                Full Catalog
              </span>
            </button>

            {categories.map((category) => {
              const isSelected = selectedCategoryId === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    onSelectCategory(isSelected ? "ALL" : category.id)
                  }
                  style={isSelected ? selectedCardStyle : undefined}
                  className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center shadow-sm transition ${
                    isSelected
                      ? "shadow-md"
                      : "bg-white text-gray-800 hover:border-gray-300 hover:shadow"
                  }`}
                >
                  {category.imageUrl ? (
                    <Image
                      src={category.imageUrl}
                      alt=""
                      width={40}
                      height={40}
                      unoptimized
                      className="mb-2 h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <Tag
                      style={
                        !isSelected
                          ? { color: settings.primaryColor }
                          : undefined
                      }
                      className="mb-2 h-6 w-6"
                    />
                  )}
                  <span className="line-clamp-1 text-xs font-bold sm:text-sm">
                    {category.name}
                  </span>
                  <span
                    className={`mt-0.5 text-[11px] ${
                      isSelected ? "text-white/80" : "text-gray-400"
                    }`}
                  >
                    {category._count?.products ?? 0} items
                  </span>
                </button>
              );
            })}
          </div>

          {selectedCategory?.subCategories.length ? (
            <div className="mt-4 flex flex-wrap gap-2 border-l-2 border-gray-200 pl-3">
              <button
                type="button"
                aria-pressed={!selectedSubCategoryId}
                onClick={() => onSelectSubCategory(null)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  !selectedSubCategoryId
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                All {selectedCategory.name}
              </button>
              {selectedCategory.subCategories.map((subCategory) => (
                <button
                  key={subCategory.id}
                  type="button"
                  aria-pressed={selectedSubCategoryId === subCategory.id}
                  onClick={() =>
                    onSelectSubCategory(
                      selectedSubCategoryId === subCategory.id
                        ? null
                        : subCategory.id,
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    selectedSubCategoryId === subCategory.id
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                  }`}
                >
                  {subCategory.name}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
