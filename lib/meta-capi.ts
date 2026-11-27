import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { decryptPaymentSecret } from "@/lib/payment-secrets";
import { prisma } from "@/lib/prisma";

function sha256Hash(value?: string | null): string | undefined {
  const cleaned = value?.trim().toLowerCase();
  if (!cleaned) return undefined;
  return crypto.createHash("sha256").update(cleaned).digest("hex");
}

function normalizePhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("01") && digits.length === 11) return `88${digits}`;
  return digits;
}

export interface MetaCapiEventInput {
  eventName: "ViewContent" | "AddToCart" | "Purchase";
  eventId: string;
  eventSourceUrl?: string;
  userData?: {
    email?: string | null;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    city?: string | null;
    externalId?: string | null;
  };
  customData: {
    currency?: string;
    value: number;
    content_ids: string[];
    content_name?: string;
    content_type?: "product" | "product_group";
    contents?: Array<{ id: string; quantity: number; item_price?: number }>;
    num_items?: number;
    order_id?: string;
  };
}

export async function sendMetaCapiEvent(
  input: MetaCapiEventInput,
  options: { includeRequestContext?: boolean } = {},
) {
  if (!input.eventId.trim()) {
    return { sent: false as const, reason: "Event ID is required" };
  }
  if (!Number.isFinite(input.customData.value) || input.customData.value < 0) {
    return { sent: false as const, reason: "Event value must be a non-negative number" };
  }

  const storedConfig = await prisma.marketingSettings.findUnique({
    where: { id: 1 },
  });
  if (
    !storedConfig?.metaPixelEnabled ||
    !storedConfig.metaPixelId.trim() ||
    !storedConfig.metaCapiAccessToken.trim()
  ) {
    return {
      sent: false as const,
      reason: "Meta CAPI disabled or credentials missing",
    };
  }

  const accessToken = decryptPaymentSecret(storedConfig.metaCapiAccessToken);
  let clientIp: string | undefined;
  let userAgent: string | undefined;
  let referer: string | undefined;
  let fbp: string | undefined;
  let fbc: string | undefined;
  if (options.includeRequestContext !== false) {
    const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
    clientIp = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
    userAgent = headerStore.get("user-agent") || undefined;
    referer = headerStore.get("referer") || undefined;
    fbp = cookieStore.get("_fbp")?.value;
    fbc = cookieStore.get("_fbc")?.value;
  }
  const sourceUrl =
    input.eventSourceUrl?.trim() ||
    referer ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!sourceUrl) {
    return {
      sent: false as const,
      reason: "Event source URL is unavailable",
    };
  }

  let eventSourceUrl: string;
  try {
    const parsedUrl = new URL(sourceUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return {
        sent: false as const,
        reason: "Event source URL must use HTTP or HTTPS",
      };
    }
    parsedUrl.search = "";
    parsedUrl.hash = "";
    eventSourceUrl = parsedUrl.href;
  } catch {
    return {
      sent: false as const,
      reason: "Event source URL is invalid",
    };
  }

  const hashedPhone = sha256Hash(normalizePhone(input.userData?.phone));
  const hashedEmail = sha256Hash(input.userData?.email);
  const hashedFirstName = sha256Hash(input.userData?.firstName);
  const hashedLastName = sha256Hash(input.userData?.lastName);
  const hashedCity = sha256Hash(input.userData?.city);
  const hashedCountry = sha256Hash("bd");
  const hashedExternalId = sha256Hash(input.userData?.externalId);

  const eventPayload = {
    event_name: input.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: input.eventId.trim(),
    action_source: "website",
    event_source_url: eventSourceUrl,
    user_data: {
      ...(clientIp ? { client_ip_address: clientIp } : {}),
      ...(userAgent ? { client_user_agent: userAgent } : {}),
      ...(fbp ? { fbp } : {}),
      ...(fbc ? { fbc } : {}),
      ...(hashedEmail ? { em: [hashedEmail] } : {}),
      ...(hashedPhone ? { ph: [hashedPhone] } : {}),
      ...(hashedFirstName ? { fn: [hashedFirstName] } : {}),
      ...(hashedLastName ? { ln: [hashedLastName] } : {}),
      ...(hashedCity ? { ct: [hashedCity] } : {}),
      ...(hashedCountry ? { country: [hashedCountry] } : {}),
      ...(hashedExternalId ? { external_id: [hashedExternalId] } : {}),
    },
    custom_data: {
      currency: input.customData.currency || "BDT",
      value: input.customData.value,
      content_ids: input.customData.content_ids,
      content_type: input.customData.content_type || "product",
      ...(input.customData.content_name
        ? { content_name: input.customData.content_name }
        : {}),
      ...(input.customData.contents
        ? { contents: input.customData.contents }
        : {}),
      ...(input.customData.num_items !== undefined
        ? { num_items: input.customData.num_items }
        : {}),
      ...(input.customData.order_id
        ? { order_id: input.customData.order_id }
        : {}),
    },
  };

  const requestBody = {
    data: [eventPayload],
    ...(storedConfig.metaTestEventCode.trim()
      ? { test_event_code: storedConfig.metaTestEventCode.trim() }
      : {}),
  };

  const graphUrl = new URL(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(
      storedConfig.metaPixelId.trim(),
    )}/events`,
  );
  graphUrl.searchParams.set("access_token", accessToken.trim());

  const response = await fetch(graphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(10_000),
  });
  const result: unknown = await response.json();

  if (!response.ok) {
    console.error("Meta CAPI request failed", { status: response.status });
    return {
      sent: false as const,
      status: response.status,
      error: result,
    };
  }

  return { sent: true as const, result };
}
