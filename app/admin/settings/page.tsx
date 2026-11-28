"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  useSettings,
  type CmsBanner,
  type MenuItem,
  type SiteSettings,
} from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  Image as ImageIcon,
  LayoutTemplate,
  LockKeyhole,
  Menu as MenuIcon,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Timer,
  Trash2,
  Truck,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import HeaderSettingsPanel from "@/components/HeaderSettingsPanel";

const settingsTabs = [
  { id: "brand", label: "Brand & Theme", icon: Palette },
  { id: "menu", label: "Navigation", icon: MenuIcon },
  { id: "hero", label: "Homepage Hero", icon: LayoutTemplate },
  { id: "flash-sale", label: "Flash Sale", icon: Timer },
  { id: "delivery", label: "Delivery & Contact", icon: Truck },
  { id: "footer", label: "Footer & Social", icon: ExternalLink },
  { id: "header", label: "Header & Icons", icon: MenuIcon },
  { id: "login", label: "Login Panels", icon: LockKeyhole },
  { id: "banners", label: "Slider Banners", icon: ImageIcon },
] as const;

type SettingsTab = (typeof settingsTabs)[number]["id"];

const loginTextGroups = [
  {
    title: "Admin login",
    fields: [
      ["adminLoginBackText", "Back link"],
      ["adminLoginBadgeText", "Security badge"],
      ["adminLoginEyebrow", "Eyebrow"],
      ["adminLoginTitle", "Title"],
      ["adminLoginSubtitle", "Subtitle"],
      ["adminEmailLabel", "Email label"],
      ["adminEmailPlaceholder", "Email placeholder"],
      ["adminPasswordLabel", "Password label"],
      ["adminForgotText", "Forgot password link"],
      ["adminButtonText", "Sign-in button"],
      ["adminSwitchPrompt", "Customer login prompt"],
      ["adminSwitchLinkText", "Customer login link"],
    ],
  },
  {
    title: "Customer login",
    fields: [
      ["userLoginBackText", "Back link"],
      ["userLoginBadgeText", "Security badge"],
      ["userLoginEyebrow", "Eyebrow"],
      ["userLoginTitle", "Login title"],
      ["userLoginSubtitle", "Login subtitle"],
      ["userRegisterTitle", "Registration title"],
      ["userRegisterSubtitle", "Registration subtitle"],
      ["userEmailLabel", "Email label"],
      ["userEmailPlaceholder", "Email placeholder"],
      ["userPasswordLabel", "Password label"],
      ["userForgotText", "Forgot password link"],
      ["userButtonText", "Sign-in button"],
      ["userRegisterButtonText", "Registration button"],
      ["userSwitchPrompt", "Admin login prompt"],
      ["userSwitchLinkText", "Admin login link"],
    ],
  },
] as const satisfies readonly {
  title: string;
  fields: readonly (readonly [keyof SiteSettings, string])[];
}[];

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

const colorPresets = [
  { name: "Emerald Teal", hex: "#0f766e" },
  { name: "Royal Forest", hex: "#15803d" },
  { name: "Imperial Gold", hex: "#b45309" },
  { name: "Deep Navy", hex: "#1e3a8a" },
  { name: "Crimson Red", hex: "#b91c1c" },
  { name: "Obsidian Black", hex: "#111827" },
];

