"use client";

export interface PurchaseSnapshot {
  orderNumber: string;
  totalAmount: number;
  items: Array<{ productId: string; quantity: number; price: number }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPurchaseSnapshot(value: unknown): value is PurchaseSnapshot {
  return (
    isRecord(value) &&
    typeof value.orderNumber === "string" &&
    value.orderNumber.length > 0 &&
    typeof value.totalAmount === "number" &&
    Number.isFinite(value.totalAmount) &&
    value.totalAmount >= 0 &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.productId === "string" &&
        item.productId.length > 0 &&
        typeof item.quantity === "number" &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity > 0 &&
        typeof item.price === "number" &&
        Number.isFinite(item.price) &&
        item.price >= 0,
    )
  );
}

function snapshotKey(orderNumber: string) {
  return `meta-purchase:${orderNumber}`;
}

export function savePurchaseSnapshot(snapshot: PurchaseSnapshot) {
  try {
    sessionStorage.setItem(snapshotKey(snapshot.orderNumber), JSON.stringify(snapshot));
  } catch (error) {
    console.error("Unable to preserve purchase tracking data:", error);
  }
}

export function readPurchaseSnapshot(orderNumber: string): PurchaseSnapshot | null {
  try {
    const stored = sessionStorage.getItem(snapshotKey(orderNumber));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (isPurchaseSnapshot(parsed) && parsed.orderNumber === orderNumber) return parsed;
    console.error("Stored purchase tracking data is invalid");
  } catch (error) {
    console.error("Unable to read purchase tracking data:", error);
  }
  return null;
}

export function wasPurchaseTracked(orderNumber: string) {
  try {
    return sessionStorage.getItem(`${snapshotKey(orderNumber)}:sent`) === "1";
  } catch (error) {
    console.error("Unable to read purchase tracking status:", error);
    return false;
  }
}

export function markPurchaseTracked(orderNumber: string) {
  try {
    sessionStorage.setItem(`${snapshotKey(orderNumber)}:sent`, "1");
    sessionStorage.removeItem(snapshotKey(orderNumber));
  } catch (error) {
    console.error("Unable to persist purchase tracking status:", error);
  }
}
