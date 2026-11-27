import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const appUrl = new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  );
  if (appUrl.protocol !== "http:" && appUrl.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS");
  }

  const baseUrl = `${appUrl.origin}${appUrl.pathname.replace(/\/+$/, "")}`;

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/products", "/pages/", "/track-order"],
        disallow: [
          "/admin",
          "/api",
          "/account",
          "/checkout",
          "/cart",
          "/wishlist",
          "/login",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: appUrl.origin,
  };
}
