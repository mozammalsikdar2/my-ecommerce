BEGIN;

LOCK TABLE "Category", "SubCategory", "Product" IN SHARE ROW EXCLUSIVE MODE;

UPDATE "Product" AS product
SET "categoryId" = subcategory."categoryId"
FROM "SubCategory" AS subcategory
WHERE product."categoryId" IS NULL
  AND product."subCategoryId" = subcategory."id";

DO $$
DECLARE
  fallback_id TEXT;
  fallback_slug TEXT := 'uncategorized';
  suffix INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM "Product" WHERE "categoryId" IS NULL) THEN
    SELECT "id" INTO fallback_id
    FROM "Category"
    WHERE "name" = 'Uncategorized'
    ORDER BY "id"
    LIMIT 1;

    IF fallback_id IS NULL THEN
      fallback_id := 'backfill-uncategorized';
      WHILE EXISTS (SELECT 1 FROM "Category" WHERE "id" = fallback_id) LOOP
        suffix := suffix + 1;
        fallback_id := 'backfill-uncategorized-' || suffix;
      END LOOP;

      suffix := 0;
      WHILE EXISTS (SELECT 1 FROM "Category" WHERE "slug" = fallback_slug) LOOP
        suffix := suffix + 1;
        fallback_slug := 'uncategorized-' || suffix;
      END LOOP;

      INSERT INTO "Category" ("id", "name", "slug", "updatedAt")
      VALUES (fallback_id, 'Uncategorized', fallback_slug, CURRENT_TIMESTAMP);
    END IF;

    UPDATE "Product" SET "categoryId" = fallback_id WHERE "categoryId" IS NULL;
  END IF;
END $$;

UPDATE "Product" SET "description" = '' WHERE "description" IS NULL;

COMMIT;
