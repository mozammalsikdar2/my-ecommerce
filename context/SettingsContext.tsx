"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { defaultMenuItems, defaultSettings } from "@/types/settings";
import type { MenuItem, SiteSettings } from "@/types/settings";

export { defaultMenuItems, defaultSettings };
export type { MenuItem, SiteSettings };

export interface CmsBanner {
  id?: string;
  title: string;
  subtitle?: string;
  buttonText: string;
  buttonLink: string;
  imageUrl: string;
  isActive: boolean;
}

export interface CmsSection {
  id: string;
  sectionKey: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  linkUrl?: string;
  order: number;
  isVisible: boolean;
}

interface SettingsContextType {
  settings: SiteSettings;
  banners: CmsBanner[];
  sections: CmsSection[];
  isLoading: boolean;
  loadError: string | null;
  saveSettings: (updated: Partial<SiteSettings>) => Promise<boolean>;
  updateSettings: (newSettings: Partial<SiteSettings>) => Promise<void>;
  resetSettings: () => Promise<boolean>;
  saveCmsState: (payload: {
    settings?: Partial<SiteSettings>;
    banners?: CmsBanner[];
    sections?: CmsSection[];
  }) => Promise<boolean>;
  refreshCms: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const fontStacks: Record<string, string> = {
  Inter: "var(--font-inter), Arial, sans-serif",
  Roboto: '"Roboto", Arial, sans-serif',
  "Open Sans": '"Open Sans", Arial, sans-serif',
  Lato: '"Lato", Arial, sans-serif',
  Montserrat: '"Montserrat", Arial, sans-serif',
  Poppins: '"Poppins", Arial, sans-serif',
  "Hind Siliguri": '"Hind Siliguri", sans-serif',
  Arial: "Arial, Helvetica, sans-serif",
  Georgia: "Georgia, serif",
  "System UI": "system-ui, sans-serif",
  Verdana: "Verdana, sans-serif",
};

const googleFontFamilies = new Set([
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Hind Siliguri",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeStoreLink(value: string) {
  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  ) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseMenuItems(value: unknown): MenuItem[] | null {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    !value.every(
      (item) =>
        isRecord(item) &&
        typeof item.label === "string" &&
        item.label.trim().length > 0 &&
        item.label.trim().length <= 60 &&
        typeof item.href === "string" &&
        item.href.length <= 2048 &&
        isSafeStoreLink(item.href),
    )
  ) {
    return null;
  }
  return value.map((item) => ({
    label: item.label as string,
    href: item.href as string,
  }));
}

function parseSettings(value: unknown): SiteSettings | null {
  if (!isRecord(value)) return null;
  const menuItems = parseMenuItems(value.menuItems);
  if (!menuItems) return null;

  const stringFields = [
    "storeName",
    "tagline",
    "logoUrl",
    "faviconUrl",
    "primaryColor",
    "secondaryColor",
    "fontFamily",
    "footerText",
    "announcementText",
    "contactEmail",
    "contactAddress",
    "facebookUrl",
    "instagramUrl",
    "youtubeUrl",
    "whatsappNumber",
    "messengerUsername",
    "heroTitle",
    "heroSubtitle",
    "heroButtonText",
    "heroButtonLink",
    "heroImage",
    "contactPhone",
  ] as const;
  if (
    stringFields.some((field) => typeof value[field] !== "string") ||
    typeof value.heroButtonLink !== "string" ||
    !isSafeStoreLink(value.heroButtonLink) ||
    typeof value.deliveryChargeInside !== "number" ||
    typeof value.deliveryChargeOutside !== "number" ||
    !(
      value.flashSaleEndsAt === null ||
      (typeof value.flashSaleEndsAt === "string" &&
        Number.isFinite(Date.parse(value.flashSaleEndsAt)))
    )
  ) {
    return null;
  }

  return {
    storeName: value.storeName as string,
    tagline: value.tagline as string,
    logoUrl: value.logoUrl as string,
    faviconUrl: value.faviconUrl as string,
    primaryColor: value.primaryColor as string,
    secondaryColor: value.secondaryColor as string,
    fontFamily: value.fontFamily as string,
    menuItems,
    footerText: value.footerText as string,
    announcementText: value.announcementText as string,
    contactEmail: value.contactEmail as string,
    contactAddress: value.contactAddress as string,
    facebookUrl: value.facebookUrl as string,
    instagramUrl: value.instagramUrl as string,
    youtubeUrl: value.youtubeUrl as string,
    whatsappNumber: value.whatsappNumber as string,
    messengerUsername: value.messengerUsername as string,
    heroTitle: value.heroTitle as string,
    heroSubtitle: value.heroSubtitle as string,
    heroButtonText: value.heroButtonText as string,
    heroButtonLink: value.heroButtonLink as string,
    heroImage: value.heroImage as string,
    flashSaleEndsAt: value.flashSaleEndsAt as string | null,
    deliveryChargeInside: value.deliveryChargeInside,
    deliveryChargeOutside: value.deliveryChargeOutside,
    contactPhone: value.contactPhone as string,
  };
}

async function responseError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string") return body.error;
  } catch {
    // The response may not contain JSON.
  }
  return `Request failed (${response.status})`;
}

