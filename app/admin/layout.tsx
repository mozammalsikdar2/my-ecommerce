"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CreditCard,
  ExternalLink,
  FileText,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Mail,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Ticket,
  Truck,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";

const navigation = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/logistics", label: "Courier & SMS", icon: Truck },
  { href: "/admin/pages", label: "Policies", icon: FileText },
  { href: "/admin/security", label: "Security & 2FA", icon: ShieldCheck },
  { href: "/admin/settings", label: "Site Settings", icon: Settings },
  { href: "/admin/layout", label: "Homepage Layout", icon: BarChart3 },
];

function isActivePath(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const { settings } = useSettings();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const isLoginRoute = pathname === "/admin/login";
  const hasAdminAccess =
    user?.role === "ADMIN" || user?.role === "MODERATOR";

  useEffect(() => {
    if (isLoginRoute || loading || hasAdminAccess) return;
    router.replace("/admin/login");
  }, [hasAdminAccess, isLoginRoute, loading, router]);

  if (isLoginRoute) return children;
  if (loading || !hasAdminAccess) {
    return (
      <div
        role="status"
        className="grid min-h-screen place-items-center text-sm text-slate-500"
      >
        Verifying admin access...
      </div>
    );
  }

  const links = [
    ...navigation.slice(0, 5),
    ...(user?.role === "ADMIN"
      ? [
          { href: "/admin/users", label: "Staff & Users", icon: Users },
        ]
      : []),
    ...navigation.slice(5, 7),
    ...(user?.role === "ADMIN"
      ? [{ href: "/admin/email", label: "Email & PDF", icon: Mail }]
      : []),
    ...navigation.slice(7),
    ...(user?.role === "ADMIN"
      ? [{ href: "/admin/marketing", label: "Marketing", icon: BarChart3 }]
      : []),
  ];

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "Unable to sign out",
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-800 bg-slate-950 text-slate-100 lg:flex">
        <Link href="/admin" className="border-b border-slate-800 px-6 py-6">
          <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
            Store Control
          </span>
          <span className="mt-1 block text-xl font-bold">Admin Console</span>
        </Link>
        <nav aria-label="Admin navigation" className="flex-1 space-y-1 px-3 py-5">
          {links.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                style={
                  active
                    ? {
                        backgroundColor: settings.primaryColor,
                        color: "#ffffff",
                      }
                    : undefined
                }
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "shadow-sm"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/"
          className="m-3 flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <ExternalLink className="h-4 w-4" />
          View storefront
        </Link>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Ecommerce management
              </p>
              <p className="truncate text-sm font-semibold">
                {user?.name ?? "Admin Console"}
                {user && (
                  <span className="ml-2 text-xs font-medium text-slate-500">
                    {user.role}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
          <nav
            aria-label="Admin navigation"
            className="flex gap-1 overflow-x-auto border-t px-3 py-2 lg:hidden"
          >
            {links.map(({ href, label, icon: Icon }) => {
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  style={
                    active
                      ? {
                          backgroundColor: settings.primaryColor,
                          color: "#ffffff",
                        }
                      : undefined
                  }
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                    active
                      ? "shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
            <Link
              href="/"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              <ExternalLink className="h-4 w-4" />
              Store
            </Link>
          </nav>
        </header>

        {logoutError && (
          <p role="alert" className="mx-4 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 sm:mx-6">
            {logoutError}
          </p>
        )}
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
