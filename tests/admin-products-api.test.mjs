import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test?connect_timeout=1";
process.env.JWT_ACCESS_SECRET = "test-access-secret-for-products-123456";

const { prisma } = await import("../lib/prisma.ts");
const { Prisma } = await import("@prisma/client");
const { signAccessToken } = await import("../lib/jwt.ts");
const { GET, POST } = await import("../app/api/admin/products/route.ts");
const { GET: publicGET } = await import("../app/api/products/route.ts");
const { PATCH, DELETE } = await import("../app/api/admin/products/[id]/route.ts");
const { DELETE: publicDELETE } = await import("../app/api/products/[id]/route.ts");
const { POST: bulk } = await import("../app/api/admin/products/bulk/route.ts");
const token = await signAccessToken({
  userId: "test-admin",
  email: "admin@example.test",
  name: "Test Admin",
  role: "ADMIN",
});
const moderatorToken = await signAccessToken({
  userId: "test-admin",
  email: "moderator@example.test",
  name: "Test Moderator",
  role: "MODERATOR",
});

function request(path, method = "GET", body, authenticated = true, accessToken = token) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(authenticated ? { cookie: `admin_access_token=${accessToken}` } : {}),
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function replaceMethod(t, object, name, replacement) {
  const original = object[name];
  object[name] = replacement;
  t.after(() => { object[name] = original; });
}

function mockStaff(t, role = "ADMIN") {
  replaceMethod(t, prisma.user, "findUnique", async () => ({
    id: "test-admin", role, isActive: true,
  }));
}

function mockTransaction(t, products, category = { id: "cat" }) {
  const updates = [];
  let query;
  replaceMethod(t, prisma, "$transaction", async (callback, options) => {
    assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
    return callback({
      category: { findUnique: async () => category },
      product: {
        findMany: async (args) => { query = args; return products; },
        update: async (args) => { updates.push(args); return args; },
      },
    });
  });
  return { updates, getQuery: () => query };
}

test("admin product routes reject unauthenticated requests", async () => {
  const cases = [
    () => GET(request("/api/admin/products", "GET", undefined, false)),
    () => POST(request("/api/admin/products", "POST", {}, false)),
    () => PATCH(request("/api/admin/products/p", "PATCH", {}, false), { params: Promise.resolve({ id: "p" }) }),
    () => DELETE(request("/api/admin/products/p", "DELETE", undefined, false), { params: Promise.resolve({ id: "p" }) }),
    () => bulk(request("/api/admin/products/bulk", "POST", {}, false)),
  ];
  for (const invoke of cases) assert.equal((await invoke()).status, 401);
});

test("admin GET forwards filters and defaults to including inactive products", async (t) => {
  mockStaff(t);
  const queries = [];
  replaceMethod(t, prisma.product, "findMany", async (args) => {
    queries.push(args);
    return [];
  });
  const response = await GET(request("/api/admin/products?categoryId=cat&search=shoe&sort=price_asc"));
  assert.equal(response.status, 200);
  assert.equal(queries[0].where.categoryId, "cat");
  assert.equal(queries[0].where.isActive, undefined);
  assert.equal(queries[0].where.AND[0].OR[0].name.contains, "shoe");
  assert.deepEqual(queries[0].where.AND[0].OR[2], {
    sku: { contains: "shoe", mode: "insensitive" },
  });
  assert.deepEqual(queries[0].orderBy, { price: "asc" });
  const active = await GET(request("/api/admin/products?includeInactive=false"));
  assert.equal(active.status, 200);
  assert.equal(queries[1].where.isActive, true);
  assert.deepEqual(queries[1].orderBy, [
    { category: { name: "asc" } }, { sku: "asc" }, { createdAt: "desc" },
  ]);
  const publicResponse = await publicGET(request("/api/products?search=shoe", "GET", undefined, false));
  assert.equal(publicResponse.status, 200);
  assert.equal(queries[2].where.isActive, true);
  assert.equal(queries[2].where.AND[0].OR.length, 2);
  assert.deepEqual(queries[2].orderBy, { createdAt: "desc" });
});