export default function AdminSettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const {
    settings,
    banners,
    saveCmsState,
    resetSettings,
    isLoading,
    loadError,
  } = useSettings();
  const [formOverrides, setFormOverrides] = useState<Partial<SiteSettings>>({});
  const formData = { ...settings, ...formOverrides };
  const [bannerOverrides, setBannerOverrides] = useState<CmsBanner[] | null>(
    null,
  );
  const bannerList = bannerOverrides ?? banners;
  const [savedMessage, setSavedMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authState, setAuthState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("brand");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/admin/me", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Unable to verify admin session");
        }
        const result: unknown = await response.json();
        if (
          typeof result !== "object" ||
          result === null ||
          !("user" in result)
        ) {
          throw new Error("Current-user endpoint returned invalid data");
        }
        if (!active) return;
        const user = result.user;
        if (
          typeof user === "object" &&
          user !== null &&
          "role" in user &&
          (user.role === "ADMIN" || user.role === "MODERATOR")
        ) {
          setAuthState("ready");
        } else {
          router.replace("/admin/login");
        }
      } catch (error) {
        if (active) {
          setAuthError(
            error instanceof Error
              ? error.message
              : "Unable to verify admin session",
          );
          setAuthState("error");
        }
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSavedMessage(false);
    setIsSaving(true);
    try {
      await saveCmsState(
        user?.role === "ADMIN"
          ? { settings: formData, banners: bannerList }
          : { banners: bannerList },
      );
      setFormOverrides({});
      setBannerOverrides(null);
      setSavedMessage(true);
      window.setTimeout(() => setSavedMessage(false), 3000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save settings",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (
    file: File,
    fieldKey: string,
    onSuccess: (url: string) => void,
  ) => {
    setErrorMessage(null);
    setUploadingField(fieldKey);
    const data = new FormData();
    data.append("file", file);
    data.append(
      "folder",
      fieldKey === "hero" ||
        fieldKey === "heroImage" ||
        fieldKey.startsWith("banner-")
        ? "homepage-banners"
        : "store-assets",
    );

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: data,
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Image upload failed";
        throw new Error(message);
      }
      if (
        typeof result !== "object" ||
        result === null ||
        !("url" in result) ||
        typeof result.url !== "string"
      ) {
        throw new Error("The upload API returned an invalid image URL");
      }
      onSuccess(result.url);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Image upload failed",
      );
    } finally {
      setUploadingField(null);
    }
  };

  const addBanner = () => {
    setBannerOverrides((current) => [
      ...(current ?? banners),
      {
        title: "New Promotional Banner",
        subtitle: "Explore our latest arrivals",
        buttonText: "Shop Now",
        buttonLink: "/",
        imageUrl: settings.heroImage,
        isActive: true,
      },
    ]);
  };

  const updateBanner = (
    index: number,
    field: keyof CmsBanner,
    value: string | boolean,
  ) => {
    setBannerOverrides((current) =>
      (current ?? banners).map((banner, currentIndex) =>
        currentIndex === index ? { ...banner, [field]: value } : banner,
      ),
    );
  };

  const removeBanner = (index: number) => {
    setBannerOverrides((current) =>
      (current ?? banners).filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const handleReset = async () => {
    setErrorMessage(null);
    setSavedMessage(false);
    setIsSaving(true);
    try {
      await resetSettings();
      setFormOverrides({});
      setSavedMessage(true);
      window.setTimeout(() => setSavedMessage(false), 3000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to reset settings",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    setErrorMessage(null);
    try {
      await logout();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to sign out",
      );
    }
  };

  const handleChange = (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = event.target;
    setFormOverrides((previous) => ({
      ...previous,
      [name]: type === "number" || type === "range" ? Number(value) : value,
    }));
  };

  const updateMenuItem = (
    index: number,
    field: keyof MenuItem,
    value: string,
  ) => {
    setFormOverrides((previous) => ({
      ...previous,
      menuItems: formData.menuItems.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addMenuItem = () => {
    if (formData.menuItems.length >= 20) return;
    setFormOverrides((previous) => ({
      ...previous,
      menuItems: [...formData.menuItems, { label: "New Link", href: "/" }],
    }));
  };

  const removeMenuItem = (index: number) => {
    setFormOverrides((previous) => ({
      ...previous,
      menuItems: formData.menuItems.filter(
        (_, currentIndex) => currentIndex !== index,
      ),
    }));
  };

  const moveMenuItem = (index: number, direction: "UP" | "DOWN") => {
    const target = direction === "UP" ? index - 1 : index + 1;
    if (target < 0 || target >= formData.menuItems.length) return;

    const menuItems = [...formData.menuItems];
    [menuItems[index], menuItems[target]] = [
      menuItems[target],
      menuItems[index],
    ];
    setFormOverrides((previous) => ({ ...previous, menuItems }));
  };

  const previewBanner = bannerList.find((banner) => banner.isActive);
  const previewTitle = previewBanner?.title ?? formData.heroTitle;
  const previewSubtitle = previewBanner?.subtitle ?? formData.heroSubtitle;
  const previewImage = previewBanner?.imageUrl ?? formData.heroImage;
  const previewButtonText = previewBanner?.buttonText ?? formData.heroButtonText;

  if (authState === "loading") {
    return <div className="mx-auto max-w-4xl px-4 py-10">Checking admin session...</div>;
  }
  if (authState === "error") {
    return (
      <div role="alert" className="mx-auto max-w-4xl px-4 py-10 text-red-700">
        {authError}
      </div>
    );
  }
  if (isLoading) {
    return <div className="mx-auto max-w-4xl px-4 py-10">Loading saved settings...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
      <div>
          <Link
            href="/"
            className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Live Storefront
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Website Design &amp; Settings Control
          </h1>
          <p className="text-sm text-gray-500">
            Customize your store identity, theme colors, banners, and delivery
            rates.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            View Store <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {(user?.role === "ADMIN" || user?.role === "MODERATOR") && (
            <>
              <Link
                href="/admin/products"
                className="rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Manage Products
              </Link>
              <Link
                href="/admin/orders"
                className="rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Manage Orders
              </Link>
              <Link
                href="/admin/coupons"
                className="rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Manage Coupons
              </Link>
            </>
          )}
          {user?.role === "ADMIN" && (
            <Link
              href="/admin/users"
              className="rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Manage Users
            </Link>
          )}
          {user?.role === "ADMIN" && (
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" /> Reset Default
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="mb-6 rounded-lg bg-amber-100 p-4 text-sm text-amber-900">
          Could not load saved settings: {loadError}
        </div>
      )}
      {errorMessage && (
        <div role="alert" className="mb-6 rounded-lg bg-red-100 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      )}
      {savedMessage && (
        <div role="status" className="mb-6 rounded-lg bg-green-100 p-4 text-sm font-medium text-green-800">
          Changes saved. Check your storefront to see the live updates.
        </div>
      )}
      {user?.role !== "ADMIN" && (
        <p className="mb-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
          Moderators can manage homepage banners. Only admins can change store
          settings.
        </p>
      )}

      <section
        aria-label="Live storefront preview"
        className="mb-6 overflow-hidden rounded-xl border bg-white shadow-sm"
      >
        <div className="border-b bg-gray-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
          Live storefront preview
        </div>
        <div
          style={{ backgroundColor: formData.primaryColor }}
          className="px-4 py-2 text-center text-xs font-semibold text-white"
        >
          {formData.announcementText || "Announcement bar text appears here"}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-3">
          {formData.logoUrl ? (
            <Image
              src={formData.logoUrl}
              alt={`${formData.storeName} logo`}
              width={140}
              height={40}
              unoptimized
              className="h-9 w-auto object-contain"
            />
          ) : (
            <span
              style={{ color: formData.primaryColor }}
              className="text-xl font-extrabold"
            >
              {formData.storeName || "STORE NAME"}
            </span>
          )}
          <nav
            aria-label="Preview navigation"
            className="flex flex-wrap items-center gap-4 text-xs font-semibold text-gray-700"
          >
            {formData.menuItems.slice(0, 5).map((item, index) => (
              <span key={`${index}-${item.label}`}>{item.label}</span>
            ))}
            {formData.menuItems.length > 5 && (
              <span>+{formData.menuItems.length - 5}</span>
            )}
          </nav>
          <span
            style={{ backgroundColor: formData.primaryColor }}
            className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
          >
            {previewButtonText || "Shop Now"}
          </span>
        </div>
        <div className="relative min-h-48 bg-gray-900 text-white">
          {previewImage && (
            <Image
              src={previewImage}
              alt=""
              fill
              unoptimized
              sizes="100vw"
              className="object-cover opacity-45"
            />
          )}
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 flex min-h-48 flex-col justify-center px-6 py-5">
            <h2 className="max-w-2xl text-xl font-extrabold sm:text-2xl">
              {previewTitle}
            </h2>
            {previewSubtitle && (
              <p className="mt-2 max-w-xl text-sm text-gray-100">
                {previewSubtitle}
              </p>
            )}
            <p className="mt-3 text-xs text-gray-200">
              Delivery: Inside Dhaka ৳{formData.deliveryChargeInside} · Outside
              Dhaka ৳{formData.deliveryChargeOutside}
            </p>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div
          role="tablist"
          aria-label="Store settings sections"
          className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-2 shadow-sm"
        >
          {settingsTabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`settings-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => {
                  if (
                    event.key !== "ArrowRight" &&
                    event.key !== "ArrowLeft" &&
                    event.key !== "Home" &&
                    event.key !== "End"
                  ) {
                    return;
                  }
                  event.preventDefault();
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? settingsTabs.length - 1
                        : (index +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            settingsTabs.length) %
                          settingsTabs.length;
                  const nextTab = settingsTabs[nextIndex];
                  setActiveTab(nextTab.id);
                  document
                    .getElementById(`settings-tab-${nextTab.id}`)
                    ?.focus();
                }}
                style={
                  isActive
                    ? {
                        backgroundColor: formData.primaryColor,
                        color: "#ffffff",
                      }
                    : undefined
                }
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? "shadow-sm"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <fieldset
          disabled={user?.role !== "ADMIN"}
          hidden={activeTab === "banners"}
          className="space-y-6 rounded-xl border bg-white p-6 shadow-sm disabled:opacity-70"
        >
        <div
          id="settings-panel-header"
          role="tabpanel"
          aria-labelledby="settings-tab-header"
          tabIndex={0}
          hidden={activeTab !== "header"}
        >
          {activeTab === "header" && (
            <HeaderSettingsPanel
              formData={formData}
              setFormOverrides={setFormOverrides}
              handleChange={handleChange}
              handleFileUpload={handleFileUpload}
              uploadingField={uploadingField}
            />
          )}
        </div>
        <div
          id="settings-panel-login"
          role="tabpanel"
          aria-labelledby="settings-tab-login"
          tabIndex={0}
          hidden={activeTab !== "login"}
        >
          <h2 className="mb-4 border-b pb-2 text-lg font-semibold">
            Login Panel Customization
          </h2>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Link
              href="/admin/login?preview=1"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-gray-50"
            >
              Preview Admin Login <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/login"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-gray-50"
            >
              Preview Customer Login <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
            <span className="text-xs text-gray-500">Previews show saved settings.</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-gray-700">
              Background image URL (leave blank for the default design)
              <input
                type="text"
                name="loginBgImageUrl"
                value={formData.loginBgImageUrl}
                onChange={handleChange}
                maxLength={2048}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </label>
            <label className="text-xs font-bold text-gray-700">
              Upload background image
              <input
                type="file"
                accept="image/*"
                disabled={uploadingField !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    void handleFileUpload(file, "loginBgImageUrl", (url) =>
                      setFormOverrides((previous) => ({
                        ...previous,
                        loginBgImageUrl: url,
                      })),
                    );
                  }
                }}
                className="mt-1 block w-full text-sm"
              />
              {uploadingField === "loginBgImageUrl" && "Uploading..."}
            </label>
            {formData.loginBgImageUrl && (
              <button
                type="button"
                onClick={() =>
                  setFormOverrides((previous) => ({
                    ...previous,
                    loginBgImageUrl: "",
                  }))
                }
                className="w-fit rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
              >
                Reset background to default
              </button>
            )}
            {(["loginGoldColor", "loginEmeraldColor"] as const).map((field) => (
              <div key={field}>
                <label htmlFor={`${field}-picker`} className="text-xs font-bold text-gray-700">
                  {field === "loginGoldColor" ? "Gold color" : "Emerald color"}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id={`${field}-picker`}
                    type="color"
                    name={field}
                    value={formData[field]}
                    onChange={handleChange}
                    className="h-10 w-12 rounded-lg border"
                  />
                  <input
                    aria-label={field === "loginGoldColor" ? "Gold color hex" : "Emerald color hex"}
                    type="text"
                    name={field}
                    required
                    pattern="#[0-9a-fA-F]{6}"
                    maxLength={7}
                    value={formData[field]}
                    onChange={handleChange}
                    className="w-full rounded-lg border p-2.5 font-mono text-sm"
                  />
                </div>
              </div>
            ))}
            <label className="text-xs font-bold text-gray-700">
              Card darkness ({formData.loginCardOpacity}%)
              <input
                type="range"
                name="loginCardOpacity"
                min={30}
                max={90}
                required
                value={formData.loginCardOpacity}
                onChange={handleChange}
                className="mt-1 block w-full rounded-lg border p-2.5 text-sm"
              />
            </label>
          </div>
          {loginTextGroups.map((group) => (
            <section key={group.title} className="mt-6">
              <h3 className="mb-3 text-sm font-bold">{group.title}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {group.fields.map(([field, label]) => (
                  <label key={field} className="text-xs font-bold text-gray-700">
                    {label}
                    <input
                      type="text"
                      name={field}
                      required
                      maxLength={500}
                      value={formData[field]}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-lg border p-2.5 text-sm"
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}
          <div className="mt-6 space-y-3">
            {([
              ["showAdminUserSwitchLink", "Show customer login link on admin login"],
              ["showUserAdminSwitchLink", "Show admin login link on customer login"],
              ["userRegistrationEnabled", "Allow customer registration"],
            ] as const).map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={formData[field]}
                  onChange={(event) =>
                    setFormOverrides((previous) => ({
                      ...previous,
                      [field]: event.target.checked,
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div
          id="settings-panel-brand"
          role="tabpanel"
          aria-labelledby="settings-tab-brand"
          tabIndex={0}
          hidden={activeTab !== "brand"}
        >
          <h2 className="mb-4 border-b pb-2 text-lg font-semibold">
            1. Branding &amp; Theme Color
          </h2>
          <div className="mb-5">
            <p className="text-sm font-medium text-gray-700">
              Quick color presets
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {colorPresets.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  disabled={user?.role !== "ADMIN"}
                  onClick={() =>
                    setFormOverrides((current) => ({
                      ...current,
                      primaryColor: preset.hex,
                    }))
                  }
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  <span
                    style={{ backgroundColor: preset.hex }}
                    className="h-4 w-4 rounded-full border"
                  />
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="storeName"
                className="block text-sm font-medium text-gray-700"
              >
                Store Name
              </label>
              <input
                id="storeName"
                type="text"
                name="storeName"
                value={formData.storeName}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="tagline"
                className="block text-sm font-medium text-gray-700"
              >
                Tagline
              </label>
              <input
                id="tagline"
                type="text"
                name="tagline"
                value={formData.tagline}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="logoUrl"
                className="block text-sm font-medium text-gray-700"
              >
                Logo URL
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="logoUrl"
                  type="text"
                  name="logoUrl"
                  value={formData.logoUrl}
                  onChange={handleChange}
                  className="w-full rounded-lg border p-2.5 text-sm"
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border bg-gray-50 px-3 text-xs font-semibold hover:bg-gray-100">
                  <Upload className="h-4 w-4" />
                  {uploadingField === "logo" ? "Uploading..." : "Upload"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/x-icon"
                    disabled={uploadingField !== null}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleFileUpload(file, "logo", (url) =>
                          setFormOverrides((current) => ({
                            ...current,
                            logoUrl: url,
                          })),
                        );
                      }
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <div>
              <label
                htmlFor="faviconUrl"
                className="block text-sm font-medium text-gray-700"
              >
                Favicon URL or path
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="faviconUrl"
                  type="text"
                  name="faviconUrl"
                  value={formData.faviconUrl}
                  onChange={handleChange}
                  className="w-full rounded-lg border p-2.5 text-sm"
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border bg-gray-50 px-3 text-xs font-semibold hover:bg-gray-100">
                  <Upload className="h-4 w-4" />
                  {uploadingField === "favicon" ? "Uploading..." : "Upload"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/x-icon"
                    disabled={uploadingField !== null}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleFileUpload(file, "favicon", (url) =>
                          setFormOverrides((current) => ({
                            ...current,
                            faviconUrl: url,
                          })),
                        );
                      }
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <div>
              <label
                htmlFor="primaryColor"
                className="block text-sm font-medium text-gray-700"
              >
                Primary Brand Color
              </label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  name="primaryColor"
                  aria-label="Choose primary brand color"
                  value={formData.primaryColor}
                  onChange={handleChange}
                  className="h-10 w-16 cursor-pointer rounded border"
                />
                <input
                  id="primaryColor"
                  type="text"
                  name="primaryColor"
                  value={formData.primaryColor}
                  onChange={handleChange}
                  className="w-full rounded-lg border p-2 text-sm uppercase"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="secondaryColor"
                className="block text-sm font-medium text-gray-700"
              >
                Secondary Brand Color
              </label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  name="secondaryColor"
                  aria-label="Choose secondary brand color"
                  value={formData.secondaryColor}
                  onChange={handleChange}
                  className="h-10 w-16 cursor-pointer rounded border"
                />
                <input
                  id="secondaryColor"
                  type="text"
                  name="secondaryColor"
                  value={formData.secondaryColor}
                  onChange={handleChange}
                  className="w-full rounded-lg border p-2 text-sm uppercase"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="fontFamily"
                className="block text-sm font-medium text-gray-700"
              >
                Font Family
              </label>
              <select
                id="fontFamily"
                name="fontFamily"
                value={formData.fontFamily}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              >
                {[
                  "Inter",
                  "Roboto",
                  "Open Sans",
                  "Lato",
                  "Montserrat",
                  "Poppins",
                  "Hind Siliguri",
                  "Arial",
                  "Georgia",
                  "System UI",
                  "Verdana",
                ].map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="announcementText"
                className="block text-sm font-medium text-gray-700"
              >
                Top Announcement Bar Text
              </label>
              <input
                id="announcementText"
                type="text"
                name="announcementText"
                value={formData.announcementText}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
          </div>
        </div>

        <div
          id="settings-panel-menu"
          role="tabpanel"
          aria-labelledby="settings-tab-menu"
          tabIndex={0}
          hidden={activeTab !== "menu"}
        >
          <div className="mb-4 flex items-center justify-between gap-3 border-b pb-2">
            <div>
              <h2 className="text-lg font-semibold">Header Navigation Menu</h2>
              <p className="text-sm text-gray-500">
                Add, rename, reorder, or remove links shown in the storefront
                navigation.
              </p>
            </div>
            <button
              type="button"
              onClick={addMenuItem}
              disabled={
                user?.role !== "ADMIN" || formData.menuItems.length >= 20
              }
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border bg-gray-50 px-3 py-1.5 text-xs font-semibold hover:bg-gray-100 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add link
            </button>
          </div>
          <div className="space-y-3">
            {formData.menuItems.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-lg border bg-gray-50 p-3 sm:grid-cols-[auto_1fr_2fr_auto]"
              >
                <span className="flex h-8 w-8 items-center justify-center self-end rounded-full bg-white text-xs font-bold text-gray-600">
                  {index + 1}
                </span>
                <label className="text-xs font-medium text-gray-600">
                  Label
                  <input
                    type="text"
                    value={item.label}
                    maxLength={60}
                    disabled={user?.role !== "ADMIN"}
                    onChange={(event) =>
                      updateMenuItem(index, "label", event.target.value)
                    }
                    aria-label={`Navigation link ${index + 1} label`}
                    className="mt-1 w-full rounded-lg border bg-white p-2 text-sm text-gray-900"
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Destination
                  <input
                    type="text"
                    value={item.href}
                    maxLength={2048}
                    disabled={user?.role !== "ADMIN"}
                    onChange={(event) =>
                      updateMenuItem(index, "href", event.target.value)
                    }
                    aria-label={`Navigation link ${index + 1} destination`}
                    className="mt-1 w-full rounded-lg border bg-white p-2 text-sm text-gray-900"
                  />
                </label>
                <div className="flex items-end gap-1">
                  <button
                    type="button"
                    disabled={user?.role !== "ADMIN" || index === 0}
                    onClick={() => moveMenuItem(index, "UP")}
                    aria-label={`Move navigation link ${index + 1} up`}
                    className="rounded-lg border bg-white p-2 hover:bg-gray-100 disabled:opacity-40"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={
                      user?.role !== "ADMIN" ||
                      index === formData.menuItems.length - 1
                    }
                    onClick={() => moveMenuItem(index, "DOWN")}
                    aria-label={`Move navigation link ${index + 1} down`}
                    className="rounded-lg border bg-white p-2 hover:bg-gray-100 disabled:opacity-40"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={user?.role !== "ADMIN"}
                    onClick={() => removeMenuItem(index)}
                    aria-label={`Remove navigation link ${index + 1}`}
                    className="rounded-lg border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {formData.menuItems.length === 0 && (
              <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
                No navigation links. Add a link to show the storefront menu.
              </p>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Use a local path such as /products or an HTTP(S) URL. Up to 20 links.
          </p>
        </div>

        <div
          id="settings-panel-hero"
          role="tabpanel"
          aria-labelledby="settings-tab-hero"
          tabIndex={0}
          hidden={activeTab !== "hero"}
        >
          <h2 className="mb-4 border-b pb-2 text-lg font-semibold">
            2. Homepage Hero Banner
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="heroTitle"
                className="block text-sm font-medium text-gray-700"
              >
                Hero Title
              </label>
              <input
                id="heroTitle"
                type="text"
                name="heroTitle"
                value={formData.heroTitle}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="heroSubtitle"
                className="block text-sm font-medium text-gray-700"
              >
                Hero Subtitle
              </label>
              <textarea
                id="heroSubtitle"
                name="heroSubtitle"
                rows={2}
                value={formData.heroSubtitle}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="heroButtonText"
                className="block text-sm font-medium text-gray-700"
              >
                Button Text
              </label>
              <input
                id="heroButtonText"
                type="text"
                name="heroButtonText"
                value={formData.heroButtonText}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="heroImage"
                className="block text-sm font-medium text-gray-700"
              >
                Banner Image URL
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="heroImage"
                  type="text"
                  name="heroImage"
                  value={formData.heroImage}
                  onChange={handleChange}
                  className="w-full rounded-lg border p-2.5 text-sm"
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border bg-gray-50 px-3 text-xs font-semibold hover:bg-gray-100">
                  <Upload className="h-4 w-4" />
                  {uploadingField === "hero" ? "Uploading..." : "Upload"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/x-icon"
                    disabled={uploadingField !== null}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleFileUpload(file, "hero", (url) =>
                          setFormOverrides((current) => ({
                            ...current,
                            heroImage: url,
                          })),
                        );
                      }
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <div>
              <label
                htmlFor="heroButtonLink"
                className="block text-sm font-medium text-gray-700"
              >
                Button Destination
              </label>
              <input
                id="heroButtonLink"
                type="text"
                name="heroButtonLink"
                value={formData.heroButtonLink}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
          </div>
        </div>

        <div
          id="settings-panel-flash-sale"
          role="tabpanel"
          aria-labelledby="settings-tab-flash-sale"
          tabIndex={0}
          hidden={activeTab !== "flash-sale"}
        >
          <h2 className="mb-2 border-b pb-2 text-lg font-semibold">
            Flash Sale Countdown
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            The storefront shows flash-sale products until this time. Clear the
            field to hide the countdown and sale section.
          </p>
          <label
            htmlFor="flashSaleEndsAt"
            className="block text-sm font-medium text-gray-700"
          >
            Sale ends at
          </label>
          <input
            id="flashSaleEndsAt"
            type="datetime-local"
            disabled={user?.role !== "ADMIN"}
            value={toLocalDateTime(formData.flashSaleEndsAt)}
            onChange={(event) =>
              setFormOverrides((previous) => ({
                ...previous,
                flashSaleEndsAt: event.target.value
                  ? new Date(event.target.value).toISOString()
                  : null,
              }))
            }
            className="mt-1 w-full max-w-sm rounded-lg border p-2.5 text-sm disabled:bg-gray-100"
          />
        </div>

        <div
          id="settings-panel-delivery"
          role="tabpanel"
          aria-labelledby="settings-tab-delivery"
          tabIndex={0}
          hidden={activeTab !== "delivery"}
        >
          <h2 className="mb-4 border-b pb-2 text-lg font-semibold">
            3. Delivery &amp; Contact Info
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="deliveryChargeInside"
                className="block text-sm font-medium text-gray-700"
              >
                Inside Dhaka Delivery (৳)
              </label>
              <input
                id="deliveryChargeInside"
                type="number"
                min="0"
                name="deliveryChargeInside"
                value={formData.deliveryChargeInside}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="deliveryChargeOutside"
                className="block text-sm font-medium text-gray-700"
              >
                Outside Dhaka Delivery (৳)
              </label>
              <input
                id="deliveryChargeOutside"
                type="number"
                min="0"
                name="deliveryChargeOutside"
                value={formData.deliveryChargeOutside}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="contactPhone"
                className="block text-sm font-medium text-gray-700"
              >
                Support Phone
              </label>
              <input
                id="contactPhone"
                type="tel"
                name="contactPhone"
                value={formData.contactPhone}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="contactEmail"
                className="block text-sm font-medium text-gray-700"
              >
                Support Email
              </label>
              <input
                id="contactEmail"
                type="email"
                name="contactEmail"
                value={formData.contactEmail}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
            <div className="sm:col-span-3">
              <label
                htmlFor="contactAddress"
                className="block text-sm font-medium text-gray-700"
              >
                Store Address
              </label>
              <input
                id="contactAddress"
                type="text"
                name="contactAddress"
                value={formData.contactAddress}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
          </div>
        </div>

        <div
          id="settings-panel-footer"
          role="tabpanel"
          aria-labelledby="settings-tab-footer"
          tabIndex={0}
          hidden={activeTab !== "footer"}
        >
          <h2 className="mb-4 border-b pb-2 text-lg font-semibold">
            4. Footer &amp; Social Links
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="footerText"
                className="block text-sm font-medium text-gray-700"
              >
                Footer Text
              </label>
              <textarea
                id="footerText"
                name="footerText"
                rows={2}
                value={formData.footerText}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
            {(
              [
                ["facebookUrl", "Facebook URL"],
                ["instagramUrl", "Instagram URL"],
                ["youtubeUrl", "YouTube URL"],
              ] as const
            ).map(([name, label]) => (
              <div key={name}>
                <label
                  htmlFor={name}
                  className="block text-sm font-medium text-gray-700"
                >
                  {label}
                </label>
                <input
                  id={name}
                  type="url"
                  name={name}
                  value={formData[name]}
                  onChange={handleChange}
                  className="mt-1 w-full rounded-lg border p-2.5 text-sm"
                />
              </div>
            ))}
            <div>
              <label
                htmlFor="whatsappNumber"
                className="block text-sm font-medium text-gray-700"
              >
                WhatsApp Number
              </label>
              <input
                id="whatsappNumber"
                type="tel"
                name="whatsappNumber"
                value={formData.whatsappNumber}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="messengerUsername"
                className="block text-sm font-medium text-gray-700"
              >
                Messenger Page username or numeric ID
              </label>
              <input
                id="messengerUsername"
                type="text"
                name="messengerUsername"
                value={formData.messengerUsername}
                onChange={handleChange}
                placeholder="e.g., alifstorebd"
                className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Used to create your Messenger chat link: m.me/your-page
              </p>
            </div>
          </div>
        </div>
        </fieldset>

        <section
          id="settings-panel-banners"
          role="tabpanel"
          aria-labelledby="settings-tab-banners"
          tabIndex={0}
          hidden={activeTab !== "banners"}
          className="rounded-xl border bg-white p-6 shadow-sm"
        >
          <fieldset
            disabled={isSaving || uploadingField !== null}
            className="w-full border-0 p-0"
          >
          <div className="mb-4 flex items-center justify-between border-b pb-2">
            <h2 className="text-lg font-semibold">5. Homepage Slider Banners</h2>
            <button
              type="button"
              onClick={addBanner}
              className="flex items-center gap-1 rounded-lg border bg-gray-50 px-3 py-1.5 text-xs font-semibold hover:bg-gray-100"
            >
              <Plus className="h-4 w-4" /> Add Banner
            </button>
          </div>

          {bannerList.length === 0 ? (
            <p className="text-sm text-gray-500">
              No banners yet. Add a banner to create a homepage slide.
            </p>
          ) : (
            <div className="space-y-4">
              {bannerList.map((banner, index) => (
                <div
                  key={banner.id ?? `new-banner-${index}`}
                  className="grid grid-cols-1 gap-3 rounded-lg border bg-gray-50 p-4 sm:grid-cols-2"
                >
                  <label className="text-xs font-semibold text-gray-700">
                    Headline
                    <input
                      type="text"
                      value={banner.title}
                      onChange={(event) =>
                        updateBanner(index, "title", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border bg-white p-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold text-gray-700">
                    Subtitle
                    <input
                      type="text"
                      value={banner.subtitle ?? ""}
                      onChange={(event) =>
                        updateBanner(index, "subtitle", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border bg-white p-2 text-sm"
                    />
                  </label>
                  <div className="text-xs font-semibold text-gray-700">
                    <label htmlFor={`banner-image-${index}`}>
                      Image URL
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id={`banner-image-${index}`}
                        type="text"
                        value={banner.imageUrl}
                        onChange={(event) =>
                          updateBanner(index, "imageUrl", event.target.value)
                        }
                        className="w-full rounded-lg border bg-white p-2 text-sm"
                      />
                      <label className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border bg-white px-3 text-xs font-semibold hover:bg-gray-100">
                        <Upload className="h-4 w-4" />
                        {uploadingField === `banner-${index}` ? "..." : "Upload"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/x-icon"
                          disabled={uploadingField !== null}
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleFileUpload(
                                file,
                                `banner-${index}`,
                                (url) => updateBanner(index, "imageUrl", url),
                              );
                            }
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex-1 text-xs font-semibold text-gray-700">
                      Button Text
                      <input
                        type="text"
                        value={banner.buttonText}
                        onChange={(event) =>
                          updateBanner(index, "buttonText", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border bg-white p-2 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeBanner(index)}
                      aria-label={`Remove banner ${index + 1}`}
                      className="rounded-lg border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <label className="text-xs font-semibold text-gray-700">
                    Button Link
                    <input
                      type="text"
                      value={banner.buttonLink}
                      onChange={(event) =>
                        updateBanner(index, "buttonLink", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border bg-white p-2 text-sm"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={banner.isActive}
                      onChange={(event) =>
                        updateBanner(index, "isActive", event.target.checked)
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Show this banner on the storefront
                  </label>
                </div>
              ))}
            </div>
          )}
          </fieldset>
        </section>

        <button
          type="submit"
          disabled={isSaving || uploadingField !== null}
          style={{ backgroundColor: formData.primaryColor }}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-white shadow hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save All Changes & Publish Live"}
        </button>
      </form>
    </div>
  );
}
