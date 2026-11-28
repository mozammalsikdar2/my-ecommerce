import { z } from "zod";

const color = z.string().regex(/^#[\da-f]{6}$/i);
const isSafeLink = (value: string) => {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
const imageUrl = z.string().trim().max(2048).refine(
  (value) => value === "" || isSafeLink(value),
  "Icon URL must be root-relative or use HTTP(S)",
);
const label = z.string().trim().min(1).max(500);

export const headerSettingsSchema = z.object({
  headerTopBgColor: color,
  headerMainBgColor: color,
  headerSearchBtnColor: color,
  categoryBarBgColor: color,
  showTopUtilityBar: z.boolean(),
  storeLocationsText: label,
  storeLocationsUrl: z.string().trim().min(1).max(2048).refine(isSafeLink),
  storeLocationsIconUrl: imageUrl,
  trackOrderText: label,
  showTrackOrder: z.boolean(),
  defaultLanguage: z.enum(["EN", "BN"]),
  enableLanguageSwitcher: z.boolean(),
  showCameraSearchIcon: z.boolean(),
  cameraIconUrl: imageUrl,
  accountIconUrl: imageUrl,
  cartIconUrl: imageUrl,
  showHeaderMessenger: z.boolean(),
  headerMessengerIconUrl: imageUrl,
  showHeaderWhatsapp: z.boolean(),
  headerWhatsappIconUrl: imageUrl,
  showHeaderCall: z.boolean(),
  headerCallNumber: z.string().trim().max(32).refine(
    (value) => value === "" || /^\+?[\d\s()-]+$/.test(value),
    "Call number contains invalid characters",
  ),
  headerCallLabel: label,
  headerCallIconUrl: imageUrl,
  showBottomWhatsapp: z.boolean(),
  bottomWhatsappIconUrl: imageUrl,
  showBottomMessenger: z.boolean(),
  bottomMessengerIconUrl: imageUrl,
  showBottomCall: z.boolean(),
  bottomCallIconUrl: imageUrl,
  footerFacebookIconUrl: imageUrl,
  footerInstagramIconUrl: imageUrl,
  footerYoutubeIconUrl: imageUrl,
});

export type HeaderSettings = z.infer<typeof headerSettingsSchema>;

export const defaultHeaderSettings: HeaderSettings = {
  headerTopBgColor: "#152c5b",
  headerMainBgColor: "#1f3e7a",
  headerSearchBtnColor: "#f97316",
  categoryBarBgColor: "#ffffff",
  showTopUtilityBar: true,
  storeLocationsText: "STORE LOCATIONS",
  storeLocationsUrl: "/contact",
  storeLocationsIconUrl: "",
  trackOrderText: "Track Order",
  showTrackOrder: true,
  defaultLanguage: "EN",
  enableLanguageSwitcher: true,
  showCameraSearchIcon: true,
  cameraIconUrl: "",
  accountIconUrl: "",
  cartIconUrl: "",
  showHeaderMessenger: true,
  headerMessengerIconUrl: "",
  showHeaderWhatsapp: true,
  headerWhatsappIconUrl: "",
  showHeaderCall: true,
  headerCallNumber: "01984361250",
  headerCallLabel: "Hotline",
  headerCallIconUrl: "",
  showBottomWhatsapp: true,
  bottomWhatsappIconUrl: "",
  showBottomMessenger: true,
  bottomMessengerIconUrl: "",
  showBottomCall: false,
  bottomCallIconUrl: "",
  footerFacebookIconUrl: "",
  footerInstagramIconUrl: "",
  footerYoutubeIconUrl: "",
};
