"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

export interface BannerSlide {
  id: string;
  title: string;
  subtitle?: string | null;
  buttonText: string;
  buttonLink: string;
  imageUrl: string;
  isActive: boolean;
}

export default function HeroSlider({
  banners,
}: {
  banners: BannerSlide[];
}) {
  const { settings } = useSettings();
  const [currentIndex, setCurrentIndex] = useState(0);
  const activeBanners = banners.filter((banner) => banner.isActive);
  const slides: BannerSlide[] =
    activeBanners.length > 0
      ? activeBanners
      : [
          {
            id: "default-hero",
            title: settings.heroTitle,
            subtitle: settings.heroSubtitle,
            buttonText: settings.heroButtonText,
            buttonLink: settings.heroButtonLink || "/#products",
            imageUrl: settings.heroImage,
            isActive: true,
          },
        ];
  const activeIndex = currentIndex % slides.length;
  const activeSlide = slides[activeIndex];

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentIndex((previous) => (previous + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const prevSlide = () =>
    setCurrentIndex((previous) => (previous - 1 + slides.length) % slides.length);
  const nextSlide = () =>
    setCurrentIndex((previous) => (previous + 1) % slides.length);
  const isExternalLink = /^https?:\/\//i.test(activeSlide.buttonLink);
  const buttonClass =
    "rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90";

  return (
    <section
      aria-label="Featured promotions"
      className="relative isolate overflow-hidden bg-gray-900 text-white"
    >
      <div className="relative h-[380px] sm:h-[460px]">
        <Image
          key={activeSlide.imageUrl}
          src={activeSlide.imageUrl}
          alt=""
          fill
          priority
          unoptimized
          sizes="100vw"
          className="object-cover opacity-45 transition-all duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-transparent">
          <div className="mx-auto flex h-full max-w-7xl flex-col justify-center px-6">
            <span
              style={{ backgroundColor: settings.primaryColor }}
              className="mb-3 w-fit rounded-full px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow"
            >
              {settings.tagline}
            </span>
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-5xl">
              {activeSlide.title}
            </h1>
            {activeSlide.subtitle && (
              <p className="mt-3 max-w-xl text-sm text-gray-200 sm:text-base">
                {activeSlide.subtitle}
              </p>
            )}
            <div className="mt-6 flex items-center gap-3">
              {isExternalLink ? (
                <a
                  href={activeSlide.buttonLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ backgroundColor: settings.primaryColor }}
                  className={buttonClass}
                >
                  {activeSlide.buttonText || "Shop Now"}
                </a>
              ) : (
                <Link
                  href={activeSlide.buttonLink || "/#products"}
                  style={{ backgroundColor: settings.primaryColor }}
                  className={buttonClass}
                >
                  {activeSlide.buttonText || "Shop Now"}
                </Link>
              )}
              <Link
                href="/track-order"
                className="rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                Track Order
              </Link>
            </div>
          </div>
        </div>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous banner"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition hover:bg-black/75"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next banner"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition hover:bg-black/75"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`Show banner ${index + 1}`}
                  aria-current={index === activeIndex}
                  onClick={() => setCurrentIndex(index)}
                  style={
                    index === activeIndex
                      ? { backgroundColor: settings.primaryColor }
                      : undefined
                  }
                  className={`h-2.5 rounded-full transition-all ${
                    index === activeIndex
                      ? "w-7"
                      : "w-2.5 bg-white/50 hover:bg-white"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
