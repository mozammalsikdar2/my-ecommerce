import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth-guard";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import {
  encryptPaymentSecret,
  isPaymentEncryptionConfigured,
} from "@/lib/payment-secrets";
import { prisma } from "@/lib/prisma";

const secretFields = [
  "steadfastApiKey",
  "steadfastSecretKey",
  "pathaoClientId",
  "pathaoClientSecret",
  "pathaoUsername",
  "pathaoPassword",
  "steadfastWebhookSecret",
  "pathaoWebhookSecret",
  "smsApiKey",
] as const;

function getPublicSettings(
  settings: Awaited<ReturnType<typeof getLogisticsSettings>>,
) {
  return {
    id: settings.id,
    steadfastEnabled: settings.steadfastEnabled,
    steadfastApiKeyConfigured: Boolean(settings.steadfastApiKey),
    steadfastSecretKeyConfigured: Boolean(settings.steadfastSecretKey),
    steadfastWebhookSecretConfigured: Boolean(settings.steadfastWebhookSecret),
    pathaoEnabled: settings.pathaoEnabled,
    pathaoSandbox: settings.pathaoSandbox,
    pathaoClientIdConfigured: Boolean(settings.pathaoClientId),
    pathaoClientSecretConfigured: Boolean(settings.pathaoClientSecret),
    pathaoUsernameConfigured: Boolean(settings.pathaoUsername),
    pathaoPasswordConfigured: Boolean(settings.pathaoPassword),
    pathaoWebhookSecretConfigured: Boolean(settings.pathaoWebhookSecret),
    pathaoStoreId: settings.pathaoStoreId,
    pathaoDefaultCityId: settings.pathaoDefaultCityId,
    pathaoDefaultZoneId: settings.pathaoDefaultZoneId,
    smsEnabled: settings.smsEnabled,
    smsProvider: settings.smsProvider,
    smsApiUrl: settings.smsApiUrl,
    smsApiKeyConfigured: Boolean(settings.smsApiKey),
    smsSenderId: settings.smsSenderId,
    orderConfirmTemplate: settings.orderConfirmTemplate,
    orderShippedTemplate: settings.orderShippedTemplate,
    encryptionConfigured: isPaymentEncryptionConfigured(),
    updatedAt: settings.updatedAt,
  };
}

