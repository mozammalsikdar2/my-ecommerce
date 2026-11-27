"use client";

import { sendGAEvent, sendGTMEvent } from "@next/third-parties/google";

export interface Ga4ProductItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price: number;
  quantity: number;
}

type EcommerceEvent = {
  name: string;
  payload: Record<string, unknown>;
};

type TrackingMode = "ga4" | "gtm" | "disabled";

let trackingMode: TrackingMode | null = null;
const pendingEvents: EcommerceEvent[] = [];

function sendEvent({ name, payload }: EcommerceEvent, mode: TrackingMode) {
  if (mode === "ga4") {
    sendGAEvent("event", name, payload);
  } else if (mode === "gtm") {
    sendGTMEvent({ ecommerce: null });
    sendGTMEvent({ event: name, ecommerce: payload });
  }
}

export function configureGa4Tracking(mode: TrackingMode) {
  trackingMode = mode;
  for (const event of pendingEvents.splice(0)) {
    sendEvent(event, mode);
  }
}

function pushGa4EcommerceEvent(
  name: string,
  payload: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;

  const event = { name, payload };
  if (trackingMode === null) {
    if (pendingEvents.length >= 100) {
      console.error("Google ecommerce event queue is full");
      return;
    }
    pendingEvents.push(event);
    return;
  }
  sendEvent(event, trackingMode);
}

export function trackGa4ViewItem(item: Ga4ProductItem) {
  pushGa4EcommerceEvent("view_item", {
    currency: "BDT",
    value: item.price * item.quantity,
    items: [item],
  });
}

export function trackGa4AddToCart(item: Ga4ProductItem) {
  pushGa4EcommerceEvent("add_to_cart", {
    currency: "BDT",
    value: item.price * item.quantity,
    items: [item],
  });
}

export function trackGa4BeginCheckout(params: {
  value: number;
  coupon?: string;
  items: Ga4ProductItem[];
}) {
  pushGa4EcommerceEvent("begin_checkout", {
    currency: "BDT",
    value: params.value,
    ...(params.coupon ? { coupon: params.coupon } : {}),
    items: params.items,
  });
}

export function trackGa4Purchase(params: {
  transactionId: string;
  value: number;
  shipping: number;
  coupon?: string;
  items: Ga4ProductItem[];
}) {
  pushGa4EcommerceEvent("purchase", {
    transaction_id: params.transactionId,
    currency: "BDT",
    value: params.value,
    shipping: params.shipping,
    ...(params.coupon ? { coupon: params.coupon } : {}),
    items: params.items,
  });
}
