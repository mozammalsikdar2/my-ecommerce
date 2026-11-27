import { z } from "zod";
import { encryptPaymentSecret, isPaymentEncryptionConfigured } from "@/lib/payment-secrets";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth-guard";
import { sendOrderEmail } from "@/lib/order-email";
import { prisma } from "@/lib/prisma";

const secretFields = [
  "smtpUser",
  "smtpPass",
  "resendApiKey",
] as const;

const allowedFields = new Set([
  "emailEnabled",
  "provider",
  "smtpHost",
  "smtpPort",
  "smtpSecure",
  "smtpUser",
  "smtpPass",
  "resendApiKey",
  "senderName",
  "senderEmail",
  "attachPdfInvoice",
  "sendOnOrderCreate",
  "sendOnStatusUpdate",
  "clearSmtpUser",
  "clearSmtpPass",
  "clearResendApiKey",
]);

function getEmailSettings() {
  return prisma.emailSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

function getPublicSettings(
  settings: Awaited<ReturnType<typeof getEmailSettings>>,
) {
  return {
    id: settings.id,
    emailEnabled: settings.emailEnabled,
    provider: settings.provider,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    smtpUserConfigured: Boolean(settings.smtpUser),
    smtpPassConfigured: Boolean(settings.smtpPass),
    resendApiKeyConfigured: Boolean(settings.resendApiKey),
    senderName: settings.senderName,
    senderEmail: settings.senderEmail,
    attachPdfInvoice: settings.attachPdfInvoice,
    sendOnOrderCreate: settings.sendOnOrderCreate,
    sendOnStatusUpdate: settings.sendOnStatusUpdate,
    encryptionConfigured: isPaymentEncryptionConfigured(),
    updatedAt: settings.updatedAt,
  };
}

export async function GET(request: Request) {
  const { errorResponse } = await requireRole(["ADMIN"], request);
  if (errorResponse) return errorResponse;

  try {
    const settings = await getEmailSettings();
    return Response.json(
      { settings: getPublicSettings(settings) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/admin/email error:", error);
    return Response.json(
      { error: "Failed to load email settings" },
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
  if (
    Object.keys(body).length === 0 ||
    Object.keys(body).some((field) => !allowedFields.has(field))
  ) {
    return Response.json(
      { error: "Provide supported email settings to update" },
      { status: 400 },
    );
  }

  const booleanFields = [
    "emailEnabled",
    "smtpSecure",
    "attachPdfInvoice",
    "sendOnOrderCreate",
    "sendOnStatusUpdate",
  ] as const;
  const clearFields = [
    "clearSmtpUser",
    "clearSmtpPass",
    "clearResendApiKey",
  ] as const;
  for (const field of booleanFields) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      return Response.json(
        { error: `${field} must be a boolean` },
        { status: 400 },
      );
    }
  }
  for (const field of clearFields) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      return Response.json(
        { error: `${field} must be a boolean` },
        { status: 400 },
      );
    }
  }

  if (
    body.provider !== undefined &&
    body.provider !== "SMTP" &&
    body.provider !== "RESEND"
  ) {
    return Response.json(
      { error: "provider must be SMTP or RESEND" },
      { status: 400 },
    );
  }
  if (
    body.smtpPort !== undefined &&
    (typeof body.smtpPort !== "number" ||
      !Number.isInteger(body.smtpPort) ||
      body.smtpPort < 1 ||
      body.smtpPort > 65535)
  ) {
    return Response.json(
      { error: "smtpPort must be an integer between 1 and 65535" },
      { status: 400 },
    );
  }

  const stringLimits = {
    smtpHost: 253,
    smtpUser: 320,
    smtpPass: 500,
    resendApiKey: 500,
    senderName: 100,
    senderEmail: 254,
  } as const;
  for (const [field, maxLength] of Object.entries(stringLimits)) {
    const value = body[field];
    if (
      value !== undefined &&
      (typeof value !== "string" ||
        value.length > maxLength ||
        /[\r\n]/.test(value))
    ) {
      return Response.json(
        { error: `${field} must be a valid string of at most ${maxLength} characters` },
        { status: 400 },
      );
    }
  }

  for (const field of secretFields) {
    if (
      body[field] !== undefined &&
      typeof body[field] === "string" &&
      body[field].trim().length > 500
    ) {
      return Response.json(
        { error: `${field} must be at most 500 characters` },
        { status: 400 },
      );
    }
  }

  if (
    body.senderEmail !== undefined &&
    typeof body.senderEmail === "string" &&
    body.senderEmail.trim() &&
    !z.string().email().safeParse(body.senderEmail.trim()).success
  ) {
    return Response.json(
      { error: "senderEmail must be a valid email address" },
      { status: 400 },
    );
  }

  const clearFlags = [
    ["clearSmtpUser", "smtpUser"],
    ["clearSmtpPass", "smtpPass"],
    ["clearResendApiKey", "resendApiKey"],
  ] as const;
  for (const [clearField, valueField] of clearFlags) {
    if (
      body[clearField] === true &&
      typeof body[valueField] === "string" &&
      body[valueField].trim()
    ) {
      return Response.json(
        { error: `Provide ${valueField} or clear it, not both` },
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
          "Configure PAYMENT_CREDENTIALS_ENCRYPTION_KEY before saving email credentials",
      },
      { status: 503 },
    );
  }

  try {
    const current = await getEmailSettings();
    const updates: {
      emailEnabled?: boolean;
      provider?: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpSecure?: boolean;
      smtpUser?: string;
      smtpPass?: string;
      resendApiKey?: string;
      senderName?: string;
      senderEmail?: string;
      attachPdfInvoice?: boolean;
      sendOnOrderCreate?: boolean;
      sendOnStatusUpdate?: boolean;
    } = {};

    for (const field of booleanFields) {
      if (field.startsWith("clear")) continue;
      if (typeof body[field] === "boolean") {
        updates[field] = body[field];
      }
    }
    if (body.provider === "SMTP" || body.provider === "RESEND") {
      updates.provider = body.provider;
    }
    if (typeof body.smtpHost === "string") {
      updates.smtpHost = body.smtpHost.trim();
    }
    if (typeof body.smtpPort === "number") updates.smtpPort = body.smtpPort;
    if (typeof body.senderName === "string") {
      updates.senderName = body.senderName.trim();
    }
    if (typeof body.senderEmail === "string") {
      updates.senderEmail = body.senderEmail.trim();
    }

    for (const [clearField, valueField] of clearFlags) {
      const submittedValue = body[valueField];
      if (body[clearField] === true) {
        updates[valueField] = "";
      } else if (typeof submittedValue === "string" && submittedValue.trim()) {
        updates[valueField] = encryptPaymentSecret(submittedValue.trim());
      }
    }

    const nextProvider = updates.provider ?? current.provider;
    const nextEmailEnabled = updates.emailEnabled ?? current.emailEnabled;
    const hasSmtpUser =
      updates.smtpUser !== undefined
        ? Boolean(updates.smtpUser)
        : Boolean(current.smtpUser);
    const hasSmtpPass =
      updates.smtpPass !== undefined
        ? Boolean(updates.smtpPass)
        : Boolean(current.smtpPass);
    const hasResendApiKey =
      updates.resendApiKey !== undefined
        ? Boolean(updates.resendApiKey)
        : Boolean(current.resendApiKey);
    const nextSenderEmail = updates.senderEmail ?? current.senderEmail;
    const nextSenderName = updates.senderName ?? current.senderName;

    if (nextEmailEnabled) {
      if (
        !nextSenderName ||
        !z.string().email().safeParse(nextSenderEmail).success
      ) {
        return Response.json(
          { error: "Set a valid sender name and sender email before enabling email" },
          { status: 400 },
        );
      }
      if (
        (nextProvider === "RESEND" && !hasResendApiKey) ||
        (nextProvider === "SMTP" &&
          (!updates.smtpHost && !current.smtpHost ||
            !hasSmtpUser ||
            !hasSmtpPass))
      ) {
        return Response.json(
          { error: "Complete the selected provider credentials before enabling email" },
          { status: 400 },
        );
      }
      if (!isPaymentEncryptionConfigured()) {
        return Response.json(
          {
            error:
              "Configure PAYMENT_CREDENTIALS_ENCRYPTION_KEY before enabling email",
          },
          { status: 503 },
        );
      }
    }

    const updated = await prisma.emailSettings.upsert({
      where: { id: 1 },
      update: updates,
      create: { id: 1, ...updates },
    });
    return Response.json(
      { settings: getPublicSettings(updated) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("PUT /api/admin/email error:", error);
    return Response.json(
      { error: "Failed to save email settings" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  const { errorResponse } = await requireRole(["ADMIN"], request);
  if (errorResponse) return errorResponse;

  const body = await readJsonBody(request);
  if (!isRecord(body) || typeof body.testEmail !== "string") {
    return Response.json(
      { error: "Please enter a recipient email address for testing" },
      { status: 400 },
    );
  }

  const testEmail = body.testEmail.trim();
  if (!z.string().email().safeParse(testEmail).success) {
    return Response.json(
      { error: "testEmail must be a valid email address" },
      { status: 400 },
    );
  }

  try {
    const result = await sendOrderEmail({
      type: "CONFIRMATION",
      test: true,
      order: {
        orderNumber: "ORD-TEST-2026",
        createdAt: new Date(),
        customerName: "Test Customer",
        customerPhone: "01711000000",
        customerEmail: testEmail,
        deliveryAddress: "House 12, Road 4, Dhanmondi, Dhaka",
        deliveryZone: "INSIDE_DHAKA",
        subtotal: 1200,
        discountAmount: 100,
        couponCode: "WELCOME100",
        deliveryCharge: 60,
        totalAmount: 1160,
        paymentMethod: "COD",
        paymentStatus: "UNPAID",
        orderStatus: "CONFIRMED",
        items: [
          {
            quantity: 1,
            price: 1200,
            variantInfo: "12ml / Gold Bottle",
            product: { name: "Royal Oud Attar Reserve" },
          },
        ],
      },
    });

    if (!result.sent) {
      return Response.json(
        { error: result.reason || "Test email failed; check email settings" },
        {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return Response.json(
      { message: `Test email sent to ${testEmail}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("POST /api/admin/email test error:", error);
    return Response.json(
      { error: "Error sending test email" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