function getLogisticsSettings() {
  return prisma.logisticsSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

export async function GET(request: Request) {
  const { errorResponse } = await requireRole(["ADMIN"], request);
  if (errorResponse) return errorResponse;

  try {
    const settings = await getLogisticsSettings();
    return Response.json(
      { settings: getPublicSettings(settings) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/admin/logistics error:", error);
    return Response.json(
      { error: "Failed to load courier and SMS settings" },
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

  const booleanFields = [
    "steadfastEnabled",
    "pathaoEnabled",
    "pathaoSandbox",
    "smsEnabled",
  ] as const;
  for (const field of booleanFields) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      return Response.json(
        { error: `${field} must be a boolean` },
        { status: 400 },
      );
    }
  }

  const stringLimits = {
    ...Object.fromEntries(secretFields.map((field) => [field, 500])),
    smsProvider: 32,
    smsApiUrl: 2000,
    smsSenderId: 100,
    orderConfirmTemplate: 2000,
    orderShippedTemplate: 2000,
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

  const integerFields = [
    "pathaoStoreId",
    "pathaoDefaultCityId",
    "pathaoDefaultZoneId",
  ] as const;
  for (const field of integerFields) {
    const value = body[field];
    if (
      value !== undefined &&
      (typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0)
    ) {
      return Response.json(
        { error: `${field} must be a non-negative integer` },
        { status: 400 },
      );
    }
  }

  if (
    body.smsProvider !== undefined &&
    body.smsProvider !== "BULKSMSBD" &&
    body.smsProvider !== "CUSTOM_GET"
  ) {
    return Response.json(
      { error: "smsProvider must be BULKSMSBD or CUSTOM_GET" },
      { status: 400 },
    );
  }

  let smsApiUrl: string | undefined;
  if (typeof body.smsApiUrl === "string") {
    smsApiUrl = body.smsApiUrl.trim();
    try {
      const url = new URL(smsApiUrl);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error("SMS gateway URL must not include credentials or query parameters");
      }
    } catch {
      return Response.json(
        { error: "smsApiUrl must be an HTTPS URL without credentials or query parameters" },
        { status: 400 },
      );
    }
  }

  const hasSecretInput = secretFields.some(
    (field) =>
      typeof body[field] === "string" && Boolean(body[field].trim()),
  );
  if (hasSecretInput && !isPaymentEncryptionConfigured()) {
    return Response.json(
      {
        error:
          "Configure PAYMENT_CREDENTIALS_ENCRYPTION_KEY before saving provider credentials",
      },
      { status: 503 },
    );
  }

  try {
    const current = await getLogisticsSettings();
    const nextSteadfastEnabled =
      typeof body.steadfastEnabled === "boolean"
        ? body.steadfastEnabled
        : current.steadfastEnabled;
    const nextPathaoEnabled =
      typeof body.pathaoEnabled === "boolean"
        ? body.pathaoEnabled
        : current.pathaoEnabled;
    const nextSmsEnabled =
      typeof body.smsEnabled === "boolean"
        ? body.smsEnabled
        : current.smsEnabled;
    const nextSmsProvider =
      typeof body.smsProvider === "string"
        ? body.smsProvider
        : current.smsProvider;
    const nextSmsApiUrl = smsApiUrl ?? current.smsApiUrl;
    const nextPathaoStoreId =
      typeof body.pathaoStoreId === "number"
        ? body.pathaoStoreId
        : current.pathaoStoreId;
    const submitted = (field: (typeof secretFields)[number]) =>
      typeof body[field] === "string" && Boolean(body[field].trim());
    const available = (field: (typeof secretFields)[number]) =>
      Boolean(current[field]) || submitted(field);

    if (
      (nextSteadfastEnabled || nextPathaoEnabled || nextSmsEnabled) &&
      !isPaymentEncryptionConfigured()
    ) {
      return Response.json(
        {
          error:
            "Configure PAYMENT_CREDENTIALS_ENCRYPTION_KEY before enabling courier or SMS integrations",
        },
        { status: 503 },
      );
    }
    if (
      nextSteadfastEnabled &&
      !(
        available("steadfastApiKey") &&
        available("steadfastSecretKey")
      )
    ) {
      return Response.json(
        { error: "Enter both Steadfast credentials before enabling it" },
        { status: 400 },
      );
    }
    if (
      nextPathaoEnabled &&
      !(
        available("pathaoClientId") &&
        available("pathaoClientSecret") &&
        available("pathaoUsername") &&
        available("pathaoPassword") &&
        nextPathaoStoreId > 0
      )
    ) {
      return Response.json(
        { error: "Enter all Pathao credentials and a valid store ID before enabling it" },
        { status: 400 },
      );
    }
    if (
      nextSmsEnabled &&
      !(
        available("smsApiKey") &&
        (nextSmsProvider !== "CUSTOM_GET" ||
          (nextSmsApiUrl !== "https://bulksmsbd.net/api/smsapi" &&
            Boolean(nextSmsApiUrl)))
      )
    ) {
      return Response.json(
        { error: "Enter an SMS API key and configure the selected gateway before enabling SMS" },
        { status: 400 },
      );
    }

    const updates: Prisma.LogisticsSettingsUpdateInput = {};
    for (const field of booleanFields) {
      if (typeof body[field] === "boolean") {
        updates[field] = body[field];
      }
    }
    if (typeof body.smsProvider === "string") {
      updates.smsProvider = body.smsProvider;
    }
    if (smsApiUrl !== undefined) updates.smsApiUrl = smsApiUrl;
    for (const field of [
      "smsSenderId",
      "orderConfirmTemplate",
      "orderShippedTemplate",
    ] as const) {
      if (typeof body[field] === "string") {
        updates[field] = body[field];
      }
    }
    if (typeof body.pathaoStoreId === "number") {
      updates.pathaoStoreId = body.pathaoStoreId;
    }
    if (typeof body.pathaoDefaultCityId === "number") {
      updates.pathaoDefaultCityId = body.pathaoDefaultCityId;
    }
    if (typeof body.pathaoDefaultZoneId === "number") {
      updates.pathaoDefaultZoneId = body.pathaoDefaultZoneId;
    }
    if (typeof body.steadfastApiKey === "string" && body.steadfastApiKey.trim()) {
      updates.steadfastApiKey = encryptPaymentSecret(
        body.steadfastApiKey.trim(),
      );
    }
    if (
      typeof body.steadfastSecretKey === "string" &&
      body.steadfastSecretKey.trim()
    ) {
      updates.steadfastSecretKey = encryptPaymentSecret(
        body.steadfastSecretKey.trim(),
      );
    }
    if (typeof body.pathaoClientId === "string" && body.pathaoClientId.trim()) {
      updates.pathaoClientId = encryptPaymentSecret(body.pathaoClientId.trim());
    }
    if (
      typeof body.pathaoClientSecret === "string" &&
      body.pathaoClientSecret.trim()
    ) {
      updates.pathaoClientSecret = encryptPaymentSecret(
        body.pathaoClientSecret.trim(),
      );
    }
    if (typeof body.pathaoUsername === "string" && body.pathaoUsername.trim()) {
      updates.pathaoUsername = encryptPaymentSecret(body.pathaoUsername.trim());
    }
    if (typeof body.pathaoPassword === "string" && body.pathaoPassword.trim()) {
      updates.pathaoPassword = encryptPaymentSecret(body.pathaoPassword.trim());
    }
    if (
      typeof body.steadfastWebhookSecret === "string" &&
      body.steadfastWebhookSecret.trim()
    ) {
      updates.steadfastWebhookSecret = encryptPaymentSecret(
        body.steadfastWebhookSecret.trim(),
      );
    }
    if (
      typeof body.pathaoWebhookSecret === "string" &&
      body.pathaoWebhookSecret.trim()
    ) {
      updates.pathaoWebhookSecret = encryptPaymentSecret(
        body.pathaoWebhookSecret.trim(),
      );
    }
    if (typeof body.smsApiKey === "string" && body.smsApiKey.trim()) {
      updates.smsApiKey = encryptPaymentSecret(body.smsApiKey.trim());
    }

    const settings = await prisma.logisticsSettings.update({
      where: { id: 1 },
      data: updates,
    });

    return Response.json(
      { settings: getPublicSettings(settings) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("PUT /api/admin/logistics error:", error);
    return Response.json(
      { error: "Failed to save courier and SMS settings" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
