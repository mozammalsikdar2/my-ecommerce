import { Prisma } from "@prisma/client";
import { z } from "zod";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { getAuthenticatedUser, staffAuthorizationError } from "@/lib/auth-guard";
import { ensureDefaultPages } from "@/lib/page-defaults";
import { sanitizePageHtml } from "@/lib/page-html";
import { prisma } from "@/lib/prisma";
import { isValidProductSlug } from "@/lib/product-utils";

const pageInputSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .max(160)
      .refine(isValidProductSlug, "slug must contain lowercase letters, numbers, and hyphens"),
    title: z.string().trim().min(1).max(200),
    content: z.string().max(100_000),
    isPublished: z.boolean().optional(),
  })
  .strict();

export async function GET(request: Request) {
  try {
    await ensureDefaultPages();
    const user =
      (await getAuthenticatedUser(request, "admin")) ??
      (await getAuthenticatedUser(request, "user"));
    const canViewDrafts =
      user?.role === "ADMIN" || user?.role === "MODERATOR";
    const pages = await prisma.page.findMany({
      where: canViewDrafts ? undefined : { isPublished: true },
      orderBy: [{ title: "asc" }, { slug: "asc" }],
    });
    return Response.json(
      pages.map((page) => ({
        ...page,
        content: sanitizePageHtml(page.content),
      })),
      {
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  } catch (error) {
    console.error("GET /api/pages error:", error);
    return Response.json(
      { error: "Failed to load pages" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

export async function POST(request: Request) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const body: unknown = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }
  const parsed = pageInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid page data" },
      { status: 400 },
    );
  }

  try {
    const page = await prisma.page.create({
      data: {
        ...parsed.data,
        content: sanitizePageHtml(parsed.data.content),
        isPublished: parsed.data.isPublished ?? true,
      },
    });
    return Response.json(page, {
      status: 201,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "A page with this slug already exists" },
        { status: 409 },
      );
    }
    console.error("POST /api/pages error:", error);
    return Response.json(
      { error: "Failed to create page" },
      { status: 500 },
    );
  }
}
