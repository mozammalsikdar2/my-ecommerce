import { isRecord, readJsonBody } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth-guard";
import {
  encryptPaymentSecret,
  isPaymentEncryptionConfigured,
} from "@/lib/payment-secrets";
import { prisma } from "@/lib/prisma";

const secretFields = [
  "bkashAppKey",
  "bkashAppSecret",
  "bkashUsername",
  "bkashPassword",
  "stripeSecretKey",
] as const;

function getPublicSettings(
  settings: Awaited<ReturnType<typeof getPaymentSettings>>,
) {
  return {
    codEnabled: settings.codEnabled,
    bkashEnabled: settings.bkashEnabled,
    bkashSandbox: settings.bkashSandbox,
    bkashAppKeyConfigured: Boolean(settings.bkashAppKey),
    bkashAppSecretConfigured: Boolean(settings.bkashAppSecret),
    bkashUsernameConfigured: Boolean(settings.bkashUsername),
    bkashPasswordConfigured: Boolean(settings.bkashPassword),
    stripeEnabled: settings.stripeEnabled,
    stripePublishableKey: settings.stripePublishableKey,
    stripeSecretKeyConfigured: Boolean(settings.stripeSecretKey),
    stripeCurrency: settings.stripeCurrency,
    nagadEnabled: false,
    sslEnabled: false,
    encryptionConfigured: isPaymentEncryptionConfigured(),
  };
}

function getPaymentSettings() {
  return prisma.paymentSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

export async function GET(request: Request) {
  const { errorResponse } = await requireRole(["ADMIN"], request);
  if (errorResponse) return errorResponse;

  try {
    const settings = await getPaymentSettings();
    return Response.json(
      { settings: getPublicSettings(settings) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/admin/payments error:", error);
    return Response.json(
      { error: "Failed to load payment settings" },
      { status: 500 },
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

  for (const field of ["codEnabled", "bkashEnabled", "bkashSandbox", "stripeEnabled"]) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      return Response.json(
        { error: `${field} must be a boolean` },
        { status: 400 },
      );
    }
  }
  for (const field of [...secretFields, "stripePublishableKey"] as const) {
    if (
      body[field] !== undefined &&
      (typeof body[field] !== "string" || body[field].length > 500)
    ) {
      return Response.json(
        { error: `${field} must be a string of at most 500 characters` },
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
  if (
    body.stripeCurrency !== undefined &&
    (typeof body.stripeCurrency !== "string" ||
      body.stripeCurrency.toLowerCase() !== "bdt")
  ) {
    return Response.json(
      { error: "Stripe currency must be BDT for this store" },
      { status: 400 },
    );
  }

  try {
    const current = await getPaymentSettings();
    const nextBkashEnabled =
      typeof body.bkashEnabled === "boolean"
        ? body.bkashEnabled
        : current.bkashEnabled;
    const nextStripeEnabled =
      typeof body.stripeEnabled === "boolean"
        ? body.stripeEnabled
        : current.stripeEnabled;
    if (
      (nextBkashEnabled || nextStripeEnabled) &&
      !isPaymentEncryptionConfigured()
    ) {
      return Response.json(
        {
          error:
            "Configure PAYMENT_CREDENTIALS_ENCRYPTION_KEY before enabling online payments",
        },
        { status: 503 },
      );
    }
    const hasSubmittedSecret = (field: (typeof secretFields)[number]) =>
      typeof body[field] === "string" && Boolean(body[field].trim());

    if (
      nextBkashEnabled &&
      !(
        (current.bkashAppKey || hasSubmittedSecret("bkashAppKey")) &&
        (current.bkashAppSecret || hasSubmittedSecret("bkashAppSecret")) &&
        (current.bkashUsername || hasSubmittedSecret("bkashUsername")) &&
        (current.bkashPassword || hasSubmittedSecret("bkashPassword"))
      )
    ) {
      return Response.json(
        { error: "Enter all bKash credentials before enabling bKash" },
        { status: 400 },
      );
    }
    if (
      nextStripeEnabled &&
      !(
        (current.stripeSecretKey || hasSubmittedSecret("stripeSecretKey")) &&
        (current.stripePublishableKey ||
          (typeof body.stripePublishableKey === "string" &&
            Boolean(body.stripePublishableKey.trim())))
      )
    ) {
      return Response.json(
        {
          error:
            "Enter the Stripe publishable and secret keys before enabling Stripe",
        },
        { status: 400 },
      );
    }

    const updates: {
      codEnabled?: boolean;
      bkashEnabled?: boolean;
      bkashSandbox?: boolean;
      bkashAppKey?: string;
      bkashAppSecret?: string;
      bkashUsername?: string;
      bkashPassword?: string;
      stripeEnabled?: boolean;
      stripePublishableKey?: string;
      stripeSecretKey?: string;
      stripeCurrency?: string;
      nagadEnabled: false;
      sslEnabled: false;
    } = {
      nagadEnabled: false,
      sslEnabled: false,
    };

    if (typeof body.codEnabled === "boolean") {
      updates.codEnabled = body.codEnabled;
    }
    if (typeof body.bkashEnabled === "boolean") {
      updates.bkashEnabled = body.bkashEnabled;
    }
    if (typeof body.bkashSandbox === "boolean") {
      updates.bkashSandbox = body.bkashSandbox;
    }
    if (typeof body.stripeEnabled === "boolean") {
      updates.stripeEnabled = body.stripeEnabled;
    }
    if (typeof body.stripePublishableKey === "string") {
      updates.stripePublishableKey = body.stripePublishableKey.trim();
    }
    if (typeof body.stripeCurrency === "string") {
      updates.stripeCurrency = body.stripeCurrency.toLowerCase();
    }

    for (const field of secretFields) {
      const submittedValue = body[field];
      if (typeof submittedValue !== "string" || !submittedValue.trim()) continue;
      updates[field] = encryptPaymentSecret(submittedValue.trim());
    }

    const settings = await prisma.paymentSettings.upsert({
      where: { id: 1 },
      update: updates,
      create: {
        id: 1,
        ...updates,
      },
    });

    return Response.json(
      { settings: getPublicSettings(settings) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("PUT /api/admin/payments error:", error);
    return Response.json(
      { error: "Failed to update payment settings" },
      { status: 500 },
    );
  }
}
