import { z } from "zod";
import { revalidatePath } from "next/cache";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { getAuthenticatedUser, staffAuthorizationError } from "@/lib/auth-guard";
import { ensureDefaultPages } from "@/lib/page-defaults";
import { sanitizePageHtml } from "@/lib/page-html";
import { prisma } from "@/lib/prisma";
import { isValidProductSlug } from "@/lib/product-utils";

const pageUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().max(100_000).optional(),
    isPublished: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide title, content, or isPublished to update",
  });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isValidProductSlug(slug)) {
    return Response.json({ error: "Invalid page slug" }, { status: 400 });
  }

  try {
    await ensureDefaultPages();
    const user =
      (await getAuthenticatedUser(request, "admin")) ??
      (await getAuthenticatedUser(request, "user"));
    const canViewDraft =
      user?.role === "ADMIN" || user?.role === "MODERATOR";
    const page = await prisma.page.findFirst({
      where: {
        slug,
        ...(canViewDraft ? {} : { isPublished: true }),
      },
    });
    if (!page) {
      return Response.json({ error: "Page not found" }, { status: 404 });
    }
    return Response.json(
      { ...page, content: sanitizePageHtml(page.content) },
      {
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  } catch (error) {
    console.error("GET /api/pages/[slug] error:", error);
    return Response.json(
      { error: "Failed to load page" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const { slug } = await params;
  if (!isValidProductSlug(slug)) {
    return Response.json({ error: "Invalid page slug" }, { status: 400 });
  }

  const body: unknown = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }
  const parsed = pageUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid page update" },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.page.updateMany({
      where: { slug },
      data: {
        ...parsed.data,
        ...(parsed.data.content !== undefined
          ? { content: sanitizePageHtml(parsed.data.content) }
          : {}),
      },
    });
    if (result.count !== 1) {
      return Response.json({ error: "Page not found" }, { status: 404 });
    }
    const page = await prisma.page.findUnique({ where: { slug } });
    if (!page) {
      return Response.json({ error: "Page not found" }, { status: 404 });
    }
    revalidatePath(`/pages/${slug}`);
    return Response.json(
      { ...page, content: sanitizePageHtml(page.content) },
      {
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  } catch (error) {
    console.error("PUT /api/pages/[slug] error:", error);
    return Response.json(
      { error: "Failed to update page" },
      { status: 500 },
    );
  }
}
