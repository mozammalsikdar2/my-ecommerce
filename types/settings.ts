export interface MenuItem {
  label: string;
  href: string;
}

export interface SiteSettings {
  storeName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  menuItems: MenuItem[];
  announcementText: string;
  heroTitle: string;
  heroSubtitle: string;
  heroButtonText: string;
  heroButtonLink: string;
  heroImage: string;
  flashSaleEndsAt: string | null;
  deliveryChargeInside: number;
  deliveryChargeOutside: number;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  footerText: string;
  facebookUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  whatsappNumber: string;
  messengerUsername: string;
}

export const defaultMenuItems: MenuItem[] = [
  { label: "Home", href: "/" },
  { label: "Products", href: "/#products" },
  { label: "Track Order", href: "/track-order" },
];

export const defaultSettings: SiteSettings = {
  storeName: "ALIF STORE",
  tagline: "Premium Quality & Trusted Online Shopping",
  logoUrl: "",
  faviconUrl: "/favicon.ico",
  primaryColor: "#0f766e",
  secondaryColor: "#111827",
  fontFamily: "Inter",
  menuItems: defaultMenuItems,
  announcementText:
    "Free Delivery on orders over 2,000 BDT! Cash on Delivery Available.",
  heroTitle: "Discover Exclusive Collections for Everyday Life",
  heroSubtitle:
    "Shop top-rated products with fast nationwide delivery and 100% authentic guarantee.",
  heroButtonText: "Shop Now",
  heroButtonLink: "/#products",
  heroImage:
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80",
  flashSaleEndsAt: null,
  deliveryChargeInside: 60,
  deliveryChargeOutside: 120,
  contactPhone: "+880 1700-000000",
  contactEmail: "support@alifstore.com",
  contactAddress: "Dhaka, Bangladesh",
  footerText: "© 2026 Alif Store. All rights reserved.",
  facebookUrl: "https://facebook.com",
  instagramUrl: "https://instagram.com",
  youtubeUrl: "https://youtube.com",
  whatsappNumber: "8801700000000",
  messengerUsername: "",
};
