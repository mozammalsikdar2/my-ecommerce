"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  ShoppingCart,
  Heart,
  Search,
  Camera,
  User,
  LayoutDashboard,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import VisualSearchModal from "@/components/VisualSearchModal";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { settings } = useSettings();
  const { user, loading, logout } = useAuth();
  const { itemCount } = useCart();
  const { totalWishlistItems } = useWishlist();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [visualSearchOpen, setVisualSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const isStaff = user?.role === "ADMIN" || user?.role === "MODERATOR";

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchTerm.trim();
    router.push(
      query
        ? `/?search=${encodeURIComponent(query)}#products`
        : "/#products",
    );
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "Unable to log out",
      );
    }
  };

  if (pathname.startsWith("/admin")) return null;

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-white/95 shadow-sm backdrop-blur-sm">
        {settings.announcementText && (
          <div
            style={{ backgroundColor: settings.primaryColor }}
            className="px-4 py-1.5 text-center text-xs font-semibold text-white sm:text-sm"
          >
            {settings.announcementText}
          </div>
        )}

        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex shrink-0 items-center gap-2.5"
          >
            {settings.logoUrl && (
              <Image
                src={settings.logoUrl}
                alt={settings.storeName}
                width={144}
                height={40}
                unoptimized
                className="h-9 w-auto object-contain"
              />
            )}
            <span
              style={{ color: settings.primaryColor }}
              className="text-xl font-extrabold tracking-tight"
            >
              {settings.storeName}
            </span>
          </Link>

          {settings.menuItems.length > 0 && (
            <nav
              aria-label="Main navigation"
              className="hidden min-w-0 max-w-[40vw] items-center gap-6 overflow-x-auto md:flex"
            >
              {settings.menuItems.map((item, index) => (
                <Link
                  key={`${item.href}-${index}`}
                  href={item.href}
                  className="shrink-0 text-sm font-semibold text-gray-700 transition hover:text-black"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
            <form
              onSubmit={handleSearch}
              className="hidden items-center rounded-xl border bg-gray-50 px-3 py-1.5 lg:flex"
              role="search"
            >
              <input
                type="search"
                placeholder="Search products..."
                aria-label="Search products"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-36 bg-transparent text-xs text-gray-800 focus:outline-none xl:w-44"
              />
              <button
                type="submit"
                aria-label="Search"
                className="text-gray-500 hover:text-black"
              >
                <Search aria-hidden="true" className="h-4 w-4" />
              </button>
            </form>

            <button
              type="button"
              onClick={() => setVisualSearchOpen(true)}
              aria-label="Search products by photo"
              title="Search products by photo"
              aria-haspopup="dialog"
              aria-expanded={visualSearchOpen}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-100 hover:text-black"
            >
              <Camera
                aria-hidden="true"
                style={{ color: settings.primaryColor }}
                className="h-5 w-5"
              />
              <span className="hidden sm:inline">Photo Search</span>
            </button>

            {isStaff && (
              <Link
                href="/admin"
                title="Admin Panel"
                aria-label="Admin Panel"
                className="hidden items-center gap-1 rounded-xl border border-gray-200 px-2.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 md:flex"
              >
                <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
                <span className="hidden xl:inline">Admin Panel</span>
              </Link>
            )}

            <Link
              href="/wishlist"
              aria-label="Saved Wishlist"
              title="Saved Wishlist"
              className="relative rounded-xl p-2 text-gray-700 hover:bg-gray-100"
            >
              <Heart aria-hidden="true" className="h-5 w-5" />
              {totalWishlistItems > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {totalWishlistItems}
                </span>
              )}
            </Link>

            <Link
              href="/cart"
              aria-label="Shopping Cart"
              title="Shopping Cart"
              className="relative rounded-xl p-2 text-gray-700 hover:bg-gray-100"
            >
              <ShoppingCart aria-hidden="true" className="h-5 w-5" />
              <span
                style={{ backgroundColor: settings.primaryColor }}
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
              >
                {itemCount}
              </span>
            </Link>

            {!loading &&
              (user ? (
                <>
                  <Link
                    href="/account"
                    aria-label="My Account"
                    title={user.name}
                    className="rounded-xl p-2 text-gray-700 hover:bg-gray-100"
                  >
                    <User aria-hidden="true" className="h-5 w-5" />
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="hidden rounded-xl border px-2.5 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 lg:inline-flex"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  aria-label="Login"
                  title="Login"
                  className="rounded-xl p-2 text-gray-700 hover:bg-gray-100"
                >
                  <User aria-hidden="true" className="h-5 w-5" />
                </Link>
              ))}

            <button
              type="button"
              aria-label={
                mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"
              }
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="rounded-xl p-2 text-gray-700 hover:bg-gray-100 md:hidden"
            >
              {mobileMenuOpen ? (
                <X aria-hidden="true" className="h-5 w-5" />
              ) : (
                <Menu aria-hidden="true" className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          hidden={!mobileMenuOpen}
          className="space-y-3 border-t bg-white px-4 py-4 md:hidden"
        >
          <form onSubmit={handleSearch} className="flex gap-2" role="search">
            <input
              type="search"
              placeholder="Search products..."
              aria-label="Search products"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs"
            />
            <button
              type="submit"
              style={{ backgroundColor: settings.primaryColor }}
              className="rounded-xl px-4 py-2 text-xs font-bold text-white"
            >
              Search
            </button>
          </form>

          <div className="flex flex-col gap-2">
            {settings.menuItems.map((item, index) => (
              <Link
                key={`${item.href}-${index}`}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                {item.label}
              </Link>
            ))}

            {isStaff && (
              <Link
                href="/admin/settings"
                onClick={() => setMobileMenuOpen(false)}
                style={{ color: settings.primaryColor }}
                className="flex items-center gap-2 border-t pt-3 text-sm font-bold"
              >
                <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
                Customize site
              </Link>
            )}

            {!loading &&
              (user ? (
                <>
                  <Link
                    href="/account"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    My Account
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Login
                </Link>
              ))}
          </div>
        </nav>

        {logoutError && (
          <p role="alert" className="px-4 pb-2 text-right text-xs text-red-700">
            {logoutError}
          </p>
        )}
      </header>
      {visualSearchOpen && (
        <VisualSearchModal onClose={() => setVisualSearchOpen(false)} />
      )}
    </>
  );
}
