import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { isHttpUrl } from "@/lib/api-utils";
import { DEFAULT_HOMEPAGE_SECTIONS } from "@/lib/cms-defaults";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guard";

const isRootRelativeUrl = (value: string) =>
  value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
const isImageLocation = (value: string) =>
  isHttpUrl(value) || isRootRelativeUrl(value);
const emptyOrImageLocation = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === "" || isImageLocation(value));
const externalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === "" || isHttpUrl(value));
const storeLink = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => isRootRelativeUrl(value) || isHttpUrl(value));

const settingsSchema = z
  .object({
    storeName: z.string().trim().min(1).max(100),
    tagline: z.string().trim().min(1).max(250),
    logoUrl: emptyOrImageLocation,
    faviconUrl: emptyOrImageLocation,
    primaryColor: z.string().regex(/^#[\da-f]{6}$/i),
    secondaryColor: z.string().regex(/^#[\da-f]{6}$/i),
    menuItems: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(60),
            href: storeLink,
          })
          .strict(),
      )
      .max(20),
    fontFamily: z.enum([
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
    ]),
    footerText: z.string().trim().min(1).max(1000),
    announcementText: z.string().max(1000),
    contactPhone: z.string().trim().min(1).max(32),
    contactEmail: z.string().trim().email().max(254),
    contactAddress: z.string().trim().min(1).max(500),
    facebookUrl: externalUrl,
    instagramUrl: externalUrl,
    youtubeUrl: externalUrl,
    messengerUsername: z
      .string()
      .trim()
      .max(100)
      .refine(
        (value) => value === "" || /^[a-z\d.]+$/i.test(value),
        "messengerUsername must be a Facebook Page username or numeric Page ID",
      ),
    whatsappNumber: z
      .string()
      .trim()
      .max(32)
      .refine((value) => value === "" || /^\+?[\d\s()-]+$/.test(value)),
    heroTitle: z.string().trim().min(1).max(200),
    heroSubtitle: z.string().trim().min(1).max(500),
    heroButtonText: z.string().trim().min(1).max(100),
    heroButtonLink: storeLink,
    heroImage: z.string().trim().min(1).max(2048).refine(isImageLocation),
    flashSaleEndsAt: z.iso.datetime().nullable(),
    deliveryChargeInside: z.number().int().min(0).max(2_147_483_647),
    deliveryChargeOutside: z.number().int().min(0).max(2_147_483_647),
  })
  .partial()
  .strict();

const bannerSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(500).nullable().optional(),
  buttonText: z.string().trim().max(100).nullable().optional(),
  buttonLink: z
    .string()
    .trim()
    .max(2048)
    .nullable()
    .optional()
    .refine(
      (value) =>
        value == null ||
        value === "" ||
        isRootRelativeUrl(value) ||
        isHttpUrl(value),
      "buttonLink must be a root-relative or HTTP(S) URL",
    ),
  imageUrl: z.string().trim().min(1).max(2048).refine(isImageLocation),
  isActive: z.boolean().optional(),
});

const sectionSchema = z.object({
  id: z.string().trim().min(1),
  sectionKey: z.string().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  subtitle: z.string().trim().max(500).nullable().optional(),
  imageUrl: z
    .string()
    .trim()
    .max(2048)
    .nullable()
    .optional()
    .refine(
      (value) => value == null || value === "" || isImageLocation(value),
      "imageUrl must be a root-relative or HTTP(S) URL",
    ),
  linkUrl: z
    .string()
    .trim()
    .max(2048)
    .nullable()
    .optional()
    .refine(
      (value) =>
        value == null ||
        value === "" ||
        isRootRelativeUrl(value) ||
        isHttpUrl(value),
      "linkUrl must be a root-relative or HTTP(S) URL",
    ),
  order: z.number().int().min(0).max(1_000_000),
  isVisible: z.boolean(),
});

const cmsUpdateSchema = z
  .object({
    settings: settingsSchema.optional(),
    banners: z.array(bannerSchema).max(50).optional(),
    sections: z
      .array(sectionSchema)
      .max(100)
      .superRefine((sections, context) => {
        const ids = new Set<string>();
        const orders = new Set<number>();
        sections.forEach((section, index) => {
          if (ids.has(section.id)) {
            context.addIssue({
              code: "custom",
              message: "Section identifiers must not be duplicated",
              path: [index, "id"],
            });
          }
          if (orders.has(section.order)) {
            context.addIssue({
              code: "custom",
              message: `Duplicate section order: ${section.order}`,
              path: [index, "order"],
            });
          }
          ids.add(section.id);
          orders.add(section.order);
        });
      })
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.settings !== undefined &&
        Object.keys(value.settings).length > 0) ||
      value.banners !== undefined ||
      value.sections !== undefined,
    "Provide settings, banners, or sections to update",
  );

