"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlignLeft, Camera, ChevronDown, Globe, Heart, LayoutDashboard, MapPin,
  Menu, MessageCircle, MessageSquare, PhoneCall, Search, ShoppingBag, Truck, User, X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { useWishlist } from "@/context/WishlistContext";
import { getCallHref, getMessengerHref, getWhatsappHref } from "@/lib/chat-links";
import { headerSettingsSchema } from "@/types/header-settings";
import VisualSearchModal from "@/components/VisualSearchModal";

interface NavCategory {
  id: string;
  name: string;
  iconUrl?: string | null;
  subCategories: { id: string; name: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNavCategory(value: unknown): value is NavCategory {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.iconUrl == null ||
      (typeof value.iconUrl === "string" &&
        headerSettingsSchema.shape.cameraIconUrl.safeParse(value.iconUrl).success)) &&
    Array.isArray(value.subCategories) &&
    value.subCategories.every(
      (sub) => isRecord(sub) && typeof sub.id === "string" && typeof sub.name === "string",
    )
  );
}

function CustomIcon({ url, fallback, size = 20 }: {
  url: string | null | undefined;
  fallback: ReactNode;
  size?: number;
}) {
  return url ? (
    <Image src={url} alt="" width={size} height={size} unoptimized className="shrink-0 object-contain" />
  ) : fallback;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { settings } = useSettings();
  const { lang, setLang, t } = useLanguage();
  const { user, loading, logout } = useAuth();
  const { itemCount } = useCart();
  const { totalWishlistItems } = useWishlist();
  const [categories, setCategories] = useState<NavCategory[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [visualSearchOpen, setVisualSearchOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const isStaff = user?.role === "ADMIN" || user?.role === "MODERATOR";

  useEffect(() => {
    const controller = new AbortController();
    async function loadCategories() {
      try {
        const response = await fetch("/api/categories", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Categories request failed (${response.status})`);
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isNavCategory)) {
          throw new Error("Categories response has an invalid format");
        }
        setCategories(data);
        setCategoryError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Navigation categories could not load:", error);
        setCategoryError("Unable to load categories.");
      }
    }
    void loadCategories();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setAllCategoriesOpen(false);
        setActiveCategory(null);
        setSettingsOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAllCategoriesOpen(false);
        setActiveCategory(null);
        setSettingsOpen(false);
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const closeMenus = () => {
    setAllCategoriesOpen(false);
    setActiveCategory(null);
    setSettingsOpen(false);
    setMobileMenuOpen(false);
  };
  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchTerm.trim();
    router.push(query ? `/?search=${encodeURIComponent(query)}#products` : "/#products");
    closeMenus();
  };
  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
      closeMenus();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Unable to log out");
    }
  };

  const messengerHref = getMessengerHref(settings.messengerUsername);
  const whatsappHref = getWhatsappHref(
    settings.whatsappNumber,
    `Hello ${settings.storeName}, I need assistance.`,
  );
  const callHref = getCallHref(settings.headerCallNumber);
  const categoryHref = (id: string) => `/products?categoryId=${encodeURIComponent(id)}`;

  const searchForm = (mobile: boolean) => (
    <form
      role="search"
      onSubmit={handleSearch}
      className={`${mobile ? "flex md:hidden" : "hidden md:flex"} min-w-0 flex-1 items-center rounded-full bg-white p-1 pl-4 shadow-inner`}
    >
      <input
        type="search"
        aria-label="Search products"
        placeholder={t("searchPlaceholder")}
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        className="min-w-0 w-full bg-transparent text-sm text-gray-800 placeholder-gray-500 focus:outline-none"
      />
      {settings.showCameraSearchIcon && (
        <button
          type="button"
          onClick={() => setVisualSearchOpen(true)}
          aria-label={t("photoSearch")}
          title={t("photoSearch")}
          aria-haspopup="dialog"
          aria-expanded={visualSearchOpen}
          className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
        >
          <CustomIcon url={settings.cameraIconUrl} size={18} fallback={<Camera aria-hidden="true" className="h-[18px] w-[18px]" />} />
        </button>
      )}
      <button type="submit" aria-label="Search" style={{ backgroundColor: settings.headerSearchBtnColor }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:brightness-110">
        <Search aria-hidden="true" className="h-4 w-4" />
      </button>
    </form>
  );

  if (pathname.startsWith("/admin")) return null;

  return (
    <>
      <header ref={headerRef} className="sticky top-0 z-50 shadow-sm">
        {settings.showTopUtilityBar && (
          <div style={{ backgroundColor: settings.headerTopBgColor }} className="border-b border-white/10 text-xs font-medium text-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5">
              <Link href={settings.storeLocationsUrl} className="inline-flex items-center gap-1.5 uppercase hover:underline">
                <CustomIcon url={settings.storeLocationsIconUrl} size={14} fallback={<MapPin aria-hidden="true" className="h-3.5 w-3.5" />} />
                <span>{lang === "BN" ? t("storeLocations") : settings.storeLocationsText}</span>
              </Link>
              {settings.announcementText && (
                <span className="hidden items-center gap-1.5 font-semibold md:flex">
                  <Truck aria-hidden="true" className="h-3.5 w-3.5" /> {settings.announcementText}
                </span>
              )}
              <div className="relative flex items-center gap-4">
                {settings.showTrackOrder && <Link href="/track-order" className="hover:underline">{lang === "BN" ? t("trackOrder") : settings.trackOrderText}</Link>}
                <button type="button" aria-expanded={settingsOpen} aria-controls="header-settings-menu" onClick={() => setSettingsOpen((open) => !open)} className="inline-flex items-center gap-1 hover:underline">
                  {t("settings")} <ChevronDown aria-hidden="true" className="h-3 w-3" />
                </button>
                {settingsOpen && (
                  <div id="header-settings-menu" className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border bg-white py-1 text-xs text-gray-800 shadow-xl">
                    <Link href="/account" onClick={closeMenus} className="block px-4 py-2 hover:bg-gray-100">{t("myAccount")}</Link>
                    <Link href="/wishlist" onClick={closeMenus} className="block px-4 py-2 hover:bg-gray-100">Wishlist</Link>
                    {isStaff && <Link href="/admin" onClick={closeMenus} className="block px-4 py-2 hover:bg-gray-100">Admin Panel</Link>}
                    {!loading && user && <button type="button" onClick={handleLogout} className="block w-full px-4 py-2 text-left hover:bg-gray-100">Logout</button>}
                    {settings.enableLanguageSwitcher && (
                      <button type="button" onClick={() => { setLang(lang === "EN" ? "BN" : "EN"); setSettingsOpen(false); }} className="block w-full px-4 py-2 text-left font-semibold text-blue-700 hover:bg-gray-100">
                        {lang === "EN" ? "বাংলায় দেখুন (BN)" : "Switch to English (EN)"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div style={{ backgroundColor: settings.headerMainBgColor }} className="text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3.5">
            <button type="button" aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileMenuOpen} aria-controls="mobile-navigation" onClick={() => setMobileMenuOpen((open) => !open)} className="rounded-lg p-1.5 hover:bg-white/10 lg:hidden">
              {mobileMenuOpen ? <X aria-hidden="true" className="h-6 w-6" /> : <Menu aria-hidden="true" className="h-6 w-6" />}
            </button>
            <Link href="/" onClick={closeMenus} className="flex min-w-0 max-w-[calc(100%-3.5rem)] shrink-0 items-center gap-2">
              {settings.logoUrl && <Image src={settings.logoUrl} alt="" width={144} height={40} unoptimized className="h-9 w-auto object-contain" />}
              <span className="truncate font-serif text-xl font-extrabold uppercase tracking-wide sm:text-2xl">{settings.storeName}</span>
            </Link>
            <div className="hidden min-w-0 flex-1 justify-center md:flex">{searchForm(false)}</div>
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
              {!loading && (
                <Link href={user ? "/account" : "/login"} aria-label={user ? t("myAccount") : t("signIn")} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/10">
                  <CustomIcon url={settings.accountIconUrl} fallback={<User aria-hidden="true" className="h-5 w-5" />} />
                  <span className="hidden text-xs font-bold sm:block">{user ? user.name : t("signIn")}<br />{t("yourAccount")}</span>
                </Link>
              )}
              {settings.enableLanguageSwitcher && (
                <div role="group" aria-label="Language" className="flex rounded-full border border-white/25 bg-white/10 p-0.5 text-xs font-bold">
                  <button type="button" aria-pressed={lang === "EN"} onClick={() => setLang("EN")} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${lang === "EN" ? "bg-white text-gray-900" : "text-white"}`}><Globe aria-hidden="true" className="h-3 w-3" /> EN</button>
                  <button type="button" aria-pressed={lang === "BN"} onClick={() => setLang("BN")} className={`rounded-full px-2 py-1 ${lang === "BN" ? "bg-white text-gray-900" : "text-white"}`}>বাংলা</button>
                </div>
              )}
              <Link href="/wishlist" aria-label="Saved Wishlist" title="Saved Wishlist" className="relative rounded-lg p-2 hover:bg-white/10">
                <Heart aria-hidden="true" className="h-5 w-5" />
                {totalWishlistItems > 0 && <span className="absolute right-0 top-0 rounded-full bg-red-600 px-1 text-[10px]">{totalWishlistItems}</span>}
              </Link>
              <Link href="/cart" aria-label="Shopping Cart" title="Shopping Cart" className="relative rounded-lg p-2 hover:bg-white/10">
                <CustomIcon url={settings.cartIconUrl} size={24} fallback={<ShoppingBag aria-hidden="true" className="h-6 w-6" />} />
                <span style={{ backgroundColor: settings.headerSearchBtnColor }} className="absolute right-0 top-0 rounded-full px-1 text-[10px] font-bold">{itemCount}</span>
              </Link>
              {isStaff && <Link href="/admin" aria-label="Admin Panel" title="Admin Panel" className="hidden rounded-lg p-2 hover:bg-white/10 lg:block"><LayoutDashboard aria-hidden="true" className="h-5 w-5" /></Link>}
              {!loading && user && <button type="button" onClick={handleLogout} className="hidden rounded-lg px-2 py-1 text-xs font-bold hover:bg-white/10 lg:block">Logout</button>}
            </div>
          </div>
          <div className="px-4 pb-3 md:hidden">{searchForm(true)}</div>
        </div>

        <div style={{ backgroundColor: settings.categoryBarBgColor }} className="hidden border-b border-gray-200 lg:block">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <div className="relative">
                <button type="button" aria-expanded={allCategoriesOpen} aria-controls="all-categories-menu" onClick={() => { setAllCategoriesOpen((open) => !open); setActiveCategory(null); }} style={{ backgroundColor: settings.headerMainBgColor }} className="flex items-center gap-2 rounded-md px-4 py-2 text-xs font-bold text-white">
                  <AlignLeft aria-hidden="true" className="h-4 w-4" /> {t("allCategories")} <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
                {allCategoriesOpen && (
                  <div id="all-categories-menu" className="absolute left-0 top-full z-50 mt-1 max-h-80 w-64 overflow-y-auto rounded-xl border bg-white py-2 text-gray-800 shadow-xl">
                    {categoryError ? <p role="alert" className="px-4 py-2 text-xs text-red-700">{categoryError}</p> : categories.length === 0 ? <p className="px-4 py-2 text-xs text-gray-500">{t("noCategories")}</p> : categories.map((category) => (
                      <Link key={category.id} href={categoryHref(category.id)} onClick={closeMenus} className="flex items-center gap-2 px-4 py-2 text-xs font-bold hover:bg-blue-50">
                        <CustomIcon url={category.iconUrl} size={16} fallback={null} /> {category.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1">
                {settings.menuItems.map((item, index) => <Link key={`${item.href}-${index}`} href={item.href} onClick={closeMenus} className="rounded-md px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">{item.label}</Link>)}
              </nav>
              {categories.map((category) => (
                <div key={category.id} className="relative flex items-center" onMouseEnter={() => { setActiveCategory(category.id); setAllCategoriesOpen(false); }} onMouseLeave={() => setActiveCategory(null)}>
                  <Link href={categoryHref(category.id)} onClick={closeMenus} className="flex items-center gap-1 rounded-md py-2 pl-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                    <CustomIcon url={category.iconUrl} size={14} fallback={null} /> {category.name}
                  </Link>
                  {category.subCategories.length > 0 && (
                    <>
                      <button type="button" aria-label={`${category.name} subcategories`} aria-expanded={activeCategory === category.id} onClick={() => { setActiveCategory(activeCategory === category.id ? null : category.id); setAllCategoriesOpen(false); }} className="rounded-md p-2 text-gray-600 hover:bg-gray-100"><ChevronDown aria-hidden="true" className="h-3 w-3" /></button>
                      {activeCategory === category.id && (
                        <div className="absolute left-0 top-full z-50 min-w-52 rounded-xl border bg-white py-2 text-gray-800 shadow-xl">
                          <Link href={categoryHref(category.id)} onClick={closeMenus} className="block border-b px-4 py-2 text-xs font-bold hover:bg-gray-100">{t("viewAllIn")} {category.name}</Link>
                          {category.subCategories.map((sub) => <Link key={sub.id} href={`${categoryHref(category.id)}&subCategoryId=${encodeURIComponent(sub.id)}`} onClick={closeMenus} className="block px-4 py-2 text-xs hover:bg-gray-100">{sub.name}</Link>)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {settings.showHeaderMessenger && messengerHref && <a href={messengerHref} target="_blank" rel="noopener noreferrer" aria-label="Messenger" title="Chat on Messenger" className="rounded-full bg-gradient-to-tr from-[#006aff] via-[#a033ff] to-[#ff5280] p-2 text-white"><CustomIcon url={settings.headerMessengerIconUrl} fallback={<MessageSquare aria-hidden="true" className="h-5 w-5" />} /></a>}
              {settings.showHeaderWhatsapp && whatsappHref && <a href={whatsappHref} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" title="Chat on WhatsApp" className="rounded-full bg-[#25d366] p-2 text-white"><CustomIcon url={settings.headerWhatsappIconUrl} fallback={<MessageCircle aria-hidden="true" className="h-5 w-5" />} /></a>}
              {settings.showHeaderCall && callHref && <a href={callHref} aria-label={`${settings.headerCallLabel}: ${settings.headerCallNumber}`} className="flex items-center gap-2 rounded-full border bg-gray-50 px-3 py-1 text-gray-800"><CustomIcon url={settings.headerCallIconUrl} size={16} fallback={<PhoneCall aria-hidden="true" className="h-4 w-4" />} /><span className="text-xs"><span className="block text-[10px]">{lang === "BN" ? t("hotline") : settings.headerCallLabel}</span><strong>{settings.headerCallNumber}</strong></span></a>}
            </div>
          </div>
        </div>

        <nav id="mobile-navigation" aria-label="Mobile navigation" hidden={!mobileMenuOpen} className="max-h-[60vh] space-y-3 overflow-y-auto border-b bg-white px-4 py-4 text-gray-800 lg:hidden">
          <div className="flex flex-col gap-1">
            {settings.menuItems.map((item, index) => <Link key={`${item.href}-${index}`} href={item.href} onClick={closeMenus} className="rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-gray-100">{item.label}</Link>)}
            <Link href="/products" onClick={closeMenus} className="rounded-lg px-2 py-1.5 text-sm font-bold hover:bg-gray-100">{t("allCategories")}</Link>
            {categoryError ? <p role="alert" className="px-2 text-xs text-red-700">{categoryError}</p> : categories.map((category) => (
              <div key={category.id} className="pl-2">
                <Link href={categoryHref(category.id)} onClick={closeMenus} className="block py-1 text-sm font-semibold">{category.name}</Link>
                {category.subCategories.map((sub) => <Link key={sub.id} href={`${categoryHref(category.id)}&subCategoryId=${encodeURIComponent(sub.id)}`} onClick={closeMenus} className="block py-1 pl-3 text-xs">{sub.name}</Link>)}
              </div>
            ))}
            {isStaff && <Link href="/admin/settings" onClick={closeMenus} className="border-t px-2 pt-3 text-sm font-bold">Customize site</Link>}
            {!loading && (user ? <button type="button" onClick={handleLogout} className="px-2 py-1.5 text-left text-sm font-semibold">Logout</button> : <Link href="/login" onClick={closeMenus} className="px-2 py-1.5 text-sm font-semibold">Login</Link>)}
          </div>
          <div className="flex flex-wrap gap-3 border-t pt-3 text-xs font-bold">
            {settings.showHeaderMessenger && messengerHref && <a href={messengerHref} target="_blank" rel="noopener noreferrer">Messenger</a>}
            {settings.showHeaderWhatsapp && whatsappHref && <a href={whatsappHref} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
            {settings.showHeaderCall && callHref && <a href={callHref}>{settings.headerCallLabel} {settings.headerCallNumber}</a>}
          </div>
        </nav>
        {logoutError && <p role="alert" className="bg-white px-4 py-2 text-right text-xs text-red-700">{logoutError}</p>}
      </header>
      {visualSearchOpen && <VisualSearchModal onClose={() => setVisualSearchOpen(false)} />}
    </>
  );
}
