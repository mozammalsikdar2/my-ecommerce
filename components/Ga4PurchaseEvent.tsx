"use client";

import { useEffect, useRef } from "react";
import { trackGa4Purchase } from "@/lib/ga4";
import {
  ga4PurchaseItems,
  markGa4PurchaseTracked,
  readGa4PurchaseSnapshot,
  wasGa4PurchaseTracked,
  type Ga4PurchaseSnapshot,
} from "@/lib/ga4-purchase-browser";

export default function Ga4PurchaseEvent({
  orderNumber,
  snapshot,
}: {
  orderNumber: string;
  snapshot?: Ga4PurchaseSnapshot | null;
}) {
  const trackedOrder = useRef<string | null>(null);

  useEffect(() => {
    if (trackedOrder.current === orderNumber || wasGa4PurchaseTracked(orderNumber)) return;
    const purchase = snapshot ?? readGa4PurchaseSnapshot(orderNumber);
    if (!purchase || purchase.orderNumber !== orderNumber) return;

    trackGa4Purchase({
      transactionId: orderNumber,
      value: purchase.totalAmount,
      shipping: purchase.deliveryCharge,
      coupon: purchase.couponCode ?? undefined,
      items: ga4PurchaseItems(purchase),
    });
    trackedOrder.current = orderNumber;
    markGa4PurchaseTracked(orderNumber);
  }, [orderNumber, snapshot]);

  return null;
}