function parseBanner(value: unknown): CmsBanner | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.title !== "string" ||
    typeof value.imageUrl !== "string" ||
    typeof value.isActive !== "boolean"
  ) {
    return null;
  }
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    title: value.title,
    subtitle: typeof value.subtitle === "string" ? value.subtitle : "",
    buttonText:
      typeof value.buttonText === "string" ? value.buttonText : "Shop Now",
    buttonLink:
      typeof value.buttonLink === "string" ? value.buttonLink : "/",
    imageUrl: value.imageUrl,
    isActive: value.isActive,
  };
}

function parseSection(value: unknown): CmsSection | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.sectionKey !== "string" ||
    typeof value.title !== "string" ||
    typeof value.order !== "number" ||
    typeof value.isVisible !== "boolean"
  ) {
    return null;
  }
  return {
    id: value.id,
    sectionKey: value.sectionKey,
    title: value.title,
    subtitle: typeof value.subtitle === "string" ? value.subtitle : "",
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : "",
    linkUrl: typeof value.linkUrl === "string" ? value.linkUrl : "",
    order: value.order,
    isVisible: value.isVisible,
  };
}

export function SettingsProvider({
  children,
  initialSettings,
}: {
  children: React.ReactNode;
  initialSettings?: SiteSettings;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<SiteSettings>(
    initialSettings ?? defaultSettings,
  );
  const [banners, setBanners] = useState<CmsBanner[]>([]);
  const [sections, setSections] = useState<CmsSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshCms = useCallback(async () => {
    try {
      const response = await fetch("/api/cms", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const cms: unknown = await response.json();
      if (!isRecord(cms)) throw new Error("The CMS API returned invalid data");

      const loadedSettings = parseSettings(cms.settings);
      if (loadedSettings) setSettings(loadedSettings);
      if (Array.isArray(cms.banners)) {
        setBanners(
          cms.banners
            .map(parseBanner)
            .filter((banner): banner is CmsBanner => banner !== null),
        );
      }
      if (Array.isArray(cms.sections)) {
        setSections(
          cms.sections
            .map(parseSection)
            .filter((section): section is CmsSection => section !== null),
        );
      }
      setLoadError(null);
    } catch (error) {
      console.error("Failed to refresh CMS state:", error);
      setLoadError(
        error instanceof Error ? error.message : "Failed to refresh CMS state",
      );
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--color-primary",
      settings.primaryColor,
    );
    document.documentElement.style.setProperty(
      "--color-secondary",
      settings.secondaryColor,
    );
    document.title = `${settings.storeName} | ${settings.tagline}`;

    let iconUrl = "/favicon.ico";
    if (settings.faviconUrl.startsWith("/") && !settings.faviconUrl.startsWith("//")) {
      iconUrl = settings.faviconUrl;
    } else {
      try {
        const url = new URL(settings.faviconUrl);
        if (url.protocol === "http:" || url.protocol === "https:") {
          iconUrl = url.href;
        }
      } catch {
        iconUrl = "/favicon.ico";
      }
    }

    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = iconUrl;

    const fontLinkId = "dynamic-google-font";
    let fontLink = document.getElementById(fontLinkId) as HTMLLinkElement | null;
    if (googleFontFamilies.has(settings.fontFamily)) {
      if (!fontLink) {
        fontLink = document.createElement("link");
        fontLink.id = fontLinkId;
        fontLink.rel = "stylesheet";
        document.head.appendChild(fontLink);
      }
      const fontUrl = new URL("https://fonts.googleapis.com/css2");
      fontUrl.searchParams.set(
        "family",
        `${settings.fontFamily}:wght@400;500;600;700;800`,
      );
      fontUrl.searchParams.set("display", "swap");
      fontLink.href = fontUrl.toString();
    } else {
      fontLink?.remove();
    }
  }, [
    settings.faviconUrl,
    settings.fontFamily,
    settings.primaryColor,
    settings.secondaryColor,
    settings.storeName,
    settings.tagline,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      try {
        const response = await fetch("/api/cms", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(await responseError(response));
        }

        const cms: unknown = await response.json();
        if (!isRecord(cms)) {
          throw new Error("The CMS API returned invalid data");
        }
        if (!initialSettings) {
          const loadedSettings = parseSettings(cms.settings);
          if (!loadedSettings) {
            throw new Error("The CMS API returned invalid settings");
          }
          setSettings(loadedSettings);
        }
        if (Array.isArray(cms.banners)) {
          setBanners(
            cms.banners
              .map(parseBanner)
              .filter((banner): banner is CmsBanner => banner !== null),
          );
        }
        if (Array.isArray(cms.sections)) {
          setSections(
            cms.sections
              .map(parseSection)
              .filter((section): section is CmsSection => section !== null),
          );
        }
        setLoadError(null);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Failed to fetch settings from database:", error);
          setLoadError(
            error instanceof Error ? error.message : "Failed to load store settings",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadSettings();
    return () => controller.abort();
  }, [initialSettings]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("cms_live_sync");
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isRecord(event.data) && event.data.type === "CMS_UPDATED") {
        void refreshCms();
        router.refresh();
      }
    };
    return () => channel.close();
  }, [refreshCms, router]);

  const updateSettings = async (newSettings: Partial<SiteSettings>) => {
    const response = await fetch("/api/settings", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSettings),
    });
    if (!response.ok) {
      throw new Error(await responseError(response));
    }

    const updatedSettings = parseSettings(await response.json());
    if (!updatedSettings) {
      throw new Error("The settings API returned invalid data");
    }
    setSettings(updatedSettings);
    setLoadError(null);
  };

  const saveCmsState = useCallback(
    async (payload: {
      settings?: Partial<SiteSettings>;
      banners?: CmsBanner[];
      sections?: CmsSection[];
    }) => {
      const response = await fetch("/api/cms", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          ...(payload.banners
            ? {
                banners: payload.banners.map((banner) => ({
                  title: banner.title,
                  subtitle: banner.subtitle,
                  buttonText: banner.buttonText,
                  buttonLink: banner.buttonLink,
                  imageUrl: banner.imageUrl,
                  isActive: banner.isActive,
                })),
              }
            : {}),
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));

      const cms: unknown = await response.json();
      if (!isRecord(cms)) {
        throw new Error("The CMS API returned invalid data after saving");
      }
      const loadedSettings = parseSettings(cms.settings);
      if (loadedSettings) setSettings(loadedSettings);
      if (Array.isArray(cms.banners)) {
        setBanners(
          cms.banners
            .map(parseBanner)
            .filter((banner): banner is CmsBanner => banner !== null),
        );
      }
      if (Array.isArray(cms.sections)) {
        setSections(
          cms.sections
            .map(parseSection)
            .filter((section): section is CmsSection => section !== null),
        );
      }
      setLoadError(null);

      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("cms_live_sync");
        channel.postMessage({ type: "CMS_UPDATED" });
        channel.close();
      }
      router.refresh();
      return true;
    },
    [router],
  );

  const saveSettings = (updated: Partial<SiteSettings>) =>
    saveCmsState({ settings: updated });
  const resetSettings = () => saveSettings(defaultSettings);

  const fontFamily = fontStacks[settings.fontFamily] ?? fontStacks.Inter;

  return (
    <SettingsContext.Provider
      value={{
        settings,
        banners,
        sections,
        isLoading,
        loadError,
        saveSettings,
        updateSettings,
        resetSettings,
        saveCmsState,
        refreshCms,
      }}
    >
      <div style={{ fontFamily }}>{children}</div>
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