export async function GET() {
  try {
    const cms = await prisma.$transaction(async (transaction) => {
      const settings = await transaction.siteSettings.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1 },
      });

      await Promise.all(
        DEFAULT_HOMEPAGE_SECTIONS.map((section) =>
          transaction.homepageSection.upsert({
            where: { sectionKey: section.sectionKey },
            update: {},
            create: section,
          }),
        ),
      );

      const [banners, sections] = await Promise.all([
        transaction.banner.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
        transaction.homepageSection.findMany({
          orderBy: [{ order: "asc" }, { sectionKey: "asc" }],
        }),
      ]);

      return { settings, banners, sections };
    });

    return NextResponse.json(cms, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("CMS GET error:", error);
    return NextResponse.json(
      { error: "Failed to load CMS configuration" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const { errorResponse } = await requireRole(
    ["ADMIN", "MODERATOR"],
    request,
  );
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = cmsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid CMS update" },
      { status: 400 },
    );
  }

  const { settings, banners, sections } = parsed.data;

  try {
    const result = await prisma.$transaction(async (transaction) => {
      let updatedSettings = null;
      if (settings) {
        const { flashSaleEndsAt, ...regularSettings } = settings;
        const settingsData = {
          ...regularSettings,
          ...(flashSaleEndsAt !== undefined
            ? {
                flashSaleEndsAt: flashSaleEndsAt
                  ? new Date(flashSaleEndsAt)
                  : null,
              }
            : {}),
        };
        updatedSettings = await transaction.siteSettings.upsert({
          where: { id: 1 },
          update: settingsData,
          create: { id: 1, ...settingsData },
        });
      }

      if (banners) {
        await transaction.banner.deleteMany();
        if (banners.length > 0) {
          await transaction.banner.createMany({
            data: banners.map((banner, index) => ({
              title: banner.title,
              subtitle: banner.subtitle || "",
              buttonText: banner.buttonText || "Shop Now",
              buttonLink: banner.buttonLink || "/",
              imageUrl: banner.imageUrl,
              order: index + 1,
              isActive: banner.isActive ?? true,
            })),
          });
        }
      }

      if (sections && sections.length > 0) {
        const existingSections = await transaction.homepageSection.findMany({
          where: { id: { in: sections.map((section) => section.id) } },
          select: { id: true },
        });
        if (existingSections.length !== sections.length) return null;

        for (const section of sections) {
          const data: Prisma.HomepageSectionUpdateInput = {
            order: section.order,
            isVisible: section.isVisible,
          };
          if (section.title !== undefined) data.title = section.title;
          if (section.subtitle !== undefined) {
            data.subtitle = section.subtitle || null;
          }
          if (section.imageUrl !== undefined) {
            data.imageUrl = section.imageUrl || null;
          }
          if (section.linkUrl !== undefined) {
            data.linkUrl = section.linkUrl || null;
          }
          await transaction.homepageSection.update({
            where: { id: section.id },
            data,
          });
        }
      }

      const [freshBanners, freshSections] = await Promise.all([
        transaction.banner.findMany({
          orderBy: [{ order: "asc" }, { id: "asc" }],
        }),
        transaction.homepageSection.findMany({
          orderBy: [{ order: "asc" }, { sectionKey: "asc" }],
        }),
      ]);

      return {
        settings: updatedSettings,
        banners: freshBanners,
        sections: freshSections,
      };
    });

    if (!result) {
      return NextResponse.json(
        { error: "One or more homepage sections no longer exist" },
        { status: 404 },
      );
    }

    revalidatePath("/", "layout");
    revalidateTag("site-settings", { expire: 0 });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return NextResponse.json(
        { error: "CMS update conflict; please retry" },
        { status: 409 },
      );
    }
    console.error("CMS PUT error:", error);
    return NextResponse.json(
      { error: "Failed to save CMS updates" },
      { status: 500 },
    );
  }
}
