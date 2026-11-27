import { prisma } from "@/lib/prisma";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth-guard";
import { staffAuthorizationError } from "@/lib/user-auth";
import { sendOrderEmail } from "@/lib/order-email";
import { sendOrderSms } from "@/lib/sms";

const validOrderStatuses = [
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;

const validPaymentStatuses = ["UNPAID", "PAID"] as const;

const allowedTransitions: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: ["PENDING"],
};

class OrderUpdateError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isOrderStatus(value: unknown): value is (typeof validOrderStatuses)[number] {
  return (
    typeof value === "string" &&
    validOrderStatuses.some((status) => status === value)
  );
}

function isPaymentStatus(
  value: unknown,
): value is (typeof validPaymentStatuses)[number] {
  return (
    typeof value === "string" &&
    validPaymentStatuses.some((status) => status === value)
  );
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");
  if (!phone || normalizePhone(phone).length < 7) {
    return Response.json(
      { error: "A valid phone number is required to track an order" },
      { status: 400 },
    );
  }

  try {
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id }, { orderNumber: { equals: id, mode: "insensitive" } }],
      },
      include: {
        items: {
          select: {
            quantity: true,
            price: true,
            variantInfo: true,
            product: { select: { name: true, image: true } },
          },
        },
      },
    });
    if (
      !order ||
      normalizePhone(order.customerPhone) !== normalizePhone(phone)
    ) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    return Response.json({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      deliveryAddress: order.deliveryAddress,
      deliveryZone: order.deliveryZone,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      couponCode: order.couponCode,
      deliveryCharge: order.deliveryCharge,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items,
    });
  } catch (error) {
    console.error("Error looking up order:", error);
    return Response.json(
      { error: "Failed to lookup order" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }
  const allowedFields = new Set([
    "orderStatus",
    "paymentStatus",
    "deliveryAddress",
    "courierProvider",
    "consignmentId",
    "trackingCode",
    "courierStatus",
  ]);
  const unknownFields = Object.keys(body).filter(
    (field) => !allowedFields.has(field),
  );
  if (unknownFields.length > 0) {
    return Response.json(
      { error: `Unsupported order fields: ${unknownFields.join(", ")}` },
      { status: 400 },
    );
  }
  if (
    body.orderStatus === undefined &&
    body.paymentStatus === undefined &&
    body.deliveryAddress === undefined
  ) {
    return Response.json(
      {
        error:
          "Provide orderStatus, paymentStatus, or deliveryAddress to update",
      },
      { status: 400 },
    );
  }
  if (
    body.orderStatus !== undefined &&
    !isOrderStatus(body.orderStatus)
  ) {
    return Response.json(
      { error: "Invalid orderStatus" },
      { status: 400 },
    );
  }
  if (
    body.paymentStatus !== undefined &&
    !isPaymentStatus(body.paymentStatus)
  ) {
    return Response.json(
      { error: "paymentStatus must be UNPAID or PAID" },
      { status: 400 },
    );
  }
  if (
    body.deliveryAddress !== undefined &&
    (typeof body.deliveryAddress !== "string" ||
      body.deliveryAddress.trim().length === 0 ||
      body.deliveryAddress.trim().length > 1000)
  ) {
    return Response.json(
      {
        error:
          "deliveryAddress must be a non-empty string of at most 1000 characters",
      },
      { status: 400 },
    );
  }
  if (
    body.courierProvider !== undefined &&
    body.courierProvider !== null &&
    body.courierProvider !== "STEADFAST" &&
    body.courierProvider !== "PATHAO"
  ) {
    return Response.json(
      { error: "courierProvider must be STEADFAST, PATHAO, or null" },
      { status: 400 },
    );
  }
  for (const field of ["consignmentId", "trackingCode", "courierStatus"] as const) {
    if (
      body[field] !== undefined &&
      body[field] !== null &&
      (typeof body[field] !== "string" ||
        body[field].trim().length > 200)
    ) {
      return Response.json(
        { error: `${field} must be a string of at most 200 characters or null` },
        { status: 400 },
      );
    }
  }

  const { id } = await params;
  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const current = await transaction.order.findUnique({
        where: { id },
        include: {
          items: {
            select: { productId: true, variantId: true, quantity: true },
          },
        },
      });
      if (!current) return null;

      const nextStatus =
        typeof body.orderStatus === "string"
          ? body.orderStatus
          : current.orderStatus;
      if (
        nextStatus !== current.orderStatus &&
        !allowedTransitions[current.orderStatus]?.includes(nextStatus)
      ) {
        return { conflict: "This order status transition is not allowed" } as const;
      }

      const result = await transaction.order.updateMany({
        where: { id, orderStatus: current.orderStatus },
        data: {
          orderStatus: nextStatus,
          ...(nextStatus === "CANCELLED" &&
          current.orderStatus !== "CANCELLED"
            ? { stockRestored: true }
            : current.orderStatus === "CANCELLED" && nextStatus === "PENDING"
              ? { stockRestored: false }
              : {}),
          ...(typeof body.paymentStatus === "string"
            ? { paymentStatus: body.paymentStatus }
            : {}),
          ...(typeof body.deliveryAddress === "string"
            ? { deliveryAddress: body.deliveryAddress.trim() }
            : {}),
          ...(body.courierProvider !== undefined
            ? { courierProvider: body.courierProvider }
            : {}),
          ...(body.consignmentId !== undefined
            ? {
                consignmentId:
                  typeof body.consignmentId === "string" &&
                  body.consignmentId.trim()
                    ? body.consignmentId.trim()
                    : null,
              }
            : {}),
          ...(body.trackingCode !== undefined
            ? {
                trackingCode:
                  typeof body.trackingCode === "string" &&
                  body.trackingCode.trim()
                    ? body.trackingCode.trim()
                    : null,
              }
            : {}),
          ...(body.courierStatus !== undefined
            ? {
                courierStatus:
                  typeof body.courierStatus === "string" &&
                  body.courierStatus.trim()
                    ? body.courierStatus.trim()
                    : null,
              }
            : {}),
        },
      });
      if (result.count !== 1) {
        return { conflict: "The order was updated by another request" } as const;
      }

      if (
        nextStatus === "CANCELLED" &&
        current.orderStatus !== "CANCELLED"
      ) {
        for (const item of current.items) {
          await transaction.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
          if (item.variantId) {
            await transaction.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } },
            });
          }
        }

        if (current.couponCode) {
          await transaction.coupon.updateMany({
            where: { code: current.couponCode, usedCount: { gt: 0 } },
            data: { usedCount: { decrement: 1 } },
          });
        }
      }

      if (current.orderStatus === "CANCELLED" && nextStatus === "PENDING") {
        for (const item of current.items) {
          if (item.variantId) {
            const variantResult = await transaction.productVariant.updateMany({
              where: {
                id: item.variantId,
                productId: item.productId,
                stock: { gte: item.quantity },
              },
              data: { stock: { decrement: item.quantity } },
            });
            if (variantResult.count !== 1) {
              throw new OrderUpdateError(
                "Insufficient variant stock to reopen this order",
                409,
              );
            }
          }

          const productResult = await transaction.product.updateMany({
            where: {
              id: item.productId,
              isActive: true,
              stock: { gte: item.quantity },
            },
            data: { stock: { decrement: item.quantity } },
          });
          if (productResult.count !== 1) {
            throw new OrderUpdateError(
              "Insufficient product stock to reopen this order",
              409,
            );
          }
        }

        if (current.couponCode) {
          const now = new Date();
          const coupon = await transaction.coupon.findFirst({
            where: {
              code: { equals: current.couponCode, mode: "insensitive" },
            },
            select: { id: true, usageLimit: true },
          });
          if (!coupon) {
            throw new OrderUpdateError(
              "The original order coupon is no longer available",
              409,
            );
          }
          const couponUpdate = await transaction.coupon.updateMany({
            where: {
              id: coupon.id,
              isActive: true,
              AND: [
                { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                {
                  OR: [
                    { usageLimit: null },
                    { usedCount: { lt: coupon.usageLimit ?? 0 } },
                  ],
                },
              ],
            },
            data: { usedCount: { increment: 1 } },
          });
          if (couponUpdate.count !== 1) {
            throw new OrderUpdateError(
              "The original order coupon can no longer be used",
              409,
            );
          }
        }
      }

      const updatedOrder = await transaction.order.findUnique({
        where: { id },
        include: { items: { include: { product: true, variant: true } } },
      });
      return {
        order: updatedOrder,
        previousOrderStatus: current.orderStatus,
        nextOrderStatus: nextStatus,
      };
    });

    if (!updated) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    if ("conflict" in updated) {
      return Response.json({ error: updated.conflict }, { status: 409 });
    }
    if (!updated.order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    if (
      updated.previousOrderStatus !== updated.nextOrderStatus &&
      (updated.nextOrderStatus === "CONFIRMED" ||
        updated.nextOrderStatus === "SHIPPED")
    ) {
      const smsResult = await sendOrderSms({
        phone: updated.order.customerPhone,
        type:
          updated.nextOrderStatus === "SHIPPED"
            ? "SHIPPED"
            : "CONFIRMATION",
        variables: {
          customerName: updated.order.customerName,
          orderNumber: updated.order.orderNumber,
          totalAmount: updated.order.totalAmount,
          courier:
            updated.order.courierProvider === "STEADFAST"
              ? "Steadfast"
              : updated.order.courierProvider === "PATHAO"
                ? "Pathao"
                : undefined,
          trackingCode:
            updated.order.trackingCode ?? updated.order.consignmentId ?? "",
        },
      });
      if (!smsResult.sent && smsResult.reason !== "SMS gateway is disabled") {
        console.warn("Order status notification SMS was not sent", {
          orderNumber: updated.order.orderNumber,
          type: updated.nextOrderStatus,
          reason: smsResult.reason,
        });
      }
    }

    if (updated.previousOrderStatus !== updated.nextOrderStatus) {
      const emailResult = await sendOrderEmail({
        order: updated.order,
        type: "STATUS_UPDATE",
      });
      if (
        !emailResult.sent &&
        emailResult.reason !== "Email notifications are disabled" &&
        emailResult.reason !== "Order status update emails disabled" &&
        emailResult.reason !== "Customer did not provide an email address"
      ) {
        console.warn("Order status notification email was not sent", {
          orderNumber: updated.order.orderNumber,
          type: updated.nextOrderStatus,
          reason: emailResult.reason,
        });
      }
    }

    return Response.json(updated.order);
  } catch (error) {
    if (error instanceof OrderUpdateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to update order:", error);
    return Response.json(
      { error: "Failed to update order" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireRole(["ADMIN"], request);
  if (errorResponse) return errorResponse;

  const { id } = await params;
  try {
    const order = await prisma.order.findUnique({
      where: { id },
      select: { orderStatus: true },
    });
    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.orderStatus !== "CANCELLED") {
      return Response.json(
        { error: "Only cancelled orders can be permanently deleted" },
        { status: 409 },
      );
    }

    const deleted = await prisma.order.deleteMany({
      where: { id, orderStatus: "CANCELLED" },
    });
    if (deleted.count !== 1) {
      return Response.json(
        { error: "Order status changed before deletion" },
        { status: 409 },
      );
    }
    return Response.json({ message: "Order deleted" });
  } catch (error) {
    console.error("DELETE /api/orders/[id] error:", error);
    return Response.json(
      { error: "Failed to delete order" },
      { status: 500 },
    );
  }
}
