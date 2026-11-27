import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/settings";
import { defaultSettings } from "@/types/settings";
import ProductDetailClient, {
  type ProductDetail,
} from "@/components/ProductDetailClient";

const getProduct = cache(async (id: string) =>
  prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      subCategory: { select: { name: true } },
      variants: {
        select: { id: true, size: true, color: true, price: true, stock: true },
      },
    },
  }),
);

const getProductSettings = cache(async () => {
  try {
    return await getSiteSettings();
  } catch (error) {
    console.error("Failed to load settings for product page:", error);
    return defaultSettings;
  }
});

function getAppUrl() {
  const appUrl = new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  );
  if (appUrl.protocol !== "http:" && appUrl.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS");
  }
  return appUrl;
}

function resolveAbsoluteUrl(value: string | null | undefined, baseUrl: URL) {
  const fallbackUrl = new URL("/favicon.ico", baseUrl).toString();
  if (!value?.trim()) return fallbackUrl;

  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}

function serializeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

type ProductRecord = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

function toProductDetail(product: ProductRecord): ProductDetail {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    discountPrice: product.discountPrice,
    stock: product.stock,
    image: product.image,
    images: product.images,
    categoryId: product.categoryId,
    category: product.category,
    subCategory: product.subCategory,
    variants: product.variants,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [product, settings] = await Promise.all([
    getProduct(id),
    getProductSettings(),
  ]);

  if (!product || !product.isActive) notFound();

  const appUrl = getAppUrl();
  const effectivePrice = product.discountPrice ?? product.price;
  const hasDiscount =
    product.discountPrice !== null && product.discountPrice < product.price;
  const savings = hasDiscount ? product.price - effectivePrice : 0;
  const formattedTitle = `${product.name} — ৳${effectivePrice.toLocaleString()}`;
  const stockBadge = product.stock > 0 ? "In Stock" : "Out of Stock";
  const discountText = hasDiscount
    ? `Offer Price: ৳${effectivePrice.toLocaleString()} (Regular ৳${product.price.toLocaleString()}, Save ৳${savings.toLocaleString()})`
    : `Price: ৳${effectivePrice.toLocaleString()}`;
  const cleanDescription =
    product.description?.replace(/\s+/g, " ").trim().slice(0, 140) ||
    `Order ${product.name} online from ${settings.storeName} with fast nationwide delivery.`;
  const fullDescription = `${discountText} • ${stockBadge}. ${cleanDescription}`;
  const productUrl = new URL(
    `/products/${encodeURIComponent(product.id)}`,
    appUrl,
  );
  const absoluteImageUrl = resolveAbsoluteUrl(
    product.image || product.images.find(Boolean),
    appUrl,
  );
  const fullTitle = `${formattedTitle} | ${settings.storeName}`;

  return {
    metadataBase: appUrl,
    title: formattedTitle,
    description: fullDescription,
    alternates: { canonical: productUrl },
    openGraph: {
      title: fullTitle,
      description: fullDescription,
      url: productUrl,
      siteName: settings.storeName,
      type: "website",
      images: [
        {
          url: absoluteImageUrl,
          secureUrl: absoluteImageUrl,
          width: 1200,
          height: 630,
          alt: product.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: fullDescription,
      images: [absoluteImageUrl],
    },
    other: {
      "og:price:amount": String(effectivePrice),
      "og:price:currency": "BDT",
      "product:price:amount": String(effectivePrice),
      "product:price:currency": "BDT",
      "product:availability": product.stock > 0 ? "in stock" : "out of stock",
      ...(product.category?.name
        ? { "product:category": product.category.name }
        : {}),
    },
  };
}

async function ProductPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, settings] = await Promise.all([
    getProduct(id),
    getProductSettings(),
  ]);

  if (!product || !product.isActive) notFound();

  const relatedRecords = product.categoryId
    ? await prisma.product.findMany({
        where: {
          categoryId: product.categoryId,
          isActive: true,
          id: { not: product.id },
        },
        include: {
          category: { select: { id: true, name: true } },
          subCategory: { select: { name: true } },
          variants: {
            select: {
              id: true,
              size: true,
              color: true,
              price: true,
              stock: true,
            },
          },
        },
        take: 4,
        orderBy: { createdAt: "desc" },
      })
    : [];
  const productData = toProductDetail(product);
  const relatedProducts = relatedRecords.map(toProductDetail);
  const appUrl = getAppUrl();
  const effectivePrice = product.discountPrice ?? product.price;
  const productImages = product.images.filter(Boolean);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image:
      productImages.length > 0
        ? productImages.map((image) => resolveAbsoluteUrl(image, appUrl))
        : [resolveAbsoluteUrl(product.image, appUrl)],
    description: product.description || product.name,
    brand: {
      "@type": "Brand",
      name: settings.storeName,
    },
    offers: {
      "@type": "Offer",
      url: new URL(`/products/${encodeURIComponent(product.id)}`, appUrl),
      priceCurrency: "BDT",
      price: effectivePrice,
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <ProductDetailClient
        key={product.id}
        product={productData}
        relatedProducts={relatedProducts}
      />
    </>
  );
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-gray-500">Loading product...</div>
      }
    >
      <ProductPageContent params={params} />
    </Suspense>
  );
}
