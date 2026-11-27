"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { PhoneCall, ShieldCheck, Truck } from "lucide-react";
import CategoryBar, { CategoryItem } from "@/components/home/CategoryBar";
import FlashSaleSection, {
  StoreProduct,
} from "@/components/home/FlashSaleSection";
import HeroSlider, { BannerSlide } from "@/components/home/HeroSlider";
import ProductGridSection, {
  isStoreProduct,
} from "@/components/home/ProductGridSection";
import { useSettings } from "@/context/SettingsContext";

interface HomepageSection {
  id: string;
  sectionKey: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  order: number;
  isVisible: boolean;
}

interface SubCategoryItem {
  id: string;
  name: string;
}

const defaultSections: HomepageSection[] = [
  {
    id: "hero",
    sectionKey: "HERO_SLIDER",
    title: "Hero Slider",
    order: 1,
    isVisible: true,
  },
  {
    id: "services",
    sectionKey: "SERVICE_HIGHLIGHTS",
    title: "Service Highlights",
    order: 2,
    isVisible: true,
  },
  {
    id: "featured",
    sectionKey: "FEATURED_PRODUCTS",
    title: "Featured Products",
    subtitle: "Handpicked quality products for you",
    order: 3,
    isVisible: true,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBanner(value: unknown): value is BannerSlide {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (value.subtitle === undefined ||
      typeof value.subtitle === "string" ||
      value.subtitle === null) &&
    typeof value.imageUrl === "string" &&
    typeof value.buttonText === "string" &&
    typeof value.buttonLink === "string" &&
    typeof value.isActive === "boolean"
  );
}

function isSubCategory(value: unknown): value is SubCategoryItem {
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

function isHomepageSection(value: unknown): value is HomepageSection {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sectionKey === "string" &&
    typeof value.title === "string" &&
    (value.subtitle === undefined ||
      typeof value.subtitle === "string" ||
      value.subtitle === null) &&
    (value.imageUrl === undefined ||
      typeof value.imageUrl === "string" ||
      value.imageUrl === null) &&
    (value.linkUrl === undefined ||
      typeof value.linkUrl === "string" ||
      value.linkUrl === null) &&
    typeof value.order === "number" &&
    typeof value.isVisible === "boolean"
  );
}

async function fetchApiData(
  url: string,
  signal: AbortSignal
): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(`${url} request failed (${response.status})`);
  }
  return response.json();
}

function parseArrayResult<T>(
  result: PromiseSettledResult<unknown>,
  label: string,
  guard: (value: unknown) => value is T
): { data: T[] | null; error: string | null } {
  if (result.status === "rejected") {
    const reason =
      result.reason instanceof Error ? result.reason.message : String(result.reason);
    return { data: null, error: `${label}: ${reason}` };
  }
  if (!Array.isArray(result.value) || !result.value.every(guard)) {
    return { data: null, error: `${label}: received an invalid response` };
  }
  return { data: result.value, error: null };
}

