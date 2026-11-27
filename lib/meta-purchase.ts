import { after } from "next/server";
import { sendMetaCapiEvent } from "@/lib/meta-capi";
import { prisma } from "@/lib/prisma";

export function scheduleMetaPurchase(
  orderId: string,
  options: { includeRequestContext: boolean },
) {
  const sendPurchase = async () => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) {
        console.error("Meta purchase event could not find the order");
        return;
      }

      const nameParts = order.customerName.trim().split(/\s+/);
      const result = await sendMetaCapiEvent(
        {
          eventName: "Purchase",
          eventId: `purchase_${order.orderNumber}`,
          userData: {
            email: order.customerEmail,
            phone: order.customerPhone,
            firstName: nameParts[0],
            lastName: nameParts.slice(1).join(" ") || undefined,
            city: order.deliveryZone === "INSIDE_DHAKA" ? "Dhaka" : undefined,
          },
          customData: {
            currency: "BDT",
            value: order.totalAmount,
            order_id: order.orderNumber,
            content_ids: order.items.map((item) => item.productId),
            content_type: "product",
            contents: order.items.map((item) => ({
              id: item.productId,
              quantity: item.quantity,
              item_price: item.price,
            })),
            num_items: order.items.reduce((sum, item) => sum + item.quantity, 0),
          },
        },
        options,
      );
      if (
        !result.sent &&
        result.reason !== "Meta CAPI disabled or credentials missing"
      ) {
        console.error("Meta purchase event failed:", result.reason ?? result.status);
      }
    } catch (error) {
      console.error(
        "Meta purchase event failed:",
        error instanceof Error ? error.name : "Unknown error",
      );
    }
  };
  try {
    after(sendPurchase);
  } catch (error) {
    console.error(
      "Unable to schedule Meta purchase event:",
      error instanceof Error ? error.name : "Unknown error",
    );
  }
}
