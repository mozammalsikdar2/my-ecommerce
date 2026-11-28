This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Login panel customization

Administrators can edit both login panels under **Settings → Login Panels**,
including the background image, colors, card darkness, text and portal links.
The preview links open the most recently saved design; save changes before
previewing them.
Disabling customer registration also blocks the registration API. Apply the
updated Prisma schema to the configured database before deploying this feature.

The header uses the configured colors, icons, utility links and language
switcher. Header translations cover navigation labels, not the entire store.
The language selection is remembered in the browser. Administrators can edit
header, language, floating contact and footer icon settings under **Settings →
Header & Icons**. Floating buttons require a valid contact destination to
appear. Category icon and sort-order editing are not yet wired up. Category
names are now unique; resolve any duplicate names before applying the schema.
The new announcement default applies to new settings records; existing saved
announcements are not changed.

## Product schema update

Products require a category and can have an optional unique SKU. Categories
containing products cannot be deleted. Before applying the Prisma schema to an
existing database, back it up and stop all application writes. Run the
backfill below to assign uncategorized products to their subcategory's parent
where possible, or otherwise to an existing or newly created `Uncategorized`
category; it also replaces null descriptions with empty strings. Review other
pending schema changes (including duplicate category names) before pushing.

```powershell
npx prisma db execute --file prisma\backfill-product-categories.sql
npx prisma db push
npx prisma generate
```

Keep writes stopped through the schema push and deploy compatible application
code before resuming them. New products default to stock 25 when stock is not
provided; existing stock is unchanged.

Run the isolated product contract tests in PowerShell with:

```powershell
$env:NODE_PATH = (Resolve-Path node_modules\next\dist\compiled).Path
$env:NODE_OPTIONS = "--conditions=react-server"
node --import tsx --test tests\product-category-contract.test.mjs
```

## Optional sample catalog

After applying the schema, `npm run seed:products` adds 30 sample products
per category, creating six default categories only when none exist. It leaves
existing matching SKUs unchanged. The product descriptions, prices, stock and
images are illustrative placeholders; review them before publishing a store.
This command is separate from the admin-account seed.

`npm run seed:products:reset` overwrites matching SKU details, including
stock and image galleries. Back up the database and review matching SKUs first:
the command cannot distinguish a sample from another product using the same
SKU. Products with variants or a different category are not overwritten.
The seed is not transactional; an error can leave earlier changes in place.
Changing a category slug changes its generated SKUs and can create additional
sample products on a subsequent run.
The existing `npm run db:seed:catalog` command remains available as an alias.

## Admin product API

Staff can use `GET /api/admin/products` (the same filters as `/api/products`,
including inactive products by default) and `POST /api/admin/products` to
create a product. Admin search also matches SKU, and the default order is
category name, SKU, then newest; an explicit `sort` overrides that order
(`sort=category` selects the admin default).
Admin product creation accepts numeric strings, uppercases SKUs, and defaults
stock to 20; it retains the existing product validation.
`PATCH /api/admin/products/:id` accepts numeric strings and uppercases SKUs,
while retaining existing update validation. `DELETE /api/admin/products/:id`
allows administrators and moderators, but cannot delete products referenced by
orders. The existing `/api/products/:id` DELETE remains administrator-only.

`POST /api/admin/products/bulk` accepts either
`{"action":"save","items":[{"id":"product-id","price":100,"stock":10}]}`
(up to 100 unique products, optionally including `discountPrice`) or
`{"action":"discount","categoryId":"category-id","percentage":10}`.
Bulk operations are atomic. Stock edits reject products with variants. Category
discounts affect active products only, replace existing discounts based on
regular price, and round to two decimal places; 0 clears the discount and 100
sets it to zero. Variant-specific fixed prices are unchanged and override the
product discount at checkout; the response counts products with such variants.
Concurrent changes can return 409 and require a retry.

The same endpoint also accepts
`{"action":"SAVE_ROWS","rows":[{"id":"product-id","name":"Item","price":100,"discountPrice":null,"stock":10}]}`
(up to 100 unique rows) and
`{"action":"CATEGORY_PERCENT","categoryId":"category-id","percent":10}`.
Rows accept numeric strings; prices below 1 are raised to 1, while invalid
values are rejected. The percentage action adjusts both regular and positive
discount prices for all products in the category, including inactive ones,
rounding to whole units with minimums of 10 and 5 respectively. Zero discounts
remain zero. Adjustments that would produce invalid prices are rejected.
Fixed-price variants are unchanged, so their checkout prices can differ from
adjusted product prices; the response counts affected products with fixed-price
variants.

The product inventory page supports category and SKU filters, individual or
bulk inline edits, and a full product editor. Inline stock edits are disabled
for products with variants; use their variant stock controls instead. Save or
discard pending inline edits before applying a category-wide price adjustment.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The build generates Prisma Client before running Next.js. Set `DATABASE_URL`
and the application's other required environment variables in Vercel.

Next.js build-time TypeScript checking is disabled in this project. Run
`npm run typecheck` separately in CI before deployment to catch type errors.

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
