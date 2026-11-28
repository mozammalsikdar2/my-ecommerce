import { defaultMenuItems } from "@/types/settings";
import type { MenuItem, SiteSettings } from "@/types/settings";
import { prisma } from "@/lib/prisma";
import { loginSettingsSchema } from "@/types/login-settings";
import { headerSettingsSchema } from "@/types/header-settings";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeMenuHref(href: string) {
  if (
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.includes("\\")
  ) {
    return true;
  }
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isMenuItem(value: unknown): value is MenuItem {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    value.label.trim().length > 0 &&
    value.label.trim().length <= 60 &&
    typeof value.href === "string" &&
    value.href.trim().length > 0 &&
    value.href.trim().length <= 2048 &&
    isSafeMenuHref(value.href.trim())
  );
}

function parseMenuItems(value: unknown): MenuItem[] {
  if (!Array.isArray(value) || value.length > 20 || !value.every(isMenuItem)) {
    return defaultMenuItems;
  }
  return value.map((item) => ({
    label: item.label.trim(),
    href: item.href.trim(),
  }));
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const record = await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return {
    ...loginSettingsSchema.parse(record),
    ...headerSettingsSchema.parse(record),
    storeName: record.storeName,
    tagline: record.tagline,
    logoUrl: record.logoUrl,
    faviconUrl: record.faviconUrl,
    primaryColor: record.primaryColor,
    secondaryColor: record.secondaryColor,
    fontFamily: record.fontFamily,
    menuItems: parseMenuItems(record.menuItems),
    announcementText: record.announcementText,
    heroTitle: record.heroTitle,
    heroSubtitle: record.heroSubtitle,
    heroButtonText: record.heroButtonText,
    heroButtonLink: record.heroButtonLink,
    heroImage: record.heroImage,
    flashSaleEndsAt: record.flashSaleEndsAt?.toISOString() ?? null,
    deliveryChargeInside: record.deliveryChargeInside,
    deliveryChargeOutside: record.deliveryChargeOutside,
    contactPhone: record.contactPhone,
    contactEmail: record.contactEmail,
    contactAddress: record.contactAddress,
    footerText: record.footerText,
    facebookUrl: record.facebookUrl,
    instagramUrl: record.instagramUrl,
    youtubeUrl: record.youtubeUrl,
    whatsappNumber: record.whatsappNumber,
    messengerUsername: record.messengerUsername,
  };
}
