import assert from "node:assert/strict";
import test from "node:test";
import { buildThirtyProductsForCategory, seedCatalog } from "../prisma/catalog-seed.ts";

function fakeDatabase(initialCategories = []) {
  const categories = [...initialCategories];
  const products = new Map();
  return {
    categories,
    products,
    prisma: {
      category: {
        async findMany() { return categories; },
        async upsert({ create }) {
          categories.push({ ...create, id: create.slug, subCategories: [] });
        },
      },
      product: {
        async findUnique({ where }) {
          const item = products.get(where.sku);
          return item ? { categoryId: item.categoryId, _count: { variants: item.variantCount ?? 0 } } : null;
        },
        async create({ data }) {
          assert.ok(!products.has(data.sku));
          assert.ok(![...products.values()].some((item) => item.slug === data.slug));
          products.set(data.sku, data);
        },
        async update({ where, data }) {
          products.set(where.sku, { ...products.get(where.sku), ...data });
        },
      },
    },
  };
}

test("catalog templates contain 30 distinct valid products", () => {
  for (const [name, slug] of [["Attar", "attar"], ["Gadgets", "gadgets"], ["Books", "books"]]) {
    const items = buildThirtyProductsForCategory(name, slug);
    assert.equal(items.length, 30);
    assert.equal(new Set(items.map((item) => item.name)).size, 30);
    assert.ok(items.every((item) => item.price > 0 && item.stock >= 0 &&
      (item.discountPrice === undefined || item.discountPrice < item.price)));
  }
});

test("catalog seed creates missing categories and is repeatable", async () => {
  const db = fakeDatabase();
  const first = await seedCatalog(db.prisma, false);
  assert.deepEqual(first, { categories: 6, created: 180, updated: 0 });
  assert.equal(new Set([...db.products.values()].map((item) => item.slug)).size, 180);
  const repeat = await seedCatalog(db.prisma, false);
  assert.deepEqual(repeat, { categories: 6, created: 0, updated: 0 });
});

test("force updates matching samples while preserving variant stock safety", async () => {
  const db = fakeDatabase([{ id: "c1", name: "Books", slug: "books", subCategories: [{ id: "s1" }, { id: "s2" }] }]);
  await seedCatalog(db.prisma, false);
  assert.equal(db.products.get("CAT-BOOKS-01").subCategoryId, "s1");
  assert.equal(db.products.get("CAT-BOOKS-02").subCategoryId, "s2");
  db.products.get("CAT-BOOKS-01").price = 1;
  assert.equal((await seedCatalog(db.prisma, false)).updated, 0);
  assert.equal(db.products.get("CAT-BOOKS-01").price, 1);
  assert.equal((await seedCatalog(db.prisma, true)).updated, 30);
  assert.equal(db.products.get("CAT-BOOKS-01").price, 490);
  db.products.get("CAT-BOOKS-01").variantCount = 1;
  await assert.rejects(seedCatalog(db.prisma, true), /has product variants/);
});

test("catalog seed rejects a SKU belonging to another category", async () => {
  const db = fakeDatabase([{ id: "c1", name: "Books", slug: "books", subCategories: [] }]);
  db.products.set("CAT-BOOKS-01", { categoryId: "other" });
  await assert.rejects(seedCatalog(db.prisma, false), /different category/);
});
