"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type PixelQueue = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: (...args: unknown[]) => void;
  loaded: boolean;
  version: string;
};

function initializePixel(pixelId: string) {
  if (typeof window.fbq !== "function") {
    const fbq: PixelQueue = Object.assign(
      (...args: unknown[]) => {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue.push(args);
      },
      {
        queue: [] as unknown[][],
        push: (...args: unknown[]) => fbq(...args),
        loaded: true,
        version: "2.0",
      },
    );
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
  }
  window.fbq("init", pixelId);
}

export default function MetaPixel() {
  const [pixelId, setPixelId] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const lastTrackedPath = useRef<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const controller = new AbortController();

    async function loadPixel() {
      try {
        const response = await fetch("/api/marketing/pixel", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Pixel settings request failed (${response.status})`);
        }
        const data: unknown = await response.json();
        if (
          typeof data !== "object" ||
          data === null ||
          !("enabled" in data) ||
          typeof data.enabled !== "boolean" ||
          !("pixelId" in data) ||
          !(data.pixelId === null || typeof data.pixelId === "string")
        ) {
          throw new Error("Pixel settings response is invalid");
        }
        if (!data.enabled) return;
        if (typeof data.pixelId !== "string" || !/^\d{1,50}$/.test(data.pixelId)) {
          throw new Error("Enabled Pixel ID is invalid");
        }
        if (controller.signal.aborted) return;
        initializePixel(data.pixelId);
        window.metaPixelReady = true;
        window.dispatchEvent(new Event("meta-pixel-ready"));
        setPixelId(data.pixelId);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Failed to initialize Meta Pixel:", error);
        }
      }
    }

    void loadPixel();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (
      !scriptReady ||
      !pixelId ||
      !pathname ||
      lastTrackedPath.current === pathname
    ) {
      return;
    }
    if (typeof window.fbq !== "function") {
      console.error("Meta Pixel is unavailable after the script loaded");
      return;
    }
    window.fbq("track", "PageView");
    lastTrackedPath.current = pathname;
  }, [pathname, pixelId, scriptReady]);

  if (!pixelId) return null;

  return (
    <Script
      id="meta-pixel-script"
      src="https://connect.facebook.net/en_US/fbevents.js"
      strategy="afterInteractive"
      onReady={() => setScriptReady(true)}
      onError={() => console.error("Failed to load the Meta Pixel script")}
    />
  );
}
