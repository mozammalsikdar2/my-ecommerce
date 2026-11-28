import type { Metadata } from "next";
import { connection } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { cache, Suspense } from "react";
import { Inter } from "next/font/google";
import GoogleTracking from "@/components/GoogleTracking";
import MetaPixel from "@/components/MetaPixel";
import StorefrontShell from "@/components/StorefrontShell";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { getMarketingSettings } from "@/lib/marketing-settings";
import { getSiteSettings } from "@/lib/settings";
import type { SiteSettings } from "@/types/settings";
import { defaultSettings } from "@/types/settings";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const getSettingsForRequest = cache(async (): Promise<SiteSettings | null> => {
  try {
    return await getSiteSettings();
  } catch (error) {
    console.error("Failed to load site settings from database:", error);
    return null;
  }
});

async function getMetadataSettings(): Promise<SiteSettings> {
  "use cache";
  cacheLife("minutes");
  cacheTag("site-settings");

  return (await getSettingsForRequest()) ?? defaultSettings;
}

function getSafeMetadataUrl(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getMetadataSettings();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const metadataBase = new URL(appUrl);
  if (metadataBase.protocol !== "http:" && metadataBase.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS");
  }

  const faviconUrl = getSafeMetadataUrl(settings.faviconUrl);
  const heroImage = getSafeMetadataUrl(settings.heroImage);
  return {
    metadataBase,
    title: {
      default: `${settings.storeName} | ${settings.tagline}`,
      template: `%s | ${settings.storeName}`,
    },
    description: settings.tagline,
    icons: faviconUrl ? { icon: faviconUrl } : undefined,
    openGraph: {
      siteName: settings.storeName,
      type: "website",
      locale: "en_US",
      ...(heroImage ? { images: [heroImage] } : {}),
    },
  };
}

async function GoogleTrackingSettings() {
  await connection();
  let marketing;
  try {
    marketing = await getMarketingSettings();
  } catch (error) {
    console.error("Failed to load Google marketing settings:", error);
    return <GoogleTracking />;
  }

  return (
    <GoogleTracking
      gtmId={marketing?.gtmEnabled ? marketing.gtmContainerId || undefined : undefined}
      gaId={marketing?.ga4Enabled ? marketing.ga4MeasurementId || undefined : undefined}
    />
  );
}

async function StorefrontProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const initialSettings = (await getSettingsForRequest()) ?? undefined;

  return (
    <SettingsProvider initialSettings={initialSettings}>
      <LanguageProvider>
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <Suspense fallback={null}>
                <MetaPixel />
              </Suspense>
              <Suspense fallback={null}>
                <StorefrontShell>{children}</StorefrontShell>
              </Suspense>
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    </SettingsProvider>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} ${inter.variable} flex min-h-screen flex-col bg-gray-50 text-gray-900`}
      >
        <Suspense
          fallback={
            <div
              role="status"
              className="grid min-h-screen place-items-center text-sm text-gray-500"
            >
              Loading store settings...
            </div>
          }
        >
          <StorefrontProviders>{children}</StorefrontProviders>
        </Suspense>
        <Suspense fallback={null}>
          <GoogleTrackingSettings />
        </Suspense>
      </body>
    </html>
  );
}
