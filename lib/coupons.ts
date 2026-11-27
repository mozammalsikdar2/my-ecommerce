import type { Coupon } from "@prisma/client";

export function calculateCouponDiscount(
  coupon: Coupon,
  subtotal: number,
  now = new Date(),
): { discountAmount: number } | { error: string; status: number } {
  if (!coupon.isActive) {
    return { error: "Invalid or inactive coupon code", status: 400 };
  }
  if (coupon.expiresAt !== null && coupon.expiresAt <= now) {
    return { error: "This coupon code has expired", status: 400 };
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return {
      error: "This coupon has reached its maximum usage limit",
      status: 400,
    };
  }
  if (
    !Number.isFinite(coupon.discountValue) ||
    coupon.discountValue <= 0 ||
    (coupon.discountType === "PERCENTAGE" && coupon.discountValue > 100) ||
    !Number.isFinite(coupon.minOrderAmount) ||
    coupon.minOrderAmount < 0 ||
    (coupon.maxDiscount !== null &&
      (!Number.isFinite(coupon.maxDiscount) || coupon.maxDiscount < 0))
  ) {
    return { error: "Coupon has invalid discount settings", status: 400 };
  }
  if (subtotal < coupon.minOrderAmount) {
    return {
      error: `Minimum order of ৳${coupon.minOrderAmount} required for this coupon`,
      status: 400,
    };
  }

  const rawDiscount =
    coupon.discountType === "PERCENTAGE"
      ? (subtotal * coupon.discountValue) / 100
      : coupon.discountValue;
  const cappedDiscount =
    coupon.discountType === "PERCENTAGE" && coupon.maxDiscount !== null
      ? Math.min(rawDiscount, coupon.maxDiscount)
      : rawDiscount;
  return {
    discountAmount:
      Math.round((Math.min(subtotal, cappedDiscount) + Number.EPSILON) * 100) /
      100,
  };
}
