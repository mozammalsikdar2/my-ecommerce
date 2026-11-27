import { requireRole } from "@/lib/auth-guard";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import {
  encryptPaymentSecret,
  isPaymentEncryptionConfigured,
} from "@/lib/payment-secrets";
import { prisma } from "@/lib/prisma";

const allowedFields = new Set([
  "ga4Enabled",
  "ga4MeasurementId",
  "gtmEnabled",
  "gtmContainerId",
  "metaPixelEnabled",
  "metaPixelId",
  "metaCapiAccessToken",
  "metaTestEventCode",
  "clearMetaCapiAccessToken",
]);

function getMarketingSettings() {
  return prisma.marketingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

function publicAdminSettings(
  settings: Awaited<ReturnType<typeof getMarketingSettings>>,
) {
  return {
    id: settings.id,
    ga4Enabled: settings.ga4Enabled,
    ga4MeasurementId: settings.ga4MeasurementId,
    gtmEnabled: settings.gtmEnabled,
    gtmContainerId: settings.gtmContainerId,
    metaPixelEnabled: settings.metaPixelEnabled,
    metaPixelId: settings.metaPixelId,
    metaCapiAccessTokenConfigured: Boolean(settings.metaCapiAccessToken),
    metaTestEventCode: settings.metaTestEventCode,
    encryptionConfigured: isPaymentEncryptionConfigured(),
    updatedAt: settings.updatedAt,
  };
}

export async function GET(request: Request) {
  const { errorResponse } = await requireRole(["ADMIN"], request);
  if (errorResponse) return errorResponse;

  try {
    const settings = await getMarketingSettings();
    return Response.json(
      { settings: publicAdminSettings(settings) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/admin/marketing error:", error);
    return Response.json(
      { error: "Failed to load marketing settings" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PUT(request: Request) {
  const { errorResponse } = await requireRole(["ADMIN"], request);
  if (errorResponse) return errorResponse;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }
  if (Object.keys(body).length === 0) {
    return Response.json(
      { error: "Provide at least one setting to update" },
      { status: 400 },
    );
  }
  if (Object.keys(body).some((field) => !allowedFields.has(field))) {
    return Response.json(
      { error: "Request contains an unsupported field" },
      { status: 400 },
    );
  }

  for (const field of ["ga4Enabled", "gtmEnabled", "metaPixelEnabled"]) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      return Response.json(
        { error: `${field} must be a boolean` },
        { status: 400 },
      );
    }
  }
  if (
    body.clearMetaCapiAccessToken !== undefined &&
    typeof body.clearMetaCapiAccessToken !== "boolean"
  ) {
    return Response.json(
      { error: "clearMetaCapiAccessToken must be a boolean" },
      { status: 400 },
    );
  }

  const stringLimits = {
    ga4MeasurementId: 50,
    gtmContainerId: 50,
    metaPixelId: 50,
    metaCapiAccessToken: 4000,
    metaTestEventCode: 100,
  } as const;
  for (const [field, maxLength] of Object.entries(stringLimits)) {
    const value = body[field];
    if (
      value !== undefined &&
      (typeof value !== "string" || value.length > maxLength)
    ) {
      return Response.json(
        { error: `${field} must be a string of at most ${maxLength} characters` },
        { status: 400 },
      );
    }
  }

  const ga4MeasurementId =
    typeof body.ga4MeasurementId === "string"
      ? body.ga4MeasurementId.trim()
      : undefined;
  if (ga4MeasurementId && !/^G-[A-Z0-9]+$/.test(ga4MeasurementId)) {
    return Response.json(
      { error: "ga4MeasurementId must use the format G-XXXXXXXXXX" },
      { status: 400 },
    );
  }
  const gtmContainerId =
    typeof body.gtmContainerId === "string"
      ? body.gtmContainerId.trim()
      : undefined;
  if (gtmContainerId && !/^GTM-[A-Z0-9]+$/.test(gtmContainerId)) {
    return Response.json(
      { error: "gtmContainerId must use the format GTM-XXXXXXX" },
      { status: 400 },
    );
  }

  const metaPixelId =
    typeof body.metaPixelId === "string"
      ? body.metaPixelId.trim()
      : undefined;
  if (metaPixelId && !/^\d{1,50}$/.test(metaPixelId)) {
    return Response.json(
      { error: "metaPixelId must contain only digits" },
      { status: 400 },
    );
  }

  const submittedToken =
    typeof body.metaCapiAccessToken === "string"
      ? body.metaCapiAccessToken.trim()
      : "";
  const shouldClearToken = body.clearMetaCapiAccessToken === true;
  if (shouldClearToken && submittedToken) {
    return Response.json(
      { error: "Provide a token or clear it, not both" },
      { status: 400 },
    );
  }
  if (submittedToken && !isPaymentEncryptionConfigured()) {
    return Response.json(
      {
        error:
          "Configure PAYMENT_CREDENTIALS_ENCRYPTION_KEY before saving the CAPI token",
      },
      { status: 503 },
    );
  }

  try {
    const current = await getMarketingSettings();
    const nextGa4Enabled =
      typeof body.ga4Enabled === "boolean" ? body.ga4Enabled : current.ga4Enabled;
    const nextGtmEnabled =
      typeof body.gtmEnabled === "boolean" ? body.gtmEnabled : current.gtmEnabled;
    if (nextGa4Enabled && !(ga4MeasurementId ?? current.ga4MeasurementId)) {
      return Response.json(
        { error: "Enter a measurement ID before enabling GA4" },
        { status: 400 },
      );
    }
    if (nextGtmEnabled && !(gtmContainerId ?? current.gtmContainerId)) {
      return Response.json(
        { error: "Enter a container ID before enabling GTM" },
        { status: 400 },
      );
    }
    const nextPixelEnabled =
      typeof body.metaPixelEnabled === "boolean"
        ? body.metaPixelEnabled
        : current.metaPixelEnabled;
    const nextPixelId = metaPixelId ?? current.metaPixelId;
    if (nextPixelEnabled && !nextPixelId) {
      return Response.json(
        { error: "Enter a Pixel ID before enabling Meta Pixel" },
        { status: 400 },
      );
    }

    const updated = await prisma.marketingSettings.update({
      where: { id: 1 },
      data: {
        ga4Enabled: nextGa4Enabled,
        ...(ga4MeasurementId !== undefined ? { ga4MeasurementId } : {}),
        gtmEnabled: nextGtmEnabled,
        ...(gtmContainerId !== undefined ? { gtmContainerId } : {}),
        metaPixelEnabled: nextPixelEnabled,
        ...(metaPixelId !== undefined ? { metaPixelId } : {}),
        ...(typeof body.metaTestEventCode === "string"
          ? { metaTestEventCode: body.metaTestEventCode.trim() }
          : {}),
        ...(shouldClearToken
          ? { metaCapiAccessToken: "" }
          : submittedToken
            ? { metaCapiAccessToken: encryptPaymentSecret(submittedToken) }
            : {}),
      },
    });

    return Response.json(
      { settings: publicAdminSettings(updated) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("PUT /api/admin/marketing error:", error);
    return Response.json(
      { error: "Failed to save marketing settings" },
      { status: 500 },
    );
  }
}
