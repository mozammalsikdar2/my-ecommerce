import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guard";

const ranges = ["7d", "30d", "all"] as const;
type DashboardRange = (typeof ranges)[number];

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isDashboardRange(value: string): value is DashboardRange {
  return ranges.some((range) => range === value);
}

export async function GET(request: Request) {
  const { errorResponse } = await requireRole(
    ["ADMIN", "MODERATOR"],
    request,
  );
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const rangeValue = searchParams.get("range") ?? "30d";
  if (!isDashboardRange(rangeValue)) {
    return Response.json(
      { error: "range must be 7d, 30d, or all" },
      { status: 400 },
    );
  }

  try {
    const now = new Date();
    const startDate =
      rangeValue === "all"
        ? undefined
        : new Date(
            now.getTime() -
              (rangeValue === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000,
          );
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const chartDays = rangeValue === "7d" ? 7 : 14;
    const chartStart = new Date(today);
    chartStart.setUTCDate(chartStart.getUTCDate() - (chartDays - 1));
    const orderWhere = startDate
      ? { createdAt: { gte: startDate } }
      : undefined;

    const [orders, lowStockProducts, lowStockCount, totalCustomers] =
      await Promise.all([
        prisma.order.findMany({
          where: orderWhere,
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            customerPhone: true,
            deliveryZone: true,
            totalAmount: true,
            orderStatus: true,
            paymentStatus: true,
            paymentMethod: true,
            discountAmount: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                productId: true,
                quantity: true,
                price: true,
                variantInfo: true,
                product: {
                  select: { id: true, name: true, image: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.product.findMany({
          where: { isActive: true, stock: { lte: 5 } },
          select: {
            id: true,
            name: true,
            slug: true,
            stock: true,
            price: true,
            image: true,
          },
          orderBy: [{ stock: "asc" }, { name: "asc" }],
          take: 6,
        }),
        prisma.product.count({
          where: { isActive: true, stock: { lte: 5 } },
        }),
        prisma.user.count({ where: { role: "CUSTOMER" } }),
      ]);

    const statusCounts = {
      PENDING: 0,
      CONFIRMED: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    };
    let totalSales = 0;
    let paidRevenue = 0;
    let unpaidRevenue = 0;
    let unpaidCodRevenue = 0;
    let totalDiscounts = 0;
    const productSales = new Map<
      string,
      { id: string; name: string; image: string; unitsSold: number; revenue: number }
    >();

    for (const order of orders) {
      if (Object.hasOwn(statusCounts, order.orderStatus)) {
        statusCounts[order.orderStatus as keyof typeof statusCounts] += 1;
      }
      if (order.orderStatus === "CANCELLED") continue;

      totalSales += order.totalAmount;
      totalDiscounts += order.discountAmount;
      if (order.paymentStatus === "PAID") {
        paidRevenue += order.totalAmount;
      } else {
        unpaidRevenue += order.totalAmount;
        if (order.paymentMethod === "COD") {
          unpaidCodRevenue += order.totalAmount;
        }
      }

      for (const item of order.items) {
        const existing = productSales.get(item.productId);
        const itemRevenue = item.price * item.quantity;
        if (existing) {
          existing.unitsSold += item.quantity;
          existing.revenue += itemRevenue;
        } else {
          productSales.set(item.productId, {
            id: item.productId,
            name: item.product.name,
            image: item.product.image,
            unitsSold: item.quantity,
            revenue: itemRevenue,
          });
        }
      }
    }

    const dailySales = Array.from({ length: chartDays }, (_, index) => {
      const date = new Date(chartStart);
      date.setUTCDate(chartStart.getUTCDate() + index);
      return {
        date: date.toISOString().slice(0, 10),
        label: new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(date),
        orderCount: 0,
        revenue: 0,
      };
    });
    const dailySalesByDate = new Map(
      dailySales.map((day) => [day.date, day]),
    );
    for (const order of orders) {
      const day = dailySalesByDate.get(order.createdAt.toISOString().slice(0, 10));
      if (!day) continue;
      day.orderCount += 1;
      if (order.orderStatus !== "CANCELLED") {
        day.revenue += order.totalAmount;
      }
    }
    for (const day of dailySales) {
      day.revenue = roundMoney(day.revenue);
    }

    const activeOrders =
      statusCounts.PENDING + statusCounts.CONFIRMED + statusCounts.SHIPPED;
    const kpis = {
      totalSales: roundMoney(totalSales),
      paidRevenue: roundMoney(paidRevenue),
      unpaidRevenue: roundMoney(unpaidRevenue),
      unpaidCodRevenue: roundMoney(unpaidCodRevenue),
      totalDiscounts: roundMoney(totalDiscounts),
      totalOrders: orders.length,
      activeOrders,
      totalCustomers,
      lowStockCount,
    };
    const topProducts = Array.from(productSales.values())
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 5)
      .map((product) => ({
        ...product,
        revenue: roundMoney(product.revenue),
      }));

    return Response.json(
      {
        generatedAt: now.toISOString(),
        range: rangeValue,
        kpis,
        summary: {
          totalOrders: kpis.totalOrders,
          pendingOrders: statusCounts.PENDING,
          confirmedOrders: statusCounts.CONFIRMED,
          totalRevenue: kpis.totalSales,
          lowStockCount,
          paidRevenue: kpis.paidRevenue,
          unpaidRevenue: kpis.unpaidRevenue,
          totalDiscounts: kpis.totalDiscounts,
          totalCustomers,
          activeOrders,
        },
        statusCounts,
        dailySales,
        topProducts,
        lowStockProducts,
        recentOrders: orders.slice(0, 20),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Admin dashboard GET error:", error);
    return Response.json(
      { error: "Failed to load dashboard data" },
      { status: 500 },
    );
  }
}
