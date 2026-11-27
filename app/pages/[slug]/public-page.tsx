"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSettings } from "@/context/SettingsContext";
import { sanitizePageHtmlInBrowser } from "@/lib/page-html-client";
import { ArrowLeft, Mail, MapPin, MessageCircle, Phone } from "lucide-react";

interface PolicyPageData {
  id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPolicyPageData(value: unknown): value is PolicyPageData {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.content === "string" &&
    typeof value.isPublished === "boolean" &&
    typeof value.updatedAt === "string"
  );
}

export default function PublicPage({ slug }: { slug: string }) {
  const { settings } = useSettings();
  const [page, setPage] = useState<PolicyPageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      setIsLoading(true);
      setPage(null);
      setError(null);
      try {
        const response = await fetch(
          `/api/pages/${encodeURIComponent(slug)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          if (response.status === 404) throw new Error("This page is unavailable.");
          throw new Error(`Unable to load this page (${response.status}).`);
        }
        const data: unknown = await response.json();
        if (!isPolicyPageData(data)) {
          throw new Error("Page API returned invalid data.");
        }
        if (active) {
          setPage({
            ...data,
            content: sanitizePageHtmlInBrowser(data.content),
          });
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load this page.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadPage();
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-4xl">
        {isLoading ? (
          <p className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
            Loading page...
          </p>
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl border border-gray-200 bg-white p-8 text-center"
          >
            <h1 className="text-xl font-bold text-gray-900">Page Not Found</h1>
            <p className="mt-2 text-sm text-gray-600">{error}</p>
            <Link
              href="/"
              style={{ backgroundColor: settings.primaryColor }}
              className="mt-4 inline-block rounded-xl px-5 py-2.5 text-xs font-bold text-white"
            >
              Return Home
            </Link>
          </div>
        ) : page ? (
          <>
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-black"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Storefront</span>
            </Link>
            <article className="rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
              <header className="border-b pb-5">
                <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
                  {page.title}
                </h1>
                {!page.isPublished && (
                  <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                    Draft preview
                  </span>
                )}
                <p className="mt-1.5 text-xs text-gray-400">
                  Last updated:{" "}
                  {new Date(page.updatedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </header>
              <div
                className="mt-6 text-sm leading-relaxed text-gray-700 [&_a]:font-semibold [&_a]:text-teal-700 [&_a]:underline [&_h2]:mb-2.5 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:text-gray-900 [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-gray-900 [&_li]:mb-1.5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3.5 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: page.content }}
              />
              {slug === "about-contact" && (
                <div className="mt-8 rounded-2xl border bg-gray-50 p-6">
                  <h2 className="text-base font-extrabold text-gray-900">
                    Direct Customer Support &amp; Store Location
                  </h2>
                  <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                    <div className="flex items-start gap-2.5">
                      <Phone
                        style={{ color: settings.primaryColor }}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <div>
                        <div className="text-xs font-bold text-gray-400">Phone</div>
                        <div className="font-semibold text-gray-800">
                          {settings.contactPhone}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Mail
                        style={{ color: settings.primaryColor }}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <div>
                        <div className="text-xs font-bold text-gray-400">Email</div>
                        <div className="font-semibold text-gray-800">
                          {settings.contactEmail}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <MapPin
                        style={{ color: settings.primaryColor }}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <div>
                        <div className="text-xs font-bold text-gray-400">Address</div>
                        <div className="font-semibold text-gray-800">
                          {settings.contactAddress}
                        </div>
                      </div>
                    </div>
                  </div>
                  {settings.whatsappNumber && (
                    <a
                      href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ backgroundColor: settings.primaryColor }}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow hover:opacity-90"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Chat With Us on WhatsApp</span>
                    </a>
                  )}
                </div>
              )}
            </article>
          </>
        ) : null}
      </div>
    </main>
  );
}
