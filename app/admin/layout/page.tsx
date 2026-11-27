"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  EyeOff,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

interface HomepageSection {
  id: string;
  sectionKey: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  order: number;
  isVisible: boolean;
}

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  buttonText: string;
  buttonLink: string;
  imageUrl: string;
  order: number;
  isActive: boolean;
}

const initialBanner = {
  title: "",
  subtitle: "",
  buttonText: "Shop Now",
  buttonLink: "/",
  imageUrl: "",
};

async function getApiError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    // The response may not contain JSON.
  }
  return `Request failed (${response.status})`;
}

export default function LayoutBuilderPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [newBanner, setNewBanner] = useState(initialBanner);
  const [authState, setAuthState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [layoutResponse, bannerResponse] = await Promise.all([
        fetch("/api/layout", { cache: "no-store" }),
        fetch("/api/banners", { cache: "no-store" }),
      ]);
      if (!layoutResponse.ok) {
        throw new Error(await getApiError(layoutResponse));
      }
      if (!bannerResponse.ok) {
        throw new Error(await getApiError(bannerResponse));
      }

      const [layoutData, bannerData]: [unknown, unknown] = await Promise.all([
        layoutResponse.json(),
        bannerResponse.json(),
      ]);
      if (!Array.isArray(layoutData) || !Array.isArray(bannerData)) {
        throw new Error("The layout API returned invalid data");
      }
      setSections(layoutData as HomepageSection[]);
      setBanners(bannerData as Banner[]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load homepage layout",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/admin/me", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Unable to verify admin session");
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
          await fetchData();
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
  }, [fetchData, router]);

  const showMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  };

  const moveSection = (index: number, direction: "UP" | "DOWN") => {
    const targetIndex = direction === "UP" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const reordered = [...sections];
    [reordered[index], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[index],
    ];
    setSections(
      reordered.map((section, position) => ({
        ...section,
        order: position + 1,
      })),
    );
  };

  const updateSection = (
    index: number,
    updates: Partial<HomepageSection>,
  ) => {
    setSections((current) =>
      current.map((section, position) =>
        position === index ? { ...section, ...updates } : section,
      ),
    );
  };

  const saveLayout = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/layout", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sections),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const updated: unknown = await response.json();
      if (!Array.isArray(updated)) {
        throw new Error("The layout API returned invalid data");
      }
      setSections(updated as HomepageSection[]);
      showMessage("Homepage layout saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save homepage layout",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const addBanner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/banners", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBanner),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const banner: Banner = await response.json();
      setBanners((current) => [...current, banner].sort((a, b) => a.order - b.order));
      setNewBanner(initialBanner);
      showMessage("New banner added.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to add banner",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const toggleBanner = async (banner: Banner) => {
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/banners/${banner.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !banner.isActive }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const updated: Banner = await response.json();
      setBanners((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update banner",
      );
    }
  };

  const deleteBanner = async (id: string) => {
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/banners/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await getApiError(response));
      setBanners((current) => current.filter((banner) => banner.id !== id));
      showMessage("Banner deleted.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete banner",
      );
    }
  };

  if (authState === "loading") {
    return <div className="mx-auto max-w-5xl px-4 py-10">Checking admin session...</div>;
  }
  if (authState === "error") {
    return (
      <div role="alert" className="mx-auto max-w-5xl px-4 py-10 text-red-700">
        {authError}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Live Storefront
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Homepage Layout &amp; Banner Manager
          </h1>
          <p className="text-sm text-gray-500">
            Reorder homepage sections, control visibility, and manage slider banners.
          </p>
        </div>
        <Link
          href="/admin/settings"
          className="rounded-lg border px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
        >
          Go to Site Settings
        </Link>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-lg bg-red-100 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      )}
      {message && (
        <div role="status" className="rounded-lg bg-green-100 p-4 text-sm font-medium text-green-800">
          {message}
        </div>
      )}

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b pb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              1. Homepage Section Sequence
            </h2>
            <p className="text-xs text-gray-500">
              Use the arrows to change section order and the eye control to toggle visibility.
            </p>
          </div>
          <button
            type="button"
            onClick={saveLayout}
            disabled={isLoading || isSaving || sections.length === 0}
            style={{ backgroundColor: settings.primaryColor }}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow hover:opacity-90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Layout"}
          </button>
        </div>

        {isLoading ? (
          <p className="py-6 text-sm text-gray-500">Loading homepage layout...</p>
        ) : sections.length === 0 ? (
          <p className="py-6 text-sm text-gray-500">
            No homepage sections are available.
          </p>
        ) : (
          <div className="space-y-4">
            {sections.map((section, index) => (
              <div
                key={section.id}
                className={`rounded-lg border p-4 transition ${
                  section.isVisible ? "bg-white" : "bg-gray-100 opacity-60"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      style={{ backgroundColor: settings.primaryColor }}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                    >
                      {index + 1}
                    </span>
                    <div>
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
                        {section.sectionKey}
                      </span>
                      <h3 className="mt-1 font-bold text-gray-800">
                        {section.title}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveSection(index, "UP")}
                      aria-label={`Move ${section.title} up`}
                      className="rounded border p-2 hover:bg-gray-100 disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === sections.length - 1}
                      onClick={() => moveSection(index, "DOWN")}
                      aria-label={`Move ${section.title} down`}
                      className="rounded border p-2 hover:bg-gray-100 disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSection(index, { isVisible: !section.isVisible })
                      }
                      aria-label={
                        section.isVisible
                          ? `Hide ${section.title}`
                          : `Show ${section.title}`
                      }
                      className="rounded border p-2 hover:bg-gray-100"
                    >
                      {section.isVisible ? (
                        <Eye className="h-4 w-4 text-green-600" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-red-500" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-600">
                    Section Heading
                    <input
                      type="text"
                      value={section.title}
                      onChange={(event) =>
                        updateSection(index, { title: event.target.value })
                      }
                      className="mt-1 w-full rounded border p-2 text-sm text-gray-900"
                    />
                  </label>
                  <label className="text-xs font-medium text-gray-600">
                    Subtitle
                    <input
                      type="text"
                      value={section.subtitle ?? ""}
                      onChange={(event) =>
                        updateSection(index, { subtitle: event.target.value })
                      }
                      className="mt-1 w-full rounded border p-2 text-sm text-gray-900"
                    />
                  </label>
                  {section.sectionKey === "OFFER_BANNER" && (
                    <>
                      <label className="text-xs font-medium text-gray-600">
                        Offer Banner Image URL
                        <input
                          type="url"
                          value={section.imageUrl ?? ""}
                          onChange={(event) =>
                            updateSection(index, { imageUrl: event.target.value })
                          }
                          className="mt-1 w-full rounded border p-2 text-sm text-gray-900"
                        />
                      </label>
                      <label className="text-xs font-medium text-gray-600">
                        Offer Target Link
                        <input
                          type="text"
                          value={section.linkUrl ?? ""}
                          onChange={(event) =>
                            updateSection(index, { linkUrl: event.target.value })
                          }
                          className="mt-1 w-full rounded border p-2 text-sm text-gray-900"
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 border-b pb-2 text-lg font-bold text-gray-800">
          2. Hero Slider Banners
        </h2>

        <form
          onSubmit={addBanner}
          className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input
            type="text"
            aria-label="Banner title"
            placeholder="Slide Headline"
            value={newBanner.title}
            onChange={(event) =>
              setNewBanner((current) => ({ ...current, title: event.target.value }))
            }
            className="rounded-lg border p-2.5 text-sm"
            required
          />
          <input
            type="text"
            aria-label="Banner subtitle"
            placeholder="Slide Subtitle"
            value={newBanner.subtitle}
            onChange={(event) =>
              setNewBanner((current) => ({
                ...current,
                subtitle: event.target.value,
              }))
            }
            className="rounded-lg border p-2.5 text-sm"
          />
          <input
            type="url"
            aria-label="Banner image URL"
            placeholder="Banner Image URL (https://...)"
            value={newBanner.imageUrl}
            onChange={(event) =>
              setNewBanner((current) => ({
                ...current,
                imageUrl: event.target.value,
              }))
            }
            className="rounded-lg border p-2.5 text-sm"
            required
          />
          <input
            type="text"
            aria-label="Banner button link"
            placeholder="Button Link (e.g. / or https://...)"
            value={newBanner.buttonLink}
            onChange={(event) =>
              setNewBanner((current) => ({
                ...current,
                buttonLink: event.target.value,
              }))
            }
            className="rounded-lg border p-2.5 text-sm"
          />
          <div className="flex gap-2 sm:col-span-2">
            <input
              type="text"
              aria-label="Banner button text"
              placeholder="Button Text"
              value={newBanner.buttonText}
              onChange={(event) =>
                setNewBanner((current) => ({
                  ...current,
                  buttonText: event.target.value,
                }))
              }
              className="w-1/2 rounded-lg border p-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={isSaving}
              style={{ backgroundColor: settings.primaryColor }}
              className="flex w-1/2 items-center justify-center gap-1 rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              <Plus className="h-4 w-4" /> Add Slide
            </button>
          </div>
        </form>

        {isLoading ? (
          <p className="py-6 text-sm text-gray-500">Loading banners...</p>
        ) : banners.length === 0 ? (
          <p className="py-6 text-sm text-gray-500">No banners have been added.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {banners.map((banner) => (
              <div
                key={banner.id}
                className={`overflow-hidden rounded-lg border ${
                  banner.isActive ? "" : "opacity-60"
                }`}
              >
                <Image
                  src={banner.imageUrl}
                  alt={banner.title}
                  width={600}
                  height={240}
                  unoptimized
                  className="h-36 w-full object-cover"
                />
                <div className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <h3 className="font-bold text-gray-800">{banner.title}</h3>
                    <p className="text-xs text-gray-500">{banner.subtitle}</p>
                    <p className="text-xs text-gray-400">
                      {banner.isActive ? "Active" : "Hidden"} · Order {banner.order}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => void toggleBanner(banner)}
                      aria-label={
                        banner.isActive ? "Hide banner" : "Show banner"
                      }
                      className="rounded p-2 text-gray-600 hover:bg-gray-100"
                    >
                      {banner.isActive ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteBanner(banner.id)}
                      aria-label="Delete banner"
                      className="rounded p-2 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
