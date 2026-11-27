"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Aperture,
  Camera,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

interface MatchedProduct {
  id: string;
  name: string;
  price: number;
  discountPrice: number | null;
  image: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMatchedProduct(value: unknown): value is MatchedProduct {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.price === "number" &&
    (typeof value.discountPrice === "number" || value.discountPrice === null) &&
    typeof value.image === "string"
  );
}

export default function VisualSearchModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const { settings } = useSettings();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [detectedLabel, setDetectedLabel] = useState("");
  const [results, setResults] = useState<MatchedProduct[]>([]);
  const [error, setError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!stream || !video) return;
    video.srcObject = stream;
    return () => {
      stream.getTracks().forEach((track) => track.stop());
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  const stopWebcam = () => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  };

  const runVisualSearch = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file to search.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError("Image size must be 6 MB or smaller.");
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setError("");
    setSearching(true);
    setResults([]);
    setDetectedLabel("");
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/products/visual-search", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Could not process this photo.";
        throw new Error(message);
      }
      if (
        !isRecord(data) ||
        !Array.isArray(data.products) ||
        !data.products.every(isMatchedProduct)
      ) {
        throw new Error("The visual search returned an invalid response.");
      }

      setDetectedLabel(
        typeof data.detectedLabel === "string"
          ? data.detectedLabel
          : "Matching Products",
      );
      setResults(data.products);
    } catch (caughtError) {
      if (controller.signal.aborted) return;
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Network error while searching by photo.",
      );
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    stopWebcam();
    void runVisualSearch(file);
  };

  const handleStartLiveCamera = async () => {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Live camera is unavailable in this browser.");
      }
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (!mountedRef.current) {
        cameraStream.getTracks().forEach((track) => track.stop());
        return;
      }
      setPreviewUrl(null);
      setResults([]);
      setDetectedLabel("");
      setStream(cameraStream);
    } catch {
      setError("Camera permission denied or unavailable. Upload a photo instead.");
    }
  };

  const handleCaptureSnapshot = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("The camera is still starting. Try capturing again in a moment.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Unable to capture an image from this camera.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopWebcam();
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Unable to create a photo from this camera.");
          return;
        }
        void runVisualSearch(
          new File([blob], "camera-capture.jpg", { type: "image/jpeg" }),
        );
      },
      "image/jpeg",
      0.9,
    );
  };

  const handleReset = () => {
    requestRef.current?.abort();
    stopWebcam();
    setPreviewUrl(null);
    setResults([]);
    setDetectedLabel("");
    setError("");
    setSearching(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="visual-search-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-center justify-between border-b pb-3.5">
          <div className="flex items-center gap-2">
            <Camera
              aria-hidden="true"
              style={{ color: settings.primaryColor }}
              className="h-5 w-5"
            />
            <h2
              id="visual-search-title"
              className="text-lg font-extrabold text-gray-900"
            >
              Search Products by Photo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close visual search"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          Take a photo or upload an image to find matching products in{" "}
          {settings.storeName}. If image search is enabled, your photo may be
          analyzed by the store&apos;s configured search provider.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"
          >
            {error}
          </p>
        )}

        {!stream && !previewUrl && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label
              style={{ backgroundColor: settings.primaryColor }}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center text-white shadow-md transition hover:opacity-95"
            >
              <Camera aria-hidden="true" className="h-8 w-8" />
              <span className="text-sm font-extrabold">
                Take Photo (Mobile)
              </span>
              <span className="text-[11px] text-white/85">
                Opens your device camera
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            <div className="flex flex-col gap-2.5">
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-xs font-bold text-gray-700 transition hover:border-gray-400 hover:bg-gray-100">
                <Upload aria-hidden="true" className="h-4 w-4" />
                <span>Upload Photo from Gallery</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
              <button
                type="button"
                onClick={handleStartLiveCamera}
                className="flex items-center justify-center gap-2 rounded-xl border bg-white py-3 text-xs font-bold text-gray-800 shadow-sm hover:bg-gray-50"
              >
                <Aperture aria-hidden="true" className="h-4 w-4" />
                <span>Use Live Camera</span>
              </button>
            </div>
          </div>
        )}

        {stream && (
          <div className="mt-5 space-y-3">
            <div className="overflow-hidden rounded-2xl border bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                aria-label="Live camera preview"
                className="max-h-72 w-full object-cover"
              />
            </div>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={handleCaptureSnapshot}
                style={{ backgroundColor: settings.primaryColor }}
                className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-bold text-white shadow-lg hover:opacity-90"
              >
                <Aperture aria-hidden="true" className="h-4 w-4" />
                <span>Capture &amp; Search</span>
              </button>
              <button
                type="button"
                onClick={stopWebcam}
                className="rounded-xl border px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {previewUrl && (
          <div className="mt-5 flex flex-col items-center gap-4 rounded-2xl border bg-gray-50 p-4 sm:flex-row">
            <Image
              src={previewUrl}
              alt="Photo selected for visual search"
              width={96}
              height={96}
              unoptimized
              className="h-24 w-24 shrink-0 rounded-xl border object-cover"
            />
            <div className="flex-1 text-center sm:text-left">
              {searching ? (
                <div className="flex items-center justify-center gap-2 text-sm font-bold text-gray-700 sm:justify-start">
                  <Loader2
                    aria-hidden="true"
                    style={{ color: settings.primaryColor }}
                    className="h-5 w-5 animate-spin"
                  />
                  <span>Scanning image and finding matching products...</span>
                </div>
              ) : (
                <>
                  {detectedLabel && (
                    <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-500 sm:justify-start">
                      <Sparkles
                        aria-hidden="true"
                        style={{ color: settings.primaryColor }}
                        className="h-4 w-4"
                      />
                      <span>Detected: {detectedLabel}</span>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-600">
                    Found {results.length} matching item(s) in our catalog.
                  </p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="flex shrink-0 items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              <span>New Photo</span>
            </button>
          </div>
        )}

        {!searching && results.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-gray-500">
              Matching Products
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {results.map((product) => {
                const price = product.discountPrice ?? product.price;
                return (
                  <Link
                    key={product.id}
                    href={`/products/${product.id}`}
                    onClick={onClose}
                    className="group overflow-hidden rounded-xl border bg-white transition hover:shadow-md"
                  >
                    <Image
                      src={product.image}
                      alt={product.name}
                      width={320}
                      height={224}
                      unoptimized
                      className="h-28 w-full object-cover transition group-hover:scale-105"
                    />
                    <div className="p-2.5">
                      <div className="line-clamp-1 text-xs font-bold text-gray-900">
                        {product.name}
                      </div>
                      <div
                        style={{ color: settings.primaryColor }}
                        className="mt-1 text-xs font-extrabold"
                      >
                        ৳{price.toLocaleString()}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
