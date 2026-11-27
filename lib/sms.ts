import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { validateBangladeshiPhone } from "@/lib/bd-phone";
import { decryptPaymentSecret } from "@/lib/payment-secrets";
import { getPublicAppUrl } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

type SmsResult =
  | { sent: true; providerCode?: string }
  | { sent: false; reason: string };
type LogisticsSettings = NonNullable<
  Awaited<ReturnType<typeof prisma.logisticsSettings.findUnique>>
>;

function isPublicIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return false;
  }
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPublicIpv6(address: string) {
  const normalized = address.toLowerCase();
  const firstGroup = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (
    firstGroup >= 0x2000 &&
    firstGroup <= 0x3fff &&
    !normalized.startsWith("2001:db8:") &&
    !normalized.startsWith("2002:")
  );
}

function isPublicAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

async function validateSmsEndpoint(value: string, provider: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    isIP(url.hostname)
  ) {
    throw new Error("SMS endpoint must be a public HTTPS hostname");
  }
  if (
    provider === "BULKSMSBD" &&
    url.hostname !== "bulksmsbd.net" &&
    !url.hostname.endsWith(".bulksmsbd.net")
  ) {
    throw new Error("BulkSMSBD endpoint host is not allowed");
  }

  const addresses = await lookup(url.hostname, {
    all: true,
    verbatim: true,
  });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new Error("SMS endpoint must resolve only to public IP addresses");
  }
  return url;
}

function normalizeBdPhone(phone: string) {
  const result = validateBangladeshiPhone(phone);
  return result.valid && result.normalized ? `88${result.normalized}` : null;
}

