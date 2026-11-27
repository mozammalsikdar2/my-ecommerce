"use client";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    metaPixelReady?: boolean;
  }
}

export interface TrackEventParams {
  eventName: "ViewContent" | "AddToCart" | "Purchase";
  eventId?: string;
  customData: {
    currency?: string;
    value: number;
    content_ids: string[];
    content_name?: string;
    content_type?: "product" | "product_group";
    contents?: Array<{ id: string; quantity: number; item_price?: number }>;
    num_items?: number;
    order_id?: string;
  };
  sendServerCapi?: boolean;
}

export function trackMetaEvent({
  eventName,
  eventId,
  customData,
  sendServerCapi = true,
}: TrackEventParams) {
  if (typeof window === "undefined") return;

  const sharedEventId =
    eventId?.trim() || `${eventName.toLowerCase()}_${window.crypto.randomUUID()}`;
  if (sharedEventId.length > 128) {
    console.error("Meta tracking event ID exceeds the supported length");
    return;
  }

  const payload = {
    currency: "BDT",
    content_type: "product",
    ...customData,
  };

  if (typeof window.fbq === "function") {
    window.fbq("track", eventName, payload, { eventID: sharedEventId });
  }

  const canSendServerCapi =
    sendServerCapi && eventName !== "Purchase";
  if (!canSendServerCapi) return;

  void fetch("/api/marketing/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      eventName,
      eventId: sharedEventId,
      eventSourceUrl: window.location.href,
      customData: payload,
    }),
  })
    .then((response) => {
      if (!response.ok) {
        console.error("Meta CAPI tracking request failed", {
          status: response.status,
        });
      }
    })
    .catch((error: unknown) => {
      console.error("Meta CAPI tracking request failed", error);
    });
}
