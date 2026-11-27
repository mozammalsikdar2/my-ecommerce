import { randomUUID } from "node:crypto";
import { checkCheckoutRateLimit } from "@/lib/checkout-rate-limit";
import { prisma } from "@/lib/prisma";
import { scheduleMetaPurchase } from "@/lib/meta-purchase";
import { sendOrderEmail } from "@/lib/order-email";
import { calculateCouponDiscount } from "@/lib/coupons";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { validateBangladeshiPhone } from "@/lib/bd-phone";
import { sendOrderSms } from "@/lib/sms";
import {
  getRequestUserRecord,
  staffAuthorizationError,
} from "@/lib/user-auth";
import { isPaymentEncryptionConfigured } from "@/lib/payment-secrets";

const orderStatuses = [
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;
const paymentStatuses = ["UNPAID", "PAID"] as const;

export async function GET(request: Request) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim().toUpperCase();
    const paymentStatus = searchParams
      .get("paymentStatus")
      ?.trim()
      .toUpperCase();
    const search = searchParams.get("search")?.trim();

    if (
      status &&
      status !== "ALL" &&
      !orderStatuses.some((value) => value === status)
    ) {
      return Response.json({ error: "Invalid order status filter" }, { status: 400 });
    }
    if (
      paymentStatus &&
      paymentStatus !== "ALL" &&
      !paymentStatuses.some((value) => value === paymentStatus)
    ) {
      return Response.json(
        { error: "Invalid payment status filter" },
        { status: 400 },
      );
    }

    const orders = await prisma.order.findMany({
      where: {
        ...(status && status !== "ALL" ? { orderStatus: status } : {}),
        ...(paymentStatus && paymentStatus !== "ALL"
          ? { paymentStatus }
          : {}),
        ...(search
          ? {
              OR: [
                { orderNumber: { contains: search, mode: "insensitive" } },
                { customerName: { contains: search, mode: "insensitive" } },
                { customerPhone: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { items: { include: { product: true, variant: true } } },
      orderBy: { createdAt: "desc" },
    });

    const totalRevenue = roundMoney(
      orders
        .filter((order) => order.orderStatus !== "CANCELLED")
        .reduce((sum, order) => sum + order.totalAmount, 0),
    );
    const pendingOrders = orders.filter(
      (order) => order.orderStatus === "PENDING",
    ).length;
    const confirmedOrders = orders.filter(
      (order) => order.orderStatus === "CONFIRMED",
    ).length;

    return Response.json({
      orders,
      summary: {
        totalOrders: orders.length,
        pendingOrders,
        totalRevenue,
      },
      stats: {
        totalOrders: orders.length,
        pendingOrders,
        confirmedOrders,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return Response.json(
      { error: "Failed to fetch orders" },
      { status: 500 },
    );
  }
}

class OrderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface RequestedLine {
  productId: string;
  variantId: string | null;
  quantity: number;
}

function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }
  if (
    body.companyWebsite !== undefined &&
    typeof body.companyWebsite !== "string"
  ) {
    return Response.json(
      { error: "Invalid checkout submission" },
      { status: 400 },
    );
  }
  if (
    typeof body.companyWebsite === "string" &&
    body.companyWebsite.trim().length > 0
  ) {
    return Response.json(
      { error: "Automated submission rejected." },
      { status: 400 },
    );
  }

  const {
    customerName,
    customerPhone,
    customerEmail,
    deliveryAddress,
    paymentMethod,
    items,
  } = body;
  const deliveryZone = body.deliveryZone ?? "INSIDE_DHAKA";
  const couponCode =
    typeof body.couponCode === "string"
      ? body.couponCode.replace(/\s+/g, "").toUpperCase()
      : "";

  if (typeof customerName !== "string" || customerName.trim().length === 0) {
    return Response.json(
      { error: "customerName is required" },
      { status: 400 },
    );
  }
  if (typeof customerPhone !== "string" || customerPhone.trim().length === 0) {
    return Response.json(
      { error: "customerPhone is required" },
      { status: 400 },
    );
  }
  const phoneValidation = validateBangladeshiPhone(customerPhone);
  const normalizedCustomerPhone = phoneValidation.normalized;
  if (!phoneValidation.valid || !normalizedCustomerPhone) {
    return Response.json(
      { error: phoneValidation.error ?? "Enter a valid mobile number" },
      { status: 400 },
    );
  }
  if (
    customerEmail !== undefined &&
    customerEmail !== null &&
    (typeof customerEmail !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()))
  ) {
    return Response.json(
      { error: "customerEmail must be a valid email address" },
      { status: 400 },
    );
  }
  if (typeof deliveryAddress !== "string" || deliveryAddress.trim().length === 0) {
    return Response.json(
      { error: "deliveryAddress is required" },
      { status: 400 },
    );
  }
  if (body.couponCode !== undefined && typeof body.couponCode !== "string") {
    return Response.json(
      { error: "couponCode must be a string" },
      { status: 400 },
    );
  }
  if (deliveryZone !== "INSIDE_DHAKA" && deliveryZone !== "OUTSIDE_DHAKA") {
    return Response.json(
      { error: "deliveryZone must be INSIDE_DHAKA or OUTSIDE_DHAKA" },
      { status: 400 },
    );
  }
  const normalizedPaymentMethod = String(paymentMethod ?? "COD");
  if (!["COD", "BKASH", "CARD"].includes(normalizedPaymentMethod)) {
    return Response.json(
      { error: "paymentMethod must be COD, BKASH, or CARD" },
      { status: 400 },
    );
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return Response.json(
      { error: "items must be a non-empty array with at most 100 entries" },
      { status: 400 },
    );
  }

  const requestedLines = new Map<string, RequestedLine>();
  const productQuantities = new Map<string, number>();
  for (const item of items) {
    if (
      !isRecord(item) ||
      typeof item.productId !== "string" ||
      item.productId.trim().length === 0 ||
      (item.variantId !== undefined &&
        item.variantId !== null &&
        (typeof item.variantId !== "string" || item.variantId.trim() === "")) ||
      typeof item.quantity !== "number" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return Response.json(
        {
          error:
            "Each item needs a productId, optional variantId, and positive integer quantity",
        },
        { status: 400 },
      );
    }

    const productId = item.productId.trim();
    const variantId =
      typeof item.variantId === "string" ? item.variantId.trim() : null;
    const key = JSON.stringify([productId, variantId]);
    const existing = requestedLines.get(key);
    const quantity = (existing?.quantity ?? 0) + item.quantity;
    if (quantity > 10000) {
      return Response.json(
        { error: "The requested quantity for a product is too large" },
        { status: 400 },
      );
    }
    const totalProductQuantity =
      (productQuantities.get(productId) ?? 0) + item.quantity;
    if (totalProductQuantity > 10000) {
      return Response.json(
        { error: "The requested quantity for a product is too large" },
        { status: 400 },
      );
    }
    requestedLines.set(key, { productId, variantId, quantity });
    productQuantities.set(productId, totalProductQuantity);
  }

  try {
    const paymentSettings = await prisma.paymentSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
    const methodEnabled =
      normalizedPaymentMethod === "COD"
        ? paymentSettings.codEnabled
        : normalizedPaymentMethod === "BKASH"
          ? paymentSettings.bkashEnabled &&
            Boolean(
              paymentSettings.bkashAppKey &&
                paymentSettings.bkashAppSecret &&
                paymentSettings.bkashUsername &&
                paymentSettings.bkashPassword,
            )
          : paymentSettings.stripeEnabled &&
            Boolean(
              paymentSettings.stripePublishableKey &&
                paymentSettings.stripeSecretKey,
            );
    if (!methodEnabled) {
      return Response.json(
        { error: "The selected payment method is currently unavailable" },
        { status: 400 },
      );
    }
    if (
      normalizedPaymentMethod !== "COD" &&
      !isPaymentEncryptionConfigured()
    ) {
      return Response.json(
        { error: "Online payment processing is not configured" },
        { status: 503 },
      );
    }

    const requestingUser = await getRequestUserRecord(request);
    const rateLimit = await checkCheckoutRateLimit(normalizedCustomerPhone);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: rateLimit.reason ?? "Checkout rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
          },
        },
      );
    }

    const order = await prisma.$transaction(async (transaction) => {
      const blockedPhone = await transaction.blockedPhone.findUnique({
        where: { phone: normalizedCustomerPhone },
        select: { id: true },
      });
      if (blockedPhone) {
        throw new OrderRequestError(
          "We cannot accept orders from this phone number. Contact support if you believe this is a mistake.",
          403,
        );
      }

      const settings = await transaction.siteSettings.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1 },
      });
      const productIds = [...productQuantities.keys()].sort();
      const products = await transaction.product.findMany({
        where: { id: { in: productIds }, isActive: true },
      });
      const productsById = new Map(
        products.map((product) => [product.id, product]),
      );

      if (products.length !== productIds.length) {
        throw new OrderRequestError("One or more products were not found", 404);
      }

      const variantIds = [
        ...new Set(
          [...requestedLines.values()]
            .map((line) => line.variantId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const variants = variantIds.length
        ? await transaction.productVariant.findMany({
            where: { id: { in: variantIds } },
          })
        : [];
      const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
      if (variants.length !== variantIds.length) {
        throw new OrderRequestError("One or more product variants were not found", 404);
      }

      const lineItems = [...requestedLines.values()].map((line) => {
        const product = productsById.get(line.productId);
        const variant = line.variantId
          ? variantsById.get(line.variantId)
          : null;
        if (!product) {
          throw new OrderRequestError("One or more products were not found", 404);
        }
        if (variant && variant.productId !== product.id) {
          throw new OrderRequestError(
            "A selected variant does not belong to its product",
            400,
          );
        }
        if (variant && variant.stock < line.quantity) {
          throw new OrderRequestError(
            `Insufficient stock for ${product.name}`,
            409,
          );
        }
        return {
          ...line,
          product,
          variant,
          price: variant?.price ?? product.discountPrice ?? product.price,
        };
      });

      for (const [productId, quantity] of productQuantities) {
        const product = productsById.get(productId);
        if (!product || product.stock < quantity) {
          throw new OrderRequestError(
            `Insufficient stock for ${product?.name ?? "product"}`,
            409,
          );
        }
        const result = await transaction.product.updateMany({
          where: {
            id: productId,
            stock: { gte: quantity },
            isActive: true,
          },
          data: { stock: { decrement: quantity } },
        });
        if (result.count !== 1) {
          throw new OrderRequestError(
            `Insufficient stock for ${product.name}`,
            409,
          );
        }
      }

      for (const line of lineItems) {
        if (!line.variant) continue;
        const result = await transaction.productVariant.updateMany({
          where: {
            id: line.variant.id,
            productId: line.product.id,
            stock: { gte: line.quantity },
          },
          data: { stock: { decrement: line.quantity } },
        });
        if (result.count !== 1) {
          throw new OrderRequestError(
            `Insufficient stock for ${line.product.name}`,
            409,
          );
        }
      }

      const subtotal = roundMoney(
        lineItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
      );
      let discountAmount = 0;
      let normalizedCouponCode: string | null = null;
      if (couponCode) {
        const now = new Date();
        const coupon = await transaction.coupon.findFirst({
          where: {
            code: { equals: couponCode, mode: "insensitive" },
          },
        });
        if (!coupon) {
          throw new OrderRequestError("Coupon is invalid or unavailable", 400);
        }
        const couponResult = calculateCouponDiscount(coupon, subtotal, now);
        if ("error" in couponResult) {
          throw new OrderRequestError(
            couponResult.error,
            couponResult.status,
          );
        }
        discountAmount = couponResult.discountAmount;

        const updatedCoupon = await transaction.coupon.updateMany({
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
        if (updatedCoupon.count !== 1) {
          throw new OrderRequestError("Coupon is no longer available", 409);
        }
        normalizedCouponCode = coupon.code;
      }

      const deliveryCharge =
        deliveryZone === "INSIDE_DHAKA"
          ? settings.deliveryChargeInside
          : settings.deliveryChargeOutside;
      const totalAmount = roundMoney(
        subtotal - discountAmount + deliveryCharge,
      );
      const orderNumber = `ORD-${Date.now()}-${randomUUID()
        .slice(0, 8)
        .toUpperCase()}`;

      return transaction.order.create({
        data: {
          orderNumber,
          userId: requestingUser?.id ?? null,
          customerName: customerName.trim(),
          customerPhone: normalizedCustomerPhone,
          customerEmail:
            typeof customerEmail === "string" && customerEmail.trim()
              ? customerEmail.trim()
              : null,
          deliveryAddress: deliveryAddress.trim(),
          deliveryZone,
          subtotal,
          discountAmount,
          couponCode: normalizedCouponCode,
          deliveryCharge,
          totalAmount,
          paymentMethod: normalizedPaymentMethod,
          items: {
            create: lineItems.map((item) => ({
              quantity: item.quantity,
              price: item.price,
              variantInfo: item.variant
                ? [
                    item.variant.size ? `Size: ${item.variant.size}` : null,
                    item.variant.color ? `Color: ${item.variant.color}` : null,
                  ]
                    .filter(Boolean)
                    .join(" | ") || null
                : null,
              product: { connect: { id: item.product.id } },
              ...(item.variant
                ? { variant: { connect: { id: item.variant.id } } }
                : {}),
            })),
          },
        },
        include: {
          items: {
            include: {
              product: { select: { name: true } },
            },
          },
        },
      });
    });

    const notificationResults = await Promise.allSettled([
      sendOrderSms({
        phone: order.customerPhone,
        type: "CONFIRMATION",
        variables: {
          customerName: order.customerName,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
        },
      }),
      sendOrderEmail({
        order,
        type: "CONFIRMATION",
      }),
    ]);

    notificationResults.forEach((result, index) => {
      const channel = index === 0 ? "SMS" : "email";
      if (result.status === "rejected") {
        console.error(`Order confirmation ${channel} failed:`, result.reason);
        return;
      }

      if (
        !result.value.sent &&
        result.value.reason !== "SMS gateway is disabled" &&
        result.value.reason !== "Email notifications are disabled" &&
        result.value.reason !== "Order confirmation emails disabled" &&
        result.value.reason !== "Customer did not provide an email address"
      ) {
        console.warn(`Order confirmation ${channel} was not sent:`, {
          orderNumber: order.orderNumber,
          reason: result.value.reason,
        });
      }
    });

    if (order.paymentMethod === "COD") {
      scheduleMetaPurchase(order.id, { includeRequestContext: true });
    }

    return Response.json(
      {
        orderNumber: order.orderNumber,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        deliveryCharge: order.deliveryCharge,
        couponCode: order.couponCode,
        items: order.items.map((item) => ({
          productId: item.productId,
          name: item.product.name,
          variantInfo: item.variantInfo,
          quantity: item.quantity,
          price: item.price,
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OrderRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Error creating order:", error);
    return Response.json(
      { error: "Failed to create order" },
      { status: 500 },
    );
  }
}
