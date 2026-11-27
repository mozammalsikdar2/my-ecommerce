import { prisma } from "@/lib/prisma";

export async function getMarketingSettings() {
  return prisma.marketingSettings.findUnique({
    where: { id: 1 },
    select: {
      ga4Enabled: true,
      ga4MeasurementId: true,
      gtmEnabled: true,
      gtmContainerId: true,
    },
  });
}