function StorefrontHomeContent() {
  const { settings } = useSettings();
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchQuery = searchParams.get("search") || "";

  const [banners, setBanners] = useState<BannerSlide[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [sections, setSections] = useState<HomepageSection[]>(defaultSections);
  const [selectedCategoryId, setSelectedCategoryId] = useState("ALL");
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [pageErrors, setPageErrors] = useState<string[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStorefront() {
      setLoading(true);
      const results = await Promise.allSettled([
        fetchApiData("/api/banners", controller.signal),
        fetchApiData("/api/categories", controller.signal),
        fetchApiData("/api/products", controller.signal),
        fetchApiData("/api/layout", controller.signal),
      ]);
      if (controller.signal.aborted) return;

      const [bannerResult, categoryResult, productResult, layoutResult] =
        results;
      const bannerData = parseArrayResult(bannerResult, "Banners", isBanner);
      const categoryData = parseArrayResult(
        categoryResult,
        "Categories",
        isCategory
      );
      const productData = parseArrayResult(
        productResult,
        "Products",
        isStoreProduct
      );
      const layoutData = parseArrayResult(
        layoutResult,
        "Homepage layout",
        isHomepageSection
      );

      const errors = [
        bannerData.error,
        categoryData.error,
        layoutData.error,
      ].filter((error): error is string => error !== null);
      setPageErrors(errors);
      setCategoryError(categoryData.error);
      setProductError(productData.error);
      setBanners((bannerData.data || []).filter((banner) => banner.isActive));
      setCategories(categoryData.data || []);
      setProducts(productData.data || []);
      setSections(
        layoutData.data && layoutData.data.length > 0
          ? layoutData.data
          : defaultSections
      );
      if (errors.length > 0) console.error("Storefront data could not load:", errors);
      if (productData.error) {
        console.error("Storefront products could not load:", productData.error);
      }
      setLoading(false);
    }

    void loadStorefront();
    return () => controller.abort();
  }, []);

  const selectedCategory = categories.find(
    (category) => category.id === selectedCategoryId
  );

  const isFiltering =
    selectedCategoryId !== "ALL" ||
    Boolean(selectedSubCategoryId) ||
    Boolean(searchQuery);

  const displayedProducts = useMemo(() => {
    const matchingProducts = products.filter((product) => {
      const matchesCategory =
        selectedCategoryId === "ALL" ||
        product.categoryId === selectedCategoryId;
      const matchesSubCategory =
        !selectedSubCategoryId ||
        product.subCategory?.id === selectedSubCategoryId;
      const matchesSearch =
        !searchQuery ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSubCategory && matchesSearch;
    });

    if (isFiltering) return matchingProducts;
    const featuredProducts = matchingProducts.filter(
      (product) => product.isFeatured
    );
    return featuredProducts.length > 0
      ? featuredProducts
      : matchingProducts.slice(0, 8);
  }, [
    isFiltering,
    products,
    searchQuery,
    selectedCategoryId,
    selectedSubCategoryId,
  ]);

  const flashSaleProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            product.isFlashSale ||
            (product.discountPrice !== null &&
              product.discountPrice !== undefined &&
              product.discountPrice < product.price)
        )
        .slice(0, 4),
    [products]
  );

  const activeFilterLabel = searchQuery
    ? `Search Results for "${searchQuery}"`
    : selectedSubCategoryId
      ? `${
          selectedCategory?.subCategories.find(
            (subCategory) => subCategory.id === selectedSubCategoryId
          )?.name || "Subcategory"
        } Collection`
      : selectedCategory
        ? `${selectedCategory.name} Collection`
        : null;

  const clearFilters = () => {
    setSelectedCategoryId("ALL");
    setSelectedSubCategoryId(null);
    if (searchQuery) router.push("/");
  };

  const renderDynamicSection = (section: HomepageSection) => {
    switch (section.sectionKey) {
      case "HERO_SLIDER":
        return (
          <div key={section.id}>
            <HeroSlider banners={banners} />
            <CategoryBar
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={(categoryId) => {
                setSelectedCategoryId(categoryId);
                setSelectedSubCategoryId(null);
              }}
              selectedSubCategoryId={selectedSubCategoryId}
              onSelectSubCategory={setSelectedSubCategoryId}
              isLoading={loading}
              error={categoryError}
            />
            {!isFiltering && <FlashSaleSection products={flashSaleProducts} />}
          </div>
        );

      case "SERVICE_HIGHLIGHTS":
        return (
          <section key={section.id} className="mt-10 border-y bg-white py-6">
            <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl border p-4">
                <Truck
                  style={{ color: settings.primaryColor }}
                  className="h-8 w-8 shrink-0"
                />
                <div>
                  <h3 className="text-sm font-bold">
                    Fast Nationwide Delivery
                  </h3>
                  <p className="text-xs text-gray-500">
                    Inside Dhaka: ৳{settings.deliveryChargeInside} | Outside: ৳
                    {settings.deliveryChargeOutside}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border p-4">
                <ShieldCheck
                  style={{ color: settings.primaryColor }}
                  className="h-8 w-8 shrink-0"
                />
                <div>
                  <h3 className="text-sm font-bold">
                    100% Authentic Products
                  </h3>
                  <p className="text-xs text-gray-500">
                    Quality verified before dispatch
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border p-4">
                <PhoneCall
                  style={{ color: settings.primaryColor }}
                  className="h-8 w-8 shrink-0"
                />
                <div>
                  <h3 className="text-sm font-bold">Dedicated Support</h3>
                  <p className="text-xs text-gray-500">
                    Call or WhatsApp: {settings.contactPhone}
                  </p>
                </div>
              </div>
            </div>
          </section>
        );

      case "FEATURED_PRODUCTS":
        return (
          <ProductGridSection
            key={section.id}
            title={section.title || "Featured Products"}
            subtitle={section.subtitle || undefined}
            products={displayedProducts}
            activeFilterLabel={activeFilterLabel}
            onClearFilter={clearFilters}
            isLoading={loading}
            error={productError}
          />
        );

      case "OFFER_BANNER":
        return (
          <section key={section.id} className="mx-auto max-w-7xl px-4 py-6">
            <div className="relative min-h-60 overflow-hidden rounded-2xl bg-gray-900 text-white shadow-lg">
              {section.imageUrl && (
                <Image
                  src={section.imageUrl}
                  alt={section.title}
                  fill
                  unoptimized
                  sizes="(max-width: 1280px) 100vw, 1280px"
                  className="object-cover opacity-40"
                />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <h2 className="text-2xl font-extrabold sm:text-4xl">
                  {section.title}
                </h2>
                {section.subtitle && (
                  <p className="mt-2 max-w-xl text-sm text-gray-200">
                    {section.subtitle}
                  </p>
                )}
                <Link
                  href={section.linkUrl || "/#products"}
                  style={{ backgroundColor: settings.primaryColor }}
                  className="mt-5 rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow hover:opacity-90"
                >
                  Shop Offer
                </Link>
              </div>
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center text-sm text-gray-500">
        Loading {settings.storeName}...
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {pageErrors.length > 0 && (
        <div
          role="alert"
          className="mx-auto mt-4 max-w-7xl px-4 text-sm text-amber-700"
        >
          Some storefront content could not be loaded.
        </div>
      )}
      {sections
        .filter((section) => section.isVisible)
        .sort((a, b) => a.order - b.order)
        .map(renderDynamicSection)}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-sm text-gray-500">
          Loading storefront...
        </div>
      }
    >
      <StorefrontHomeContent />
    </Suspense>
  );
}
