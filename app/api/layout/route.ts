import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isHttpUrl,
  isRecord,
  readJsonBody,
} from "@/lib/api-utils";
import { DEFAULT_HOMEPAGE_SECTIONS } from "@/lib/cms-defaults";
import { staffAuthorizationError } from "@/lib/user-auth";

export async function GET() {
  await prisma.$transaction(
    DEFAULT_HOMEPAGE_SECTIONS.map((section) =>
      prisma.homepageSection.upsert({
        where: { sectionKey: section.sectionKey },
        update: {},
        create: section,
      }),
    ),
  );

  const sections = await prisma.homepageSection.findMany({
    orderBy: [{ order: "asc" }, { sectionKey: "asc" }],
  });
  return Response.json(sections);
}

export async function PUT(request: Request) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const body = await readJsonBody(request);
  let rawSections: unknown;

  if (Array.isArray(body)) {
    rawSections = body;
  } else if (isRecord(body)) {
    const unknownBodyFields = Object.keys(body).filter(
      (field) => field !== "sections",
    );
    if (unknownBodyFields.length > 0) {
      return Response.json(
        { error: `Unsupported layout fields: ${unknownBodyFields.join(", ")}` },
        { status: 400 },
      );
    }
    rawSections = body.sections;
  }

  if (
    !Array.isArray(rawSections) ||
    rawSections.length === 0 ||
    rawSections.length > 100
  ) {
    return Response.json(
      { error: "Request body must contain 1 to 100 homepage sections" },
      { status: 400 },
    );
  }

  const updates: Array<{
    id?: string;
    sectionKey?: string;
    data: Prisma.HomepageSectionUpdateInput;
  }> = [];
  const identifiers = new Set<string>();
  const orders = new Set<number>();

  for (const section of rawSections) {
    if (!isRecord(section)) {
      return Response.json({ error: "Each section must be an object" }, { status: 400 });
    }

    const allowedFields = new Set([
      "id",
      "sectionKey",
      "title",
      "subtitle",
      "imageUrl",
      "linkUrl",
      "order",
      "isVisible",
    ]);
    const unknownFields = Object.keys(section).filter(
      (field) => !allowedFields.has(field),
    );
    if (unknownFields.length > 0) {
      return Response.json(
        { error: `Unsupported section fields: ${unknownFields.join(", ")}` },
        { status: 400 },
      );
    }

    const hasId = "id" in section;
    const hasSectionKey = "sectionKey" in section;
    const id = typeof section.id === "string" ? section.id.trim() : null;
    const sectionKey =
      typeof section.sectionKey === "string"
        ? section.sectionKey.trim()
        : null;
    if (
      hasId === hasSectionKey ||
      (hasId && !id) ||
      (hasSectionKey && !sectionKey)
    ) {
      return Response.json(
        { error: "Each section must have either a valid id or sectionKey" },
        { status: 400 },
      );
    }
    if (
      typeof section.order !== "number" ||
      !Number.isSafeInteger(section.order) ||
      section.order < 0 ||
      typeof section.isVisible !== "boolean"
    ) {
      return Response.json(
        { error: "Each section needs a non-negative integer order and boolean isVisible" },
        { status: 400 },
      );
    }

    const identifier = id ? `id:${id}` : `key:${sectionKey}`;
    if (identifiers.has(identifier)) {
      return Response.json(
        { error: "Section identifiers must not be duplicated" },
        { status: 400 },
      );
    }
    if (orders.has(section.order)) {
      return Response.json(
        { error: `Duplicate section order: ${section.order}` },
        { status: 400 },
      );
    }
    identifiers.add(identifier);
    orders.add(section.order);

    const data: Prisma.HomepageSectionUpdateInput = {
      order: section.order,
      isVisible: section.isVisible,
    };
    if ("title" in section) {
      if (typeof section.title !== "string" || section.title.trim().length === 0) {
        return Response.json({ error: "title cannot be empty" }, { status: 400 });
      }
      data.title = section.title.trim();
    }
    if ("subtitle" in section) {
      if (section.subtitle !== null && typeof section.subtitle !== "string") {
        return Response.json(
          { error: "subtitle must be a string or null" },
          { status: 400 },
        );
      }
      data.subtitle = section.subtitle;
    }
    if ("imageUrl" in section) {
      const imageUrl = section.imageUrl;
      if (imageUrl !== null && typeof imageUrl !== "string") {
        return Response.json(
          { error: "imageUrl must be an HTTP(S) URL or null" },
          { status: 400 },
        );
      }
      if (typeof imageUrl === "string" && imageUrl !== "" && !isHttpUrl(imageUrl)) {
        return Response.json(
          { error: "imageUrl must be an HTTP(S) URL or null" },
          { status: 400 },
        );
      }
      data.imageUrl = imageUrl || null;
    }
    if ("linkUrl" in section) {
      const linkUrl = section.linkUrl;
      if (linkUrl !== null && typeof linkUrl !== "string") {
        return Response.json(
          { error: "linkUrl must be a root-relative or HTTP(S) URL or null" },
          { status: 400 },
        );
      }
      if (
        typeof linkUrl === "string" &&
        linkUrl !== "" &&
        !(
          (linkUrl.startsWith("/") && !linkUrl.startsWith("//")) ||
          isHttpUrl(linkUrl)
        )
      ) {
        return Response.json(
          { error: "linkUrl must be a root-relative or HTTP(S) URL or null" },
          { status: 400 },
        );
      }
      data.linkUrl = linkUrl || null;
    }

    updates.push({
      ...(id ? { id } : {}),
      ...(sectionKey ? { sectionKey } : {}),
      data,
    });
  }

  const result = await prisma.$transaction(async (transaction) => {
    const existingSections = await transaction.homepageSection.findMany({
      select: { id: true, sectionKey: true },
    });
    const existingById = new Map(
      existingSections.map((section) => [section.id, section]),
    );
    const existingByKey = new Map(
      existingSections.map((section) => [section.sectionKey, section]),
    );
    const matchedSections = updates.map((update) =>
      update.id
        ? existingById.get(update.id)
        : update.sectionKey
          ? existingByKey.get(update.sectionKey)
          : undefined,
    );
    const matchedIds = new Set(
      matchedSections.flatMap((section) => (section ? [section.id] : [])),
    );
    if (
      existingSections.length !== updates.length ||
      matchedSections.some((section) => !section) ||
      matchedIds.size !== existingSections.length
    ) {
      return null;
    }

    for (let index = 0; index < updates.length; index += 1) {
      const section = matchedSections[index];
      const update = updates[index];
      if (!section || !update) return null;
      await transaction.homepageSection.update({
        where: { id: section.id },
        data: update.data,
      });
    }

    return transaction.homepageSection.findMany({
      orderBy: [{ order: "asc" }, { sectionKey: "asc" }],
    });
  });

  if (!result) {
    return Response.json(
      { error: "The update must include all existing homepage sections" },
      { status: 400 },
    );
  }
  return Response.json(result);
}
