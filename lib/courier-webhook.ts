import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendOrderEmail } from "@/lib/order-email";

export type NormalizedCourierOutcome =
  | "DELIVERED"
  | "RETURNED"
  | "IN_TRANSIT";

export interface CourierWebhookInput {
  provider: "STEADFAST" | "PATHAO";
  consignmentId?: string | null;
  orderNumber?: string | null;
  rawCourierStatus: string;
  outcome: NormalizedCourierOutcome;
}

export async function processCourierWebhookUpdate(
  input: CourierWebhookInput,
) {
  const consignmentId = input.consignmentId?.trim() || null;
  const orderNumber = input.orderNumber?.trim().toUpperCase() || null;
  const rawCourierStatus = input.rawCourierStatus.trim();

  if (!consignmentId && !orderNumber) {
    return {
      ok: false,
      status: 400,
      message: "Missing consignmentId or orderNumber in webhook payload",
    };
  }
  if (!rawCourierStatus || rawCourierStatus.length > 200) {
    return {
      ok: false,
      status: 400,
      message: "Courier status is missing or invalid",
    };
  }

  try {
    const matches = await prisma.order.findMany({
      where: {
        OR: [
          ...(consignmentId ? [{ consignmentId }] : []),
          ...(orderNumber ? [{ orderNumber }] : []),
        ],
      },
      select: { id: true, orderNumber: true },
      take: 2,
    });

    if (matches.length === 0) {
      return {
        ok: false,
        status: 404,
        message: `No matching order found for consignment=${consignmentId} / order=${orderNumber}`,
      };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        status: 409,
        message: "Webhook identifiers match more than one order",
      };
    }

    const orderId = matches[0].id;
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: { product: { select: { name: true } } },
          },
        },
      });
      if (!current) return null;

      let shouldSendDeliveredEmail = false;

      if (input.outcome === "RETURNED") {
        const restored = await tx.order.updateMany({
          where: {
            id: current.id,
            stockRestored: false,
            orderStatus: { not: "CANCELLED" },
          },
          data: {
            courierProvider: input.provider,
            courierStatus: rawCourierStatus,
            orderStatus: "RETURNED",
            stockRestored: true,
          },
        });

        if (restored.count === 1) {
          for (const item of current.items) {
            if (item.variantId) {
              await tx.productVariant.updateMany({
                where: { id: item.variantId },
                data: { stock: { increment: item.quantity } },
              });
            }
            await tx.product.updateMany({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          }
        } else {
          await tx.order.update({
            where: { id: current.id },
            data: {
              courierProvider: input.provider,
              courierStatus: rawCourierStatus,
              orderStatus: "RETURNED",
              stockRestored: true,
            },
          });
        }
      } else if (input.outcome === "DELIVERED") {
        if (
          current.orderStatus === "CANCELLED" ||
          current.orderStatus === "RETURNED"
        ) {
          return { order: current, shouldSendDeliveredEmail: false };
        }
        const updated = await tx.order.updateMany({
          where: { id: current.id, orderStatus: current.orderStatus },
          data: {
            courierProvider: input.provider,
            courierStatus: rawCourierStatus,
            orderStatus: "DELIVERED",
            paymentStatus: "PAID",
          },
        });
        shouldSendDeliveredEmail =
          updated.count === 1 && current.orderStatus !== "DELIVERED";
      } else if (
        current.orderStatus !== "DELIVERED" &&
        current.orderStatus !== "RETURNED" &&
        current.orderStatus !== "CANCELLED"
      ) {
        await tx.order.updateMany({
          where: { id: current.id, orderStatus: current.orderStatus },
          data: {
            courierProvider: input.provider,
            courierStatus: rawCourierStatus,
          },
        });
      }

      const order = await tx.order.findUnique({
        where: { id: current.id },
        include: {
          items: {
            include: { product: { select: { name: true } } },
          },
        },
      });
      return order ? { order, shouldSendDeliveredEmail } : null;
    });

    if (!result) {
      return { ok: false, status: 404, message: "Order not found" };
    }

    if (result.shouldSendDeliveredEmail) {
      const emailResult = await sendOrderEmail({
        order: result.order,
        type: "STATUS_UPDATE",
      });
      if (!emailResult.sent && emailResult.reason !== "Email notifications are disabled" &&
        emailResult.reason !== "Order status update emails disabled" &&
        emailResult.reason !== "Customer did not provide an email address") {
        console.warn("Courier delivery email was not sent", {
          orderNumber: result.order.orderNumber,
          reason: emailResult.reason,
        });
      }
    }

    return {
      ok: true,
      status: 200,
      orderNumber: result.order.orderNumber,
      orderStatus: result.order.orderStatus,
      stockRestored: result.order.stockRestored,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return {
        ok: false,
        status: 409,
        message: "Order was updated concurrently; retry the webhook",
      };
    }
    console.error("Courier webhook order update failed:", error);
    throw error;
  }
}
