import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await connection();
  try {
    const settings = await prisma.marketingSettings.findUnique({
      where: { id: 1 },
      select: {
        metaPixelEnabled: true,
        metaPixelId: true,
      },
    });
    const enabled = Boolean(settings?.metaPixelEnabled && settings.metaPixelId);

    return Response.json(
      {
        enabled,
        pixelId: enabled ? settings?.metaPixelId : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/marketing/pixel error:", error);
    return Response.json(
      { error: "Failed to load the public Pixel ID" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
