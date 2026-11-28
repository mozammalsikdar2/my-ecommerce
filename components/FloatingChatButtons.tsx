"use client";

import Image from "next/image";
import { PhoneCall } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { getCallHref, getMessengerHref, getWhatsappHref } from "@/lib/chat-links";

export default function FloatingChatButtons() {
  const { settings } = useSettings();
  const messengerHref = getMessengerHref(settings.messengerUsername || "");
  const whatsappHref = getWhatsappHref(
    settings.whatsappNumber || "",
    `Hello ${settings.storeName}, I would like to inquire about a product.`,
  );
  const callHref = getCallHref(settings.headerCallNumber);
  const showCall = settings.showBottomCall && callHref;
  const showMessenger = settings.showBottomMessenger && messengerHref;
  const showWhatsapp = settings.showBottomWhatsapp && whatsappHref;
  if (!showCall && !showMessenger && !showWhatsapp) return null;

  return (
    <div
      role="group"
      aria-label="Bottom Quick Contact Icons"
      className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3"
    >
      {showCall && (
        <a
          href={callHref}
          aria-label="Call Us"
          title={`Call ${settings.headerCallNumber}`}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-700 text-white shadow-lg transition-transform duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {settings.bottomCallIconUrl ? (
            <Image src={settings.bottomCallIconUrl} alt="" width={24} height={24} unoptimized className="h-6 w-6 object-contain" />
          ) : (
            <PhoneCall className="h-5 w-5" aria-hidden="true" />
          )}
        </a>
      )}

      {showMessenger && (
        <a
          href={messengerHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat on Messenger"
          title="Chat on Messenger"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-[#006aff] via-[#a033ff] to-[#ff5280] text-white shadow-lg transition-transform duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {settings.bottomMessengerIconUrl ? (
            <Image src={settings.bottomMessengerIconUrl} alt="" width={24} height={24} unoptimized className="h-6 w-6 object-contain" />
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
              <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6 7.46-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z" />
            </svg>
          )}
        </a>
      )}

      {showWhatsapp && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat on WhatsApp"
          title="Chat on WhatsApp"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg transition-transform duration-200 hover:scale-110 hover:bg-[#20bd5a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
        >
          {settings.bottomWhatsappIconUrl ? (
            <Image src={settings.bottomWhatsappIconUrl} alt="" width={24} height={24} unoptimized className="h-6 w-6 object-contain" />
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.82 14.01c-.24.68-1.41 1.3-1.95 1.38-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3 0-1.43.75-2.13 1.01-2.42.27-.29.58-.36.77-.36.19 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.82 2.01.89 2.16.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.3-.13.58.17.29.74 1.22 1.59 1.98 1.09.97 2.01 1.27 2.3 1.42.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.39-.24.65-.14.27.1 1.69.8 1.98.94.29.14.48.22.55.34.07.12.07.7-.17 1.38z" />
            </svg>
          )}
        </a>
      )}
    </div>
  );
}
