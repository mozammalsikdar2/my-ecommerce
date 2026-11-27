"use client";

import { useEffect, useRef } from "react";
import { trackMetaEvent } from "@/lib/meta-pixel";
import {
  markPurchaseTracked,
  readPurchaseSnapshot,
  wasPurchaseTracked,
  type PurchaseSnapshot,
} from "@/lib/meta-purchase-browser";

export default function MetaPurchaseEvent({
  orderNumber,
  snapshot,
}: {
  orderNumber: string;
  snapshot?: PurchaseSnapshot | null;
}) {
  const trackedOrder = useRef<string | null>(null);

  useEffect(() => {
    function trackPurchase() {
      if (
        trackedOrder.current === orderNumber ||
        !window.metaPixelReady ||
        typeof window.fbq !== "function" ||
        wasPurchaseTracked(orderNumber)
      ) {
        return;
      }

      const purchase = snapshot ?? readPurchaseSnapshot(orderNumber);
      if (!purchase || purchase.orderNumber !== orderNumber) return;

      try {
        trackMetaEvent({
          eventName: "Purchase",
          eventId: `purchase_${orderNumber}`,
          customData: {
            currency: "BDT",
            value: purchase.totalAmount,
            order_id: orderNumber,
            content_ids: purchase.items.map((item) => item.productId),
            content_type: "product",
            contents: purchase.items.map((item) => ({
              id: item.productId,
              quantity: item.quantity,
              item_price: item.price,
            })),
            num_items: purchase.items.reduce(
              (sum, item) => sum + item.quantity,
              0,
            ),
          },
          sendServerCapi: false,
        });
        trackedOrder.current = orderNumber;
        markPurchaseTracked(orderNumber);
      } catch (error) {
        console.error("Unable to send browser purchase event:", error);
      }
    }

    window.addEventListener("meta-pixel-ready", trackPurchase);
    trackPurchase();
    return () => window.removeEventListener("meta-pixel-ready", trackPurchase);
  }, [orderNumber, snapshot]);

  return null;
}
