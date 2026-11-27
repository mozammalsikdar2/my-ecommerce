"use client";

import Image from "next/image";
import { useEffect, useState, type MouseEvent } from "react";
import { Maximize2, X, ZoomIn } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

interface ImageZoomViewerProps {
  images: string[];
  alt: string;
}

const fallbackImage =
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80";

export default function ImageZoomViewer({
  images,
  alt,
}: ImageZoomViewerProps) {
  const { settings } = useSettings();
  const gallery = images.filter((image) => image.trim().length > 0);
  const imageSources = gallery.length > 0 ? gallery : [fallbackImage];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isHoverZoomed, setIsHoverZoomed] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxZoomed, setLightboxZoomed] = useState(false);

  const activeSrc = imageSources[selectedIndex] ?? imageSources[0];

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen]);

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setZoomOrigin({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  };

  return (
    <div className="space-y-3">
      <div
        onMouseEnter={() => setIsHoverZoomed(true)}
        onMouseLeave={() => setIsHoverZoomed(false)}
        onMouseMove={handleMouseMove}
        className="relative h-[360px] w-full cursor-zoom-in overflow-hidden rounded-2xl border bg-gray-100 sm:h-[440px]"
      >
        <Image
          src={activeSrc}
          alt={alt}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 50vw"
          style={{
            transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
            transform: isHoverZoomed ? "scale(2.2)" : "scale(1)",
          }}
          className="object-cover transition-transform duration-150 ease-out"
        />

        {!isHoverZoomed && (
          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            <ZoomIn className="h-3.5 w-3.5" />
            <span>Hover to zoom</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setLightboxZoomed(false);
            setLightboxOpen(true);
          }}
          aria-label="Open full-screen image viewer"
          className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-gray-800 shadow hover:bg-white"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {imageSources.length > 1 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {imageSources.map((image, index) => {
            const active = index === selectedIndex;
            return (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                aria-label={`View image ${index + 1}`}
                aria-pressed={active}
                style={active ? { borderColor: settings.primaryColor } : {}}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                  active
                    ? "shadow-sm"
                    : "border-gray-200 opacity-70 hover:opacity-100"
                }`}
              >
                <Image
                  src={image}
                  alt=""
                  fill
                  unoptimized
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} image viewer`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            aria-label="Close image viewer"
            onClick={() => setLightboxOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default"
          />
          <div className="relative z-10 mb-3 flex w-full max-w-4xl items-center justify-between text-white">
            <span className="text-xs text-gray-300">
              Click image to {lightboxZoomed ? "zoom out" : "zoom in (1.75x)"}
            </span>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close image viewer"
              className="rounded-full bg-white/15 p-2 hover:bg-white/25"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative z-10 max-h-[80vh] w-full max-w-4xl overflow-auto rounded-xl">
            <div className="relative mx-auto h-[78vh] w-full">
              <Image
                src={activeSrc}
                alt={alt}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 1024px"
                onClick={() => setLightboxZoomed((zoomed) => !zoomed)}
                style={{
                  transform: lightboxZoomed ? "scale(1.75)" : "scale(1)",
                  transformOrigin: "center center",
                }}
                className={`object-contain transition-transform duration-200 ${
                  lightboxZoomed ? "cursor-zoom-out" : "cursor-zoom-in"
                }`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