async function sendSmsMessage(
  logistics: LogisticsSettings | null,
  formattedNumber: string,
  message: string,
): Promise<SmsResult> {
  if (!logistics?.smsEnabled) {
    return { sent: false, reason: "SMS gateway is disabled" };
  }
  let smsApiKey: string;
  try {
    smsApiKey = decryptPaymentSecret(logistics.smsApiKey);
  } catch (error) {
    console.error("Unable to decrypt SMS API key:", error);
    return { sent: false, reason: "SMS API key is unavailable" };
  }
  if (!smsApiKey.trim()) {
    return { sent: false, reason: "SMS API key is missing" };
  }
  if (
    logistics.smsProvider !== "BULKSMSBD" &&
    logistics.smsProvider !== "CUSTOM_GET"
  ) {
    return { sent: false, reason: "Unsupported SMS provider" };
  }
  if (
    logistics.smsProvider === "CUSTOM_GET" &&
    (!logistics.smsApiUrl.trim() ||
      logistics.smsApiUrl.trim() === "https://bulksmsbd.net/api/smsapi")
  ) {
    return { sent: false, reason: "Custom SMS endpoint URL is missing" };
  }

  let endpoint: URL;
  try {
    endpoint = await validateSmsEndpoint(
      logistics.smsApiUrl || "https://bulksmsbd.net/api/smsapi",
      logistics.smsProvider,
    );
  } catch (error) {
    console.error("Invalid SMS gateway endpoint:", {
      provider: logistics.smsProvider,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { sent: false, reason: "Invalid SMS gateway endpoint" };
  }
  if (!message.trim() || message.length > 1000) {
    return { sent: false, reason: "SMS message is empty or too long" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    if (logistics.smsProvider === "BULKSMSBD") {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: smsApiKey,
          senderid: logistics.smsSenderId,
          number: formattedNumber,
          message,
        }),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });

      let result: unknown;
      try {
        result = await response.json();
      } catch {
        console.error("BulkSMSBD returned a non-JSON response", {
          status: response.status,
        });
        return { sent: false, reason: "SMS provider returned an invalid response" };
      }
      const providerCode =
        typeof result === "object" &&
        result !== null &&
        "response_code" in result &&
        (typeof result.response_code === "string" ||
          typeof result.response_code === "number")
          ? String(result.response_code)
          : undefined;
      if (response.ok && providerCode === "202") {
        return { sent: true, providerCode };
      }
      console.error("BulkSMSBD rejected the SMS", {
        status: response.status,
        providerCode,
      });
      return { sent: false, reason: "SMS provider rejected the message" };
    }

    endpoint.searchParams.set("api_key", smsApiKey);
    if (logistics.smsSenderId) {
      endpoint.searchParams.set("senderid", logistics.smsSenderId);
    }
    endpoint.searchParams.set("number", formattedNumber);
    endpoint.searchParams.set("to", formattedNumber);
    endpoint.searchParams.set("message", message);

    const response = await fetch(endpoint, {
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("Custom SMS gateway rejected the SMS", {
        status: response.status,
        host: endpoint.hostname,
      });
      return { sent: false, reason: "SMS provider rejected the message" };
    }
    return { sent: true };
  } catch (error) {
    console.error("SMS gateway request failed", {
      provider: logistics.smsProvider,
      host: endpoint.hostname,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { sent: false, reason: "Network error sending SMS" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendOrderSms(params: {
  phone: string;
  type: "CONFIRMATION" | "SHIPPED";
  variables: {
    customerName: string;
    orderNumber: string;
    totalAmount?: number;
    courier?: string;
    trackingCode?: string;
  };
}): Promise<SmsResult> {
  if (!params.phone.trim()) {
    return { sent: false, reason: "Customer phone number is missing" };
  }
  const formattedNumber = normalizeBdPhone(params.phone);
  if (!formattedNumber) {
    return { sent: false, reason: "Customer phone number is invalid" };
  }

  let logistics;
  let siteSettings;
  try {
    [logistics, siteSettings] = await Promise.all([
      prisma.logisticsSettings.findUnique({ where: { id: 1 } }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);
  } catch (error) {
    console.error("Failed to load SMS settings:", error);
    return { sent: false, reason: "Unable to load SMS settings" };
  }
  if (!logistics?.smsEnabled) {
    return { sent: false, reason: "SMS gateway is disabled" };
  }

  let appUrl: string;
  try {
    appUrl = getPublicAppUrl();
  } catch (error) {
    console.error("Invalid application URL for SMS tracking link:", error);
    return { sent: false, reason: "Application URL is not configured" };
  }

  const rawTemplate =
    params.type === "SHIPPED"
      ? logistics.orderShippedTemplate
      : logistics.orderConfirmTemplate;
  const message = rawTemplate
    .replace(/\{customerName\}/g, params.variables.customerName)
    .replace(/\{orderNumber\}/g, params.variables.orderNumber)
    .replace(/\{totalAmount\}/g, String(params.variables.totalAmount ?? ""))
    .replace(/\{courier\}/g, params.variables.courier || "Courier")
    .replace(/\{trackingCode\}/g, params.variables.trackingCode || "")
    .replace(/\{storeName\}/g, siteSettings?.storeName || "ALIF STORE")
    .replace(
      /\{trackUrl\}/g,
      `${appUrl}/track-order?order=${encodeURIComponent(
        params.variables.orderNumber,
      )}`,
    );
  return sendSmsMessage(logistics, formattedNumber, message);
}

export async function sendPasswordResetSms(params: {
  phone: string;
  otp: string;
}): Promise<SmsResult> {
  if (!/^\d{6}$/.test(params.otp)) {
    return {
      sent: false,
      reason: "Password reset code must contain exactly six digits",
    };
  }
  const phoneValidation = validateBangladeshiPhone(params.phone);
  if (!phoneValidation.valid || !phoneValidation.normalized) {
    return {
      sent: false,
      reason: phoneValidation.error ?? "Customer phone number is invalid",
    };
  }

  let logistics: LogisticsSettings | null;
  let siteSettings;
  try {
    [logistics, siteSettings] = await Promise.all([
      prisma.logisticsSettings.findUnique({ where: { id: 1 } }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);
  } catch (error) {
    console.error("Failed to load SMS settings:", error);
    return { sent: false, reason: "Unable to load SMS settings" };
  }

  const storeName = (siteSettings?.storeName || "ALIF STORE")
    .replace(/[\r\n\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 80);
  const message = `Your ${storeName} password reset code is: ${params.otp}. Valid for 10 minutes. Do not share this code with anyone.`;

  return sendSmsMessage(
    logistics,
    `88${phoneValidation.normalized}`,
    message,
  );
}

export async function sendAdmin2faSms(params: {
  phone: string;
  otp: string;
}): Promise<SmsResult> {
  if (!/^\d{6}$/.test(params.otp)) {
    return {
      sent: false,
      reason: "Admin verification code must contain exactly six digits",
    };
  }

  const formattedNumber = normalizeBdPhone(params.phone);
  if (!formattedNumber) {
    return { sent: false, reason: "Admin phone number is invalid" };
  }

  let logistics: LogisticsSettings | null;
  let siteSettings;
  try {
    [logistics, siteSettings] = await Promise.all([
      prisma.logisticsSettings.findUnique({ where: { id: 1 } }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);
  } catch (error) {
    console.error("Failed to load SMS settings for admin 2FA:", error);
    return { sent: false, reason: "Unable to load SMS settings" };
  }

  const storeName = (siteSettings?.storeName || "ALIF STORE")
    .replace(/[\r\n\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 80);
  const message = `${storeName} Admin 2FA Code: ${params.otp}. Expires in 5 minutes.`;

  return sendSmsMessage(logistics, formattedNumber, message);
}
