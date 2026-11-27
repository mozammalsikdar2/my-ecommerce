"use client";

import { MessageCircle, MessageSquare } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

function getMessengerHref(value: string) {
  let username = value.trim();
  if (!username) return null;

  if (/^https?:\/\//i.test(username)) {
    try {
      const url = new URL(username);
      if (
        !["m.me", "facebook.com", "www.facebook.com"].includes(
          url.hostname.toLowerCase(),
        )
      ) {
        return null;
      }
      username = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }

  if (!/^[a-z\d.]{1,100}$/i.test(username)) return null;
  return `https://m.me/${encodeURIComponent(username)}`;
}

export default function FloatingChatButtons() {
  const { settings } = useSettings();
  const whatsappNumber = (settings.whatsappNumber || "").replace(/\D/g, "");
  const messengerHref = getMessengerHref(settings.messengerUsername || "");

  if (!whatsappNumber && !messengerHref) return null;

  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        `Hello ${settings.storeName}, I would like to inquire about a product.`,
      )}`
    : null;

  return (
    <div
      role="group"
      aria-label="Customer support chat"
      className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3"
    >
      {messengerHref && (
        <a
          href={messengerHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat on Messenger"
          title="Chat on Messenger"
          className="group flex items-center gap-2.5 rounded-full bg-gradient-to-tr from-[#006aff] via-[#a033ff] to-[#ff5280] p-3.5 text-white shadow-lg transition-transform duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <span
            aria-hidden="true"
            className="hidden rounded-md bg-gray-900/90 px-2.5 py-1 text-xs font-bold text-white shadow group-hover:block group-focus-visible:block"
          >
            Messenger
          </span>
          <MessageSquare className="h-6 w-6 shrink-0" aria-hidden="true" />
        </a>
      )}

      {whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat on WhatsApp"
          title="Chat on WhatsApp"
          className="group flex items-center gap-2.5 rounded-full bg-[#25d366] p-3.5 text-white shadow-lg transition-transform duration-200 hover:scale-110 hover:bg-[#20bd5a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
        >
          <span
            aria-hidden="true"
            className="hidden rounded-md bg-gray-900/90 px-2.5 py-1 text-xs font-bold text-white shadow group-hover:block group-focus-visible:block"
          >
            WhatsApp
          </span>
          <MessageCircle className="h-6 w-6 shrink-0" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
