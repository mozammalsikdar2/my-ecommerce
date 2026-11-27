import { isRecord, readJsonBody } from "@/lib/api-utils";
import type { MetaCapiEventInput } from "@/lib/meta-capi";
import { sendMetaCapiEvent } from "@/lib/meta-capi";

const allowedEventFields = new Set([
  "eventName",
  "eventId",
  "eventSourceUrl",
  "customData",
  "userData",
]);

const allowedUserDataFields = new Set([
  "email",
  "phone",
  "firstName",
  "lastName",
  "city",
  "externalId",
]);

const allowedCustomDataFields = new Set([
  "currency",
  "value",
  "content_ids",
  "content_name",
  "content_type",
  "contents",
  "num_items",
]);

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function getSameOrigin(request: Request) {
  const originHeader = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!originHeader || !host) return null;

  try {
    const origin = new URL(originHeader);
    if (
      (origin.protocol !== "http:" && origin.protocol !== "https:") ||
      origin.host.toLowerCase() !== host.toLowerCase()
    ) {
      return null;
    }
    return origin;
  } catch {
    return null;
  }
}

function parseContents(
  value: unknown,
): Array<{ id: string; quantity: number; item_price?: number }> | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50) return null;

  const contents: Array<{
    id: string;
    quantity: number;
    item_price?: number;
  }> = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.id, 128) ||
      typeof item.quantity !== "number" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      (item.item_price !== undefined &&
        (typeof item.item_price !== "number" ||
          !Number.isFinite(item.item_price) ||
          item.item_price < 0)) ||
      Object.keys(item).some(
        (field) => field !== "id" && field !== "quantity" && field !== "item_price",
      )
    ) {
      return null;
    }

    contents.push({
      id: item.id,
      quantity: item.quantity,
      ...(typeof item.item_price === "number"
        ? { item_price: item.item_price }
        : {}),
    });
  }
  return contents;
}

function parseCustomData(
  value: unknown,
): MetaCapiEventInput["customData"] | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((field) => !allowedCustomDataFields.has(field))) {
    return null;
  }
  if (
    typeof value.value !== "number" ||
    !Number.isFinite(value.value) ||
    value.value < 0 ||
    !Array.isArray(value.content_ids) ||
    value.content_ids.length === 0 ||
    value.content_ids.length > 50 ||
    !value.content_ids.every((id) => isNonEmptyString(id, 128))
  ) {
    return null;
  }

  if (
    value.currency !== undefined &&
    (typeof value.currency !== "string" ||
      !/^[a-zA-Z]{3}$/.test(value.currency))
  ) {
    return null;
  }
  if (
    value.content_name !== undefined &&
    (typeof value.content_name !== "string" || value.content_name.length > 256)
  ) {
    return null;
  }
  if (
    value.content_type !== undefined &&
    value.content_type !== "product" &&
    value.content_type !== "product_group"
  ) {
    return null;
  }
  if (
    value.num_items !== undefined &&
    (typeof value.num_items !== "number" ||
      !Number.isSafeInteger(value.num_items) ||
      value.num_items < 0 ||
      value.num_items > 10000)
  ) {
    return null;
  }

  const contents = parseContents(value.contents);
  if (contents === null) return null;
  const contentType: "product" | "product_group" | undefined =
    value.content_type === "product" || value.content_type === "product_group"
      ? value.content_type
      : undefined;
  const contentIds = value.content_ids.filter((id): id is string =>
    isNonEmptyString(id, 128),
  );

  return {
    currency:
      typeof value.currency === "string"
        ? value.currency.toUpperCase()
        : undefined,
    value: value.value,
    content_ids: contentIds,
    ...(typeof value.content_name === "string"
      ? { content_name: value.content_name }
      : {}),
    ...(contentType ? { content_type: contentType } : {}),
    ...(contents ? { contents } : {}),
    ...(typeof value.num_items === "number"
      ? { num_items: value.num_items }
      : {}),
  };
}

