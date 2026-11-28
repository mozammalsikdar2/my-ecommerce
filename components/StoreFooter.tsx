"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Camera,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Play,
  Truck,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export default function StoreFooter() {
  const { settings } = useSettings();
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return null;

  const socialLinks = [
    ["Facebook", settings.facebookUrl, settings.footerFacebookIconUrl, Globe],
    ["Instagram", settings.instagramUrl, settings.footerInstagramIconUrl, Camera],
    ["YouTube", settings.youtubeUrl, settings.footerYoutubeIconUrl, Play],
  ] as const;
  const whatsappDigits = settings.whatsappNumber.replace(/\D/g, "");
  const messengerUsername = settings.messengerUsername.trim();
  const messengerHref =
    /^[a-z\d.]+$/i.test(messengerUsername) && messengerUsername.length <= 100
      ? `https://m.me/${encodeURIComponent(messengerUsername)}`
      : null;

  return (
    <footer
      style={{ backgroundColor: settings.secondaryColor }}
      className="mt-16 text-gray-300"
    >
      <div
        style={{ backgroundColor: settings.primaryColor }}
        className="h-1.5 w-full"
      />

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          {settings.logoUrl ? (
            <Image
              src={settings.logoUrl}
              alt={settings.storeName}
              width={160}
              height={40}
              unoptimized
              className="mb-3 h-10 w-auto rounded bg-white/95 p-1 object-contain"
            />
          ) : (
            <h3 className="text-xl font-extrabold text-white">
              {settings.storeName}
            </h3>
          )}
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            {settings.tagline}
          </p>

          <div className="mt-5 flex items-center gap-2.5">
            {socialLinks.map(([name, value, iconUrl, Icon]) => {
              const href = safeExternalUrl(value);
              if (!href) return null;
              return (
                <a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={name}
                  className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                >
                  {iconUrl ? (
                    <Image src={iconUrl} alt="" width={16} height={16} unoptimized className="h-4 w-4 object-contain" />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  )}
                </a>
              );
            })}
            {whatsappDigits && (
              <a
                href={`https://wa.me/${whatsappDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            )}
            {messengerHref && (
              <a
                href={messengerHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Messenger"
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <MessageSquare className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <div>
          <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-white">
            Quick Navigation
          </h4>
          <ul className="space-y-2.5 text-sm">
            {settings.menuItems.map((item, index) => (
              <li key={`${item.href}-${index}`}>
                <Link
                  href={item.href}
                  className="text-gray-400 transition hover:text-white"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/cart"
                className="text-gray-400 transition hover:text-white"
              >
                Shopping Cart
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-white">
            Contact Us
          </h4>
          <ul className="space-y-3 text-sm text-gray-400">
            <li className="flex items-start gap-2.5">
              <Phone
                style={{ color: settings.primaryColor }}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <a className="hover:text-white" href={`tel:${settings.contactPhone}`}>
                {settings.contactPhone}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <Mail
                style={{ color: settings.primaryColor }}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <a
                className="hover:text-white"
                href={`mailto:${settings.contactEmail}`}
              >
                {settings.contactEmail}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin
                style={{ color: settings.primaryColor }}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>{settings.contactAddress}</span>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-white">
            Delivery Charges
          </h4>
          <div className="space-y-2.5 rounded-xl bg-white/5 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Truck
                style={{ color: settings.primaryColor }}
                className="h-4 w-4"
              />
              <span>Nationwide Shipping</span>
            </div>
            <div className="flex justify-between text-xs text-gray-300">
              <span>Inside Dhaka:</span>
              <span className="font-bold text-white">
                ৳{settings.deliveryChargeInside}
              </span>
            </div>
            <div className="flex justify-between text-xs text-gray-300">
              <span>Outside Dhaka:</span>
              <span className="font-bold text-white">
                ৳{settings.deliveryChargeOutside}
              </span>
            </div>
          </div>
        </div>
      </div>

      <nav
        aria-label="Store information"
        className="flex flex-wrap justify-center gap-5 border-t border-white/10 px-4 py-4 text-xs text-gray-300"
      >
        <Link href="/pages/about-contact" className="hover:text-white">
          About Us &amp; Contact Us
        </Link>
        <Link href="/pages/privacy-policy" className="hover:text-white">
          Privacy Policy
        </Link>
        <Link href="/pages/terms-and-conditions" className="hover:text-white">
          Terms &amp; Conditions
        </Link>
        <Link href="/pages/return-refund-policy" className="hover:text-white">
          Return &amp; Refund Policy
        </Link>
      </nav>

      <div className="border-t border-white/10 py-4 text-center text-xs text-gray-400">
        {settings.footerText}
      </div>
    </footer>
  );
}
