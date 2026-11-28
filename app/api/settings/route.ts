import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import {
  isHttpUrl,
  isRecord,
  readJsonBody,
} from "@/lib/api-utils";
import { requireRole } from "@/lib/auth-guard";
import type { Prisma } from "@prisma/client";
import { loginSettingsSchema } from "@/types/login-settings";
import { headerSettingsSchema } from "@/types/header-settings";

function isSafeLink(value: string) {
  return (
    (value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\")) ||
    isHttpUrl(value)
  );
}

function parseMenuItems(
  value: unknown,
): Array<{ label: string; href: string }> | null {
  if (!Array.isArray(value) || value.length > 20) return null;

  const menuItems: Array<{ label: string; href: string }> = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      Object.keys(item).some((key) => key !== "label" && key !== "href") ||
      typeof item.label !== "string" ||
      item.label.trim().length === 0 ||
      item.label.trim().length > 60 ||
      typeof item.href !== "string" ||
      item.href.trim().length === 0 ||
      item.href.trim().length > 2048 ||
      !isSafeLink(item.href.trim())
    ) {
      return null;
    }
    menuItems.push({ label: item.label.trim(), href: item.href.trim() });
  }
  return menuItems;
}

export async function GET() {
  const settings = await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return Response.json(settings);
}

export async function PUT(request: Request) {
  const { errorResponse } = await requireRole(["ADMIN"], request);
  if (errorResponse) return errorResponse;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const stringFields = [
    "storeName",
    "tagline",
    "logoUrl",
    "faviconUrl",
    "primaryColor",
    "secondaryColor",
    "fontFamily",
    "footerText",
    "announcementText",
    "contactEmail",
    "contactAddress",
    "facebookUrl",
    "instagramUrl",
    "youtubeUrl",
    "whatsappNumber",
    "messengerUsername",
    "heroTitle",
    "heroSubtitle",
    "heroButtonText",
    "heroButtonLink",
    "heroImage",
    "contactPhone",
  ] as const;
  const numberFields = [
    "deliveryChargeInside",
    "deliveryChargeOutside",
  ] as const;
  const allowedFields = new Set<string>([
    ...Object.keys(loginSettingsSchema.shape),
    ...Object.keys(headerSettingsSchema.shape),
    ...stringFields,
    ...numberFields,
    "menuItems",
    "flashSaleEndsAt",
  ]);
  const unknownFields = Object.keys(body).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    return Response.json(
      { error: `Unsupported settings: ${unknownFields.join(", ")}` },
      { status: 400 },
    );
  }

  const update: Prisma.SiteSettingsUpdateInput = {};
  const create: Prisma.SiteSettingsCreateInput = { id: 1 };
  const loginFields = Object.fromEntries(
    Object.keys(loginSettingsSchema.shape)
      .filter((key) => key in body)
      .map((key) => [key, body[key]]),
  );
  const loginSettings = loginSettingsSchema.partial().safeParse(loginFields);
  if (!loginSettings.success) {
    return Response.json(
      { error: loginSettings.error.issues[0]?.message ?? "Invalid login settings" },
      { status: 400 },
    );
  }
  Object.assign(update, loginSettings.data);
  Object.assign(create, loginSettings.data);
  const headerFields = Object.fromEntries(
    Object.keys(headerSettingsSchema.shape)
      .filter((key) => key in body)
      .map((key) => [key, body[key]]),
  );
  const headerSettings = headerSettingsSchema.partial().safeParse(headerFields);
  if (!headerSettings.success) {
    return Response.json(
      { error: headerSettings.error.issues[0]?.message ?? "Invalid header settings" },
      { status: 400 },
    );
  }
  Object.assign(update, headerSettings.data);
  Object.assign(create, headerSettings.data);
  const menuItems =
    "menuItems" in body ? parseMenuItems(body.menuItems) : undefined;
  if ("menuItems" in body && !menuItems) {
    return Response.json(
      { error: "menuItems must contain at most 20 valid menu links" },
      { status: 400 },
    );
  }

  for (const field of stringFields) {
    if (!(field in body)) continue;
    const value = body[field];
    if (typeof value !== "string") {
      return Response.json({ error: `${field} must be a string` }, { status: 400 });
    }
    if (field !== "announcementText" && value.trim().length === 0) {
      if (
        ![
          "logoUrl",
          "facebookUrl",
          "instagramUrl",
          "youtubeUrl",
          "whatsappNumber",
          "messengerUsername",
        ].includes(field)
      ) {
        return Response.json({ error: `${field} cannot be empty` }, { status: 400 });
      }
    }
    if (
      (field === "primaryColor" || field === "secondaryColor") &&
      !/^#[\da-f]{6}$/i.test(value)
    ) {
      return Response.json(
        { error: `${field} must be a 6-digit hexadecimal color` },
        { status: 400 },
      );
    }
    if (
      field === "fontFamily" &&
      ![
        "Inter",
        "Roboto",
        "Open Sans",
        "Lato",
        "Montserrat",
        "Poppins",
        "Hind Siliguri",
        "Arial",
        "Georgia",
        "System UI",
        "Verdana",
      ].includes(value)
    ) {
      return Response.json({ error: "Unsupported fontFamily" }, { status: 400 });
    }
    if (
      ["logoUrl", "facebookUrl", "instagramUrl", "youtubeUrl", "heroImage"].includes(
        field,
      ) &&
      value !== "" &&
      !isHttpUrl(value)
    ) {
      return Response.json({ error: `${field} must be an HTTP or HTTPS URL` }, { status: 400 });
    }
    if (
      field === "faviconUrl" &&
      value !== "" &&
      !(
        (value.startsWith("/") && !value.startsWith("//")) ||
        isHttpUrl(value)
      )
    ) {
      return Response.json(
        { error: "faviconUrl must be a root-relative or HTTP(S) URL" },
        { status: 400 },
      );
    }
    if (field === "heroButtonLink" && !isSafeLink(value)) {
      return Response.json(
        { error: "heroButtonLink must be a root-relative or HTTP(S) URL" },
        { status: 400 },
      );
    }
    if (
      field === "contactEmail" &&
      value !== "" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ) {
      return Response.json({ error: "contactEmail must be a valid email address" }, { status: 400 });
    }
    if (
      field === "whatsappNumber" &&
      value !== "" &&
      !/^\+?[\d\s()-]+$/.test(value)
    ) {
      return Response.json({ error: "whatsappNumber contains invalid characters" }, { status: 400 });
    }
    const storedValue =
      field === "messengerUsername" ? value.trim() : value;
    if (
      field === "messengerUsername" &&
      storedValue !== "" &&
      !/^[a-z\d.]{1,100}$/i.test(storedValue)
    ) {
      return Response.json(
        { error: "messengerUsername must be a Facebook Page username or numeric Page ID" },
        { status: 400 },
      );
    }
    update[field] = storedValue;
    create[field] = storedValue;
  }

  if (menuItems) {
    update.menuItems = menuItems;
    create.menuItems = menuItems;
  }

  for (const field of numberFields) {
    if (!(field in body)) continue;
    const value = body[field];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      return Response.json(
        { error: `${field} must be a non-negative integer` },
        { status: 400 },
      );
    }
    update[field] = value;
    create[field] = value;
  }

  if ("flashSaleEndsAt" in body) {
    const value = body.flashSaleEndsAt;
    if (value === null) {
      update.flashSaleEndsAt = null;
      create.flashSaleEndsAt = null;
    } else if (typeof value === "string") {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
        return Response.json(
          { error: "flashSaleEndsAt must be a valid ISO date-time or null" },
          { status: 400 },
        );
      }
      update.flashSaleEndsAt = date;
      create.flashSaleEndsAt = date;
    } else {
      return Response.json(
        { error: "flashSaleEndsAt must be a valid ISO date-time or null" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Provide at least one setting to update" }, { status: 400 });
  }

  const settings = await prisma.siteSettings.upsert({
    where: { id: 1 },
    update,
    create,
  });

  revalidateTag("site-settings", { expire: 0 });
  return Response.json(settings);
}