function parseUserData(
  value: unknown,
): MetaCapiEventInput["userData"] | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    !isRecord(value) ||
    Object.keys(value).some((field) => !allowedUserDataFields.has(field))
  ) {
    return null;
  }

  const limits = {
    email: 320,
    phone: 32,
    firstName: 80,
    lastName: 80,
    city: 100,
    externalId: 256,
  } as const;
  for (const [field, maxLength] of Object.entries(limits)) {
    const fieldValue = value[field];
    if (
      fieldValue !== undefined &&
      fieldValue !== null &&
      (typeof fieldValue !== "string" || fieldValue.length > maxLength)
    ) {
      return null;
    }
  }

  return {
    ...(typeof value.email === "string" || value.email === null
      ? { email: value.email }
      : {}),
    ...(typeof value.phone === "string" || value.phone === null
      ? { phone: value.phone }
      : {}),
    ...(typeof value.firstName === "string" || value.firstName === null
      ? { firstName: value.firstName }
      : {}),
    ...(typeof value.lastName === "string" || value.lastName === null
      ? { lastName: value.lastName }
      : {}),
    ...(typeof value.city === "string" || value.city === null
      ? { city: value.city }
      : {}),
    ...(typeof value.externalId === "string" || value.externalId === null
      ? { externalId: value.externalId }
      : {}),
  };
}

export async function POST(request: Request) {
  const originUrl = getSameOrigin(request);
  if (!originUrl) {
    return Response.json({ error: "Same-origin requests only" }, { status: 403 });
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    return Response.json(
      { error: "Content-Type must be application/json" },
      { status: 415 },
    );
  }

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }
  if (Object.keys(body).some((field) => !allowedEventFields.has(field))) {
    return Response.json(
      { error: "Request contains an unsupported field" },
      { status: 400 },
    );
  }
  if (body.eventName !== "ViewContent" && body.eventName !== "AddToCart") {
    return Response.json(
      { error: "Only ViewContent and AddToCart events are accepted" },
      { status: 400 },
    );
  }
  if (!isNonEmptyString(body.eventId, 128)) {
    return Response.json(
      { error: "eventId must be a non-empty string of at most 128 characters" },
      { status: 400 },
    );
  }

  let eventSourceUrl: string | undefined;
  if (body.eventSourceUrl !== undefined) {
    if (!isNonEmptyString(body.eventSourceUrl, 2048)) {
      return Response.json({ error: "eventSourceUrl is invalid" }, { status: 400 });
    }
    try {
      const sourceUrl = new URL(body.eventSourceUrl);
      if (
        sourceUrl.origin !== originUrl.origin ||
        (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:")
      ) {
        return Response.json(
          { error: "eventSourceUrl must use the current site origin" },
          { status: 400 },
        );
      }
      eventSourceUrl = sourceUrl.href;
    } catch {
      return Response.json({ error: "eventSourceUrl is invalid" }, { status: 400 });
    }
  }

  const customData = parseCustomData(body.customData);
  if (!customData) {
    return Response.json({ error: "customData is invalid" }, { status: 400 });
  }
  const userData = parseUserData(body.userData);
  if (userData === null) {
    return Response.json({ error: "userData is invalid" }, { status: 400 });
  }

  try {
    const result = await sendMetaCapiEvent({
      eventName: body.eventName,
      eventId: body.eventId,
      ...(eventSourceUrl ? { eventSourceUrl } : {}),
      ...(userData ? { userData } : {}),
      customData,
    });
    if (result.sent) return Response.json({ sent: true });

    if (result.status !== undefined) {
      return Response.json(
        { error: "Meta rejected the tracking event" },
        { status: 502 },
      );
    }
    return Response.json(
      { error: result.reason },
      { status: 503 },
    );
  } catch (error) {
    console.error("POST /api/marketing/track error:", error);
    return Response.json(
      { error: "Failed to send tracking event" },
      { status: 502 },
    );
  }
}
