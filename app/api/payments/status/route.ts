import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderNumber = searchParams.get("order")?.trim() ?? "";
  if (!orderNumber) {
    return Response.json({ error: "order is required" }, { status: 400 });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: {
        paymentMethod: true,
        paymentStatus: true,
        orderStatus: true,
      },
    });
    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    return Response.json(order, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /api/payments/status error:", error);
    return Response.json(
      { error: "Unable to load payment status" },
      { status: 500 },
    );
  }
}
