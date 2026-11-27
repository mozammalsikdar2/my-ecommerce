import { checkMemoryBurstLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export async function checkCheckoutRateLimit(normalizedPhone: string): Promise<{
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}> {
  const burst = checkMemoryBurstLimit(`checkout_phone:${normalizedPhone}`);
  if (!burst.allowed) {
    return {
      allowed: false,
      reason: `Too many checkout attempts. Please wait ${burst.retryAfterSeconds} seconds and try again.`,
      retryAfterSeconds: burst.retryAfterSeconds,
    };
  }

  const now = new Date();
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  const [recentOrderCount, dailyOrderCount] = await Promise.all([
    prisma.order.count({
      where: {
        customerPhone: normalizedPhone,
        createdAt: { gte: fifteenMinutesAgo },
        orderStatus: { not: "CANCELLED" },
      },
    }),
    prisma.order.count({
      where: {
        customerPhone: normalizedPhone,
        createdAt: { gte: twentyFourHoursAgo },
        orderStatus: { not: "CANCELLED" },
      },
    }),
  ]);

  if (recentOrderCount >= 2) {
    return {
      allowed: false,
      reason:
        "Order limit reached for this phone number. Please wait 15 minutes before placing another order.",
      retryAfterSeconds: 900,
    };
  }

  if (dailyOrderCount >= 5) {
    return {
      allowed: false,
      reason:
        "Maximum daily order limit reached for this phone number. Contact support if you need bulk ordering.",
      retryAfterSeconds: 3600,
    };
  }

  const recentPendingOrder = await prisma.order.findFirst({
    where: {
      customerPhone: normalizedPhone,
      orderStatus: "PENDING",
      createdAt: { gte: tenMinutesAgo },
    },
    select: { orderNumber: true },
  });

  if (recentPendingOrder) {
    return {
      allowed: false,
      reason: `You already have a pending order (${recentPendingOrder.orderNumber}) placed within the last 10 minutes. Please wait before submitting again.`,
      retryAfterSeconds: 600,
    };
  }

  return { allowed: true };
}
