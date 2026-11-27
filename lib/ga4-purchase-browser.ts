"use client";

import type { Ga4ProductItem } from "@/lib/ga4";

export interface Ga4PurchaseSnapshot {
  orderNumber: string;
  totalAmount: number;
  deliveryCharge: number;
  couponCode: string | null;
  items: Array<{
    productId: string;
    name: string;
    variantInfo: string | null;
    price: number;
    quantity: number;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isGa4PurchaseSnapshot(value: unknown): value is Ga4PurchaseSnapshot {
  return (
    isRecord(value) &&
    typeof value.orderNumber === "string" &&
    value.orderNumber.length > 0 &&
    isNonNegativeNumber(value.totalAmount) &&
    isNonNegativeNumber(value.deliveryCharge) &&
    (typeof value.couponCode === "string" || value.couponCode === null) &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.productId === "string" &&
        item.productId.length > 0 &&
        typeof item.name === "string" &&
        item.name.length > 0 &&
        (typeof item.variantInfo === "string" || item.variantInfo === null) &&
        isNonNegativeNumber(item.price) &&
        typeof item.quantity === "number" &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity > 0,
    )
  );
}

export function ga4PurchaseItems(snapshot: Ga4PurchaseSnapshot): Ga4ProductItem[] {
  return snapshot.items.map((item) => ({
    item_id: item.productId,
    item_name: item.name,
    item_variant: item.variantInfo ?? undefined,
    price: item.price,
    quantity: item.quantity,
  }));
}

function snapshotKey(orderNumber: string) {
  return `ga4-purchase:${orderNumber}`;
}

export function saveGa4PurchaseSnapshot(snapshot: Ga4PurchaseSnapshot) {
  try {
    sessionStorage.setItem(snapshotKey(snapshot.orderNumber), JSON.stringify(snapshot));
  } catch (error) {
    console.error("Unable to preserve GA4 purchase tracking data:", error);
  }
}

export function readGa4PurchaseSnapshot(orderNumber: string): Ga4PurchaseSnapshot | null {
  try {
    const stored = sessionStorage.getItem(snapshotKey(orderNumber));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (isGa4PurchaseSnapshot(parsed) && parsed.orderNumber === orderNumber) return parsed;
    console.error("Stored GA4 purchase tracking data is invalid");
  } catch (error) {
    console.error("Unable to read GA4 purchase tracking data:", error);
  }
  return null;
}

export function wasGa4PurchaseTracked(orderNumber: string) {
  try {
    return sessionStorage.getItem(`${snapshotKey(orderNumber)}:sent`) === "1";
  } catch (error) {
    console.error("Unable to read GA4 purchase tracking status:", error);
    return false;
  }
}

export function markGa4PurchaseTracked(orderNumber: string) {
  try {
    sessionStorage.setItem(`${snapshotKey(orderNumber)}:sent`, "1");
    sessionStorage.removeItem(snapshotKey(orderNumber));
  } catch (error) {
    console.error("Unable to persist GA4 purchase tracking status:", error);
  }
}
