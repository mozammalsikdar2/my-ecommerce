import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function deleteProduct(id: string) {
  try {
    const product = await prisma.product.delete({ where: { id } });
    return Response.json(product);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return Response.json({ error: "Product not found" }, { status: 404 });
      }
      if (error.code === "P2003") {
        return Response.json(
          { error: "Product cannot be deleted because it belongs to an order" },
          { status: 409 },
        );
      }
    }
    throw error;
  }
}
