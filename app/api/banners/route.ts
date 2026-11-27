import { prisma } from "@/lib/prisma";
import {
  isHttpUrl,
  isRecord,
  readJsonBody,
} from "@/lib/api-utils";
import { staffAuthorizationError } from "@/lib/user-auth";

export async function GET() {
  const banners = await prisma.banner.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });
  return Response.json(banners);
}

export async function POST(request: Request) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const allowedFields = new Set([
    "title",
    "subtitle",
    "buttonText",
    "buttonLink",
    "imageUrl",
    "order",
    "isActive",
  ]);
  const unknownFields = Object.keys(body).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    return Response.json(
      { error: `Unsupported banner fields: ${unknownFields.join(", ")}` },
      { status: 400 },
    );
  }

  const { title, subtitle, buttonText, buttonLink, imageUrl, order, isActive } = body;
  if (typeof title !== "string" || title.trim().length === 0) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  if (subtitle !== undefined && subtitle !== null && typeof subtitle !== "string") {
    return Response.json({ error: "subtitle must be a string or null" }, { status: 400 });
  }
  if (
    buttonText !== undefined &&
    (typeof buttonText !== "string" || buttonText.trim().length === 0)
  ) {
    return Response.json({ error: "buttonText cannot be empty" }, { status: 400 });
  }
  const resolvedButtonLink = buttonLink ?? "/";
  if (
    typeof resolvedButtonLink !== "string" ||
    !(
      (resolvedButtonLink.startsWith("/") && !resolvedButtonLink.startsWith("//")) ||
      isHttpUrl(resolvedButtonLink)
    )
  ) {
    return Response.json(
      { error: "buttonLink must be a root-relative or HTTP(S) URL" },
      { status: 400 },
    );
  }
  if (typeof imageUrl !== "string" || !isHttpUrl(imageUrl)) {
    return Response.json(
      { error: "imageUrl must be an HTTP or HTTPS URL" },
      { status: 400 },
    );
  }
  if (
    order !== undefined &&
    (typeof order !== "number" || !Number.isSafeInteger(order) || order < 0)
  ) {
    return Response.json({ error: "order must be a non-negative integer" }, { status: 400 });
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    return Response.json({ error: "isActive must be a boolean" }, { status: 400 });
  }

  const highestOrder = await prisma.banner.aggregate({
    _max: { order: true },
  });
  const banner = await prisma.banner.create({
    data: {
      title: title.trim(),
      subtitle,
      buttonText: buttonText ?? "Shop Now",
      buttonLink: resolvedButtonLink,
      imageUrl,
      order: order ?? (highestOrder._max.order ?? 0) + 1,
      isActive: isActive ?? true,
    },
  });

  return Response.json(banner, { status: 201 });
}
