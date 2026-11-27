import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();

  const appUrl = new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  );
  if (appUrl.protocol !== "http:" && appUrl.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS");
  }
  const baseUrl = `${appUrl.origin}${appUrl.pathname.replace(/\/+$/, "")}`;
  const siteUrl = (path: string) => `${baseUrl}${path}`;
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: siteUrl("/products"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: siteUrl("/track-order"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const [products, categories, policyPages] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.category.findMany({
      where: { products: { some: { isActive: true } } },
      select: { id: true, updatedAt: true },
      orderBy: { name: "asc" },
    }),
    prisma.page.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: { slug: "asc" },
    }),
  ]);

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: siteUrl(`/products?categoryId=${encodeURIComponent(category.id)}`),
    lastModified: category.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: siteUrl(`/products/${encodeURIComponent(product.id)}`),
    lastModified: product.updatedAt,
    changeFrequency: "daily",
    priority: 0.85,
  }));

  const policyRoutes: MetadataRoute.Sitemap = policyPages.map((page) => ({
    url: siteUrl(`/pages/${encodeURIComponent(page.slug)}`),
    lastModified: page.updatedAt,
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...policyRoutes];
}
