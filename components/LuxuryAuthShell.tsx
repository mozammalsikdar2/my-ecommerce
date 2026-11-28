"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { ArrowLeft, Shield } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { loginBackgroundStyle, loginCardStyle } from "@/lib/login-theme";

interface LuxuryAuthShellProps {
  backHref?: string;
  backText: string;
  badgeText: string;
  children: ReactNode;
}

export default function LuxuryAuthShell({
  backHref = "/",
  backText,
  badgeText,
  children,
}: LuxuryAuthShellProps) {
  const { settings } = useSettings();
  const id = useId();
  const goldEdge = `${id}-gold`;
  const emeraldGlass = `${id}-emerald`;
  const softGlow = `${id}-glow`;
  const gold = settings.loginGoldColor;
  const emerald = settings.loginEmeraldColor;

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#061014] px-4 py-10 text-white selection:bg-amber-400 selection:text-gray-950">
      {settings.loginBgImageUrl ? (
        <div
          style={loginBackgroundStyle(settings)}
          className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        />
      ) : (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            style={{
              background: `radial-gradient(circle at 50% 45%, ${emerald}44 0%, #071519 55%, #040b0e 100%)`,
            }}
            className="absolute inset-0"
          />
          <svg
            viewBox="0 0 1600 900"
            preserveAspectRatio="xMidYMid slice"
            className="relative h-full w-full opacity-95"
          >
            <defs>
              <linearGradient id={goldEdge} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={gold} stopOpacity="0.95" />
                <stop offset="50%" stopColor="#fff0b8" stopOpacity="0.85" />
                <stop offset="100%" stopColor={gold} stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id={emeraldGlass} x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={emerald} stopOpacity="0.55" />
                <stop offset="50%" stopColor="#1d9a78" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#07221e" stopOpacity="0.65" />
              </linearGradient>
              <filter id={softGlow} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              d="M -120,760 C 260,880 420,140 820,160 C 1180,180 1120,780 1680,620"
              fill="none"
              stroke={`url(#${emeraldGlass})`}
              strokeWidth="95"
              strokeLinecap="round"
            />
            <path
              d="M -120,715 C 260,835 420,95 820,115 C 1180,135 1120,735 1680,575"
              fill="none"
              stroke={`url(#${goldEdge})`}
              strokeWidth="4"
              filter={`url(#${softGlow})`}
            />
            <ellipse cx="800" cy="440" rx="390" ry="295" transform="rotate(-18 800 440)" fill="none" stroke={`url(#${emeraldGlass})`} strokeWidth="78" />
            <ellipse cx="800" cy="440" rx="428" ry="332" transform="rotate(-18 800 440)" fill="none" stroke={`url(#${goldEdge})`} strokeWidth="3.5" filter={`url(#${softGlow})`} />
            <ellipse cx="800" cy="440" rx="352" ry="258" transform="rotate(-18 800 440)" fill="none" stroke={`url(#${goldEdge})`} strokeWidth="2" opacity="0.7" />
            <path d="M 140,-80 C 480,260 360,760 880,780 C 1320,795 1280,220 1560,-60" fill="none" stroke={`url(#${emeraldGlass})`} strokeWidth="68" />
            <path d="M 108,-60 C 448,280 328,780 848,800 C 1288,815 1248,240 1528,-40" fill="none" stroke={`url(#${goldEdge})`} strokeWidth="3.5" filter={`url(#${softGlow})`} />
            {[
              [210, 640, 2.5], [245, 690, 1.8], [290, 610, 2.2],
              [340, 730, 3], [1290, 240, 2.4], [1350, 310, 1.8],
              [1410, 195, 2.8], [1240, 410, 2], [520, 210, 1.8],
              [1080, 680, 2.2],
            ].map(([cx, cy, r]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={gold} opacity="0.75" filter={`url(#${softGlow})`} />
            ))}
          </svg>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-black/25" />
      <div
        style={{
          background: `linear-gradient(155deg, ${gold}55 0%, rgba(255,255,255,0.14) 45%, ${emerald}77 100%)`,
        }}
        className="relative z-10 w-full max-w-[440px] rounded-2xl p-[1.2px] shadow-[0_28px_80px_rgba(0,0,0,0.75)]"
      >
        <div
          style={loginCardStyle(settings)}
          className="rounded-2xl px-7 py-7 backdrop-blur-2xl sm:px-9 sm:py-8"
        >
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-200 transition hover:text-white"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{backText}</span>
          </Link>
          <div className="mt-5 flex flex-col items-center text-center">
            {settings.logoUrl ? (
              <Image
                src={settings.logoUrl}
                alt={settings.storeName}
                width={160}
                height={56}
                unoptimized
                className="h-14 w-auto object-contain drop-shadow"
              />
            ) : (
              <svg viewBox="0 0 80 64" className="h-12 w-14" fill="none" aria-hidden="true">
                <path d="M40 4 L66 18 V46 L40 60 L14 46 V18 Z" stroke={gold} strokeWidth="2.2" fill={`${gold}0f`} />
                <text x="40" y="39" textAnchor="middle" fill={gold} fontFamily="Georgia, serif" fontWeight="700" fontSize="24" letterSpacing="-1">
                  {settings.storeName.split(/\s+/).filter(Boolean).map((word) => word[0]).join("").slice(0, 2).toUpperCase()}
                </text>
              </svg>
            )}
            <div style={{ color: gold }} className="mt-2 font-serif text-2xl font-bold uppercase tracking-[0.08em]">
              {settings.storeName}
            </div>
            <div
              style={{ borderColor: `${gold}45`, backgroundColor: "rgba(6, 18, 18, 0.65)" }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-[10px] font-semibold tracking-wider text-gray-200"
            >
              <Shield style={{ color: gold }} aria-hidden="true" className="h-3 w-3 shrink-0" />
              <span>{badgeText}</span>
            </div>
          </div>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