test("admin PATCH updates product fields using existing validation", async (t) => {
  mockStaff(t);
  replaceMethod(t, prisma.product, "findUnique", async () => ({
    id: "p", categoryId: "old", subCategoryId: null, price: 100, discountPrice: null,
  }));
  replaceMethod(t, prisma.category, "findUnique", async () => ({ id: "cat" }));
  let update;
  replaceMethod(t, prisma.product, "update", async (args) => { update = args; return { id: "p" }; });
  const response = await PATCH(request("/api/admin/products/p", "PATCH", {
    name: " Updated ", sku: " sku-1 ", description: " Description ",
    price: "100", discountPrice: "75", stock: "5", categoryId: "cat",
    subCategoryId: "", image: " https://example.test/image.png ", isActive: false,
  }), { params: Promise.resolve({ id: "p" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(update.data, {
    name: "Updated", sku: "SKU-1", description: "Description",
    price: 100, discountPrice: 75, stock: 5, category: { connect: { id: "cat" } },
    subCategory: { disconnect: true }, image: "https://example.test/image.png", isActive: false,
  });
  const patch = (body) => PATCH(request("/api/admin/products/p", "PATCH", body), {
    params: Promise.resolve({ id: "p" }),
  });
  assert.equal((await patch({ discountPrice: "invalid" })).status, 400);
  assert.equal((await patch({ stock: "-1" })).status, 400);
  assert.equal((await patch({ discountPrice: "100" })).status, 400);
  assert.equal((await patch({ discountPrice: "" })).status, 200);
  assert.equal(update.data.discountPrice, null);
  assert.equal((await patch({ discountPrice: "0" })).status, 200);
  assert.equal(update.data.discountPrice, 0);
});

test("moderators can delete via the admin route without bypassing order protection", async (t) => {
  mockStaff(t, "MODERATOR");
  let error;
  let calls = 0;
  replaceMethod(t, prisma.product, "delete", async () => {
    calls += 1;
    if (error) throw new Prisma.PrismaClientKnownRequestError("Delete failed", {
      code: error, clientVersion: "test",
    });
    return { id: "p" };
  });
  const context = () => ({ params: Promise.resolve({ id: "p" }) });
  const moderatorRequest = () => request("/api/admin/products/p", "DELETE", undefined, true, moderatorToken);
  assert.equal((await publicDELETE(moderatorRequest(), context())).status, 403);
  assert.equal(calls, 0);
  const response = await DELETE(moderatorRequest(), context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  error = "P2003";
  assert.equal((await DELETE(moderatorRequest(), context())).status, 409);
  error = "P2025";
  assert.equal((await DELETE(moderatorRequest(), context())).status, 404);
});

test("admin POST normalizes form inputs and preserves product validation", async (t) => {
  mockStaff(t);
  replaceMethod(t, prisma.category, "findUnique", async () => ({ id: "cat" }));
  let created;
  replaceMethod(t, prisma.product, "create", async (args) => { created = args.data; return args.data; });
  const send = (body) => POST(request("/api/admin/products", "POST", body));
  const response = await send({
    name: "Product", sku: " sku-1 ", description: " Description ",
    price: "100", discountPrice: "80", categoryId: "cat",
  });
  assert.equal(response.status, 201);
  assert.equal(created.sku, "SKU-1");
  assert.equal(created.description, "Description");
  assert.equal(created.price, 100);
  assert.equal(created.discountPrice, 80);
  assert.equal(created.stock, 20);
  assert.equal((await send({ name: "Product", price: "not-a-number", categoryId: "cat" })).status, 400);
  assert.equal((await send({ name: "Product", price: "100", discountPrice: "invalid", categoryId: "cat" })).status, 400);
  assert.equal((await send({ name: "Product", price: "100", stock: "-2", categoryId: "cat" })).status, 400);
  const withVariants = await send({
    name: "Variant product", price: 100, categoryId: "cat", isFlashSale: true,
    image: "https://example.test/image.png", images: ["https://example.test/image.png"],
    variants: [{ size: "M", stock: 3 }],
  });
  assert.equal(withVariants.status, 201);
  assert.equal(created.isFlashSale, true);
  assert.equal(created.stock, 3);
  assert.deepEqual(created.images, ["https://example.test/image.png"]);
  assert.equal(created.variants.create[0].size, "M");
});

test("bulk save validates every item before writing", async (t) => {
  mockStaff(t);
  const product = (id, price, discountPrice, variants = 0) => ({
    id, price, discountPrice, _count: { variants },
  });
  const tx = mockTransaction(t, [product("a", 100, 80), product("b", 50, null, 2)]);
  const send = (items) => bulk(request("/api/admin/products/bulk", "POST", { action: "save", items }));
  assert.equal((await send([{ id: "a", stock: 2 }, { id: "b", stock: 1 }])).status, 409);
  assert.equal((await send([{ id: "a", price: 70 }])).status, 400);
  assert.equal((await send([{ id: "a", stock: 2 }, { id: "missing", stock: 1 }])).status, 404);
  assert.equal((await send([{ id: "a", stock: 2 }, { id: "a", price: 90 }])).status, 400);
  assert.equal(tx.updates.length, 0);
  const response = await send([{ id: "a", price: 70, discountPrice: null }, { id: "b", discountPrice: 25 }]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { updated: 2 });
  assert.deepEqual(tx.updates.map((item) => item.data), [{ price: 70, discountPrice: null }, { discountPrice: 25 }]);
});

test("SAVE_ROWS normalizes rows and rejects invalid batches before writing", async (t) => {
  mockStaff(t);
  const tx = mockTransaction(t, [
    { id: "a", price: 100, discountPrice: 80, _count: { variants: 0 } },
    { id: "b", price: 20, discountPrice: null, _count: { variants: 1 } },
  ]);
  const row = { id: "a", name: " Edited ", price: "90", discountPrice: "70", stock: "5" };
  const send = (rows) => bulk(request("/api/admin/products/bulk", "POST", { action: "SAVE_ROWS", rows }));
  assert.equal((await send([row, { ...row, id: "b" }])).status, 409);
  assert.equal((await send([row, { ...row, id: "missing" }])).status, 404);
  assert.equal((await send([row, row])).status, 400);
  assert.equal((await send([{ ...row, discountPrice: "bad" }])).status, 400);
  assert.equal((await send([{ ...row, discountPrice: "90" }])).status, 400);
  assert.equal((await send([{ ...row, stock: "-1" }])).status, 400);
  assert.equal(tx.updates.length, 0);
  const response = await send([row]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { updated: 1, message: "Saved 1 modified product(s)." });
  assert.deepEqual(tx.updates[0].data, { name: "Edited", price: 90, discountPrice: 70, stock: 5 });
  tx.updates.length = 0;
  assert.equal((await send([{ ...row, price: "0.5", discountPrice: "" }])).status, 200);
  assert.equal(tx.updates[0].data.price, 1);
  assert.equal(tx.updates[0].data.discountPrice, null);
  tx.updates.length = 0;
  assert.equal((await send([{ id: "b", name: "Variant product", price: "30" }])).status, 200);
  assert.deepEqual(tx.updates[0].data, { name: "Variant product", price: 30 });
  assert.equal((await send([{ id: "a" }])).status, 400);
});

test("CATEGORY_PERCENT adjusts all category prices with the requested minimums", async (t) => {
  mockStaff(t);
  const tx = mockTransaction(t, [
    { id: "a", price: 100, discountPrice: 80, variants: [{ id: "v" }] },
    { id: "b", price: 4, discountPrice: 3, variants: [] },
    { id: "c", price: 20, discountPrice: 0, variants: [] },
    { id: "d", price: 30, discountPrice: null, variants: [] },
  ]);
  const send = (percent, categoryId = "cat") => bulk(request("/api/admin/products/bulk", "POST", {
    action: "CATEGORY_PERCENT", categoryId, percent,
  }));
  assert.equal((await send(0)).status, 400);
  assert.equal((await send("invalid")).status, 400);
  assert.equal((await send(10, "ALL")).status, 400);
  const response = await send("10");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    updated: 4, productsWithFixedPriceVariants: 1,
    message: "Updated prices by +10% across 4 products.",
  });
  assert.deepEqual(tx.getQuery().where, { categoryId: "cat" });
  assert.deepEqual(tx.updates.map((item) => item.data), [
    { price: 110, discountPrice: 88 }, { price: 10, discountPrice: 5 },
    { price: 22, discountPrice: 0 }, { price: 33, discountPrice: null },
  ]);
  tx.updates.length = 0;
  assert.equal((await send(-20)).status, 200);
  assert.deepEqual(tx.updates[0].data, { price: 80, discountPrice: 64 });
});

test("CATEGORY_PERCENT rejects invalid resulting prices without any writes", async (t) => {
  mockStaff(t);
  const tx = mockTransaction(t, [
    { id: "a", price: 1000, discountPrice: 800, variants: [] },
    { id: "b", price: 100, discountPrice: 99, variants: [] },
  ]);
  const response = await bulk(request("/api/admin/products/bulk", "POST", {
    action: "CATEGORY_PERCENT", categoryId: "cat", percent: -90,
  }));
  assert.equal(response.status, 400);
  assert.equal(tx.updates.length, 0);
  const overflow = await bulk(request("/api/admin/products/bulk", "POST", {
    action: "CATEGORY_PERCENT", categoryId: "cat", percent: 1e308,
  }));
  assert.equal(overflow.status, 400);
  assert.equal(tx.updates.length, 0);
});

test("category discounts target active products and report fixed-price variants", async (t) => {
  mockStaff(t);
  const tx = mockTransaction(t, [
    { id: "a", price: 101, variants: [{ id: "v" }] },
    { id: "b", price: 50, variants: [] },
  ]);
  const send = (percentage) => bulk(request("/api/admin/products/bulk", "POST", {
    action: "discount", categoryId: "cat", percentage,
  }));
  const response = await send(10);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { updated: 2, productsWithFixedPriceVariants: 1 });
  assert.deepEqual(tx.getQuery().where, { categoryId: "cat", isActive: true });
  assert.deepEqual(tx.updates.map((item) => item.data), [{ discountPrice: 90.9 }, { discountPrice: 45 }]);
  tx.updates.length = 0;
  assert.equal((await send(0)).status, 200);
  assert.deepEqual(tx.updates.map((item) => item.data.discountPrice), [null, null]);
  tx.updates.length = 0;
  assert.equal((await send(100)).status, 200);
  assert.deepEqual(tx.updates.map((item) => item.data.discountPrice), [0, 0]);
  tx.updates.length = 0;
  assert.equal((await send(0.00001)).status, 400);
  assert.equal(tx.updates.length, 0);
});

test("bulk endpoint reports missing categories and concurrent update conflicts", async (t) => {
  mockStaff(t);
  mockTransaction(t, [], null);
  const body = { action: "discount", categoryId: "missing", percentage: 10 };
  assert.equal((await bulk(request("/api/admin/products/bulk", "POST", body))).status, 404);
  prisma.$transaction = async () => {
    throw new Prisma.PrismaClientKnownRequestError("Conflict", { code: "P2034", clientVersion: "test" });
  };
  const response = await bulk(request("/api/admin/products/bulk", "POST", body));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /retry/i);
});
