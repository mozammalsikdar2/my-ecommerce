import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test?connect_timeout=1";
process.env.JWT_ACCESS_SECRET = "test-access-secret-for-products-123456";

const { prisma } = await import("../lib/prisma.ts");
const { Prisma } = await import("@prisma/client");
const { signAccessToken } = await import("../lib/jwt.ts");
const { POST } = await import("../app/api/products/route.ts");
const { PUT } = await import("../app/api/products/[id]/route.ts");
const { DELETE } = await import("../app/api/categories/[id]/route.ts");
const token = await signAccessToken({
  userId: "test-admin",
  email: "admin@example.test",
  name: "Test Admin",
  role: "ADMIN",
});

function request(path, method, body) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      cookie: `admin_access_token=${token}`,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function mockStaff(t) {
  replaceMethod(t, prisma.user, "findUnique", async () => ({
    id: "test-admin",
    role: "ADMIN",
    isActive: true,
  }));
}

function replaceMethod(t, delegate, name, replacement) {
  const original = delegate[name];
  delegate[name] = replacement;
  t.after(() => { delegate[name] = original; });
}

test("product creation requires a category and applies SKU and stock defaults", async (t) => {
  mockStaff(t);
  const missing = await POST(request("/api/products", "POST", {
    name: "Test product",
    price: 10,
  }));
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /category is required/i);

  replaceMethod(t, prisma.category, "findUnique", async () => ({ id: "category-1" }));
  let created;
  replaceMethod(t, prisma.product, "create", async (args) => {
    created = args.data;
    return args.data;
  });
  const response = await POST(request("/api/products", "POST", {
    name: "Test product",
    price: 10,
    categoryId: "category-1",
    sku: " SKU-1 ",
    description: null,
  }));
  assert.equal(response.status, 201);
  assert.equal(created.categoryId, "category-1");
  assert.equal(created.sku, "SKU-1");
  assert.equal(created.description, "");
  assert.equal(created.stock, 25);

  const invalidSku = await POST(request("/api/products", "POST", {
    name: "Test product",
    price: 10,
    categoryId: "category-1",
    sku: "x".repeat(101),
  }));
  assert.equal(invalidSku.status, 400);

  const withVariants = await POST(request("/api/products", "POST", {
    name: "Variant product",
    price: 10,
    categoryId: "category-1",
    variants: [{ size: "M", stock: 3 }],
  }));
  assert.equal(withVariants.status, 201);
  assert.equal(created.stock, 3);
});

test("product updates cannot remove the required category", async (t) => {
  mockStaff(t);
  replaceMethod(t, prisma.product, "findUnique", async () => ({
    id: "product-1",
    categoryId: "category-1",
    subCategoryId: null,
    price: 10,
    discountPrice: null,
  }));
  const response = await PUT(
    request("/api/products/product-1", "PUT", { categoryId: null }),
    { params: Promise.resolve({ id: "product-1" }) },
  );
  assert.equal(response.status, 400);
});

test("duplicate product SKU is reported as a conflict", async (t) => {
  mockStaff(t);
  replaceMethod(t, prisma.category, "findUnique", async () => ({ id: "category-1" }));
  replaceMethod(t, prisma.product, "create", async () => {
    throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "test",
    });
  });
  const response = await POST(request("/api/products", "POST", {
    name: "Test product",
    price: 10,
    categoryId: "category-1",
    sku: "duplicate",
  }));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /SKU/);
});

test("categories containing products cannot be deleted", async (t) => {
  mockStaff(t);
  replaceMethod(t, prisma.product, "findFirst", async () => ({ id: "product-1" }));
  let deletionCalled = false;
  replaceMethod(t, prisma.category, "delete", async () => {
    deletionCalled = true;
    throw new Error("Category deletion should not run");
  });
  const response = await DELETE(
    request("/api/categories/category-1", "DELETE"),
    { params: Promise.resolve({ id: "category-1" }) },
  );
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /containing products/i);
  assert.equal(deletionCalled, false);
});

test("empty categories can still be deleted", async (t) => {
  mockStaff(t);
  replaceMethod(t, prisma.product, "findFirst", async () => null);
  replaceMethod(t, prisma.category, "delete", async () => ({ id: "category-1" }));
  const response = await DELETE(
    request("/api/categories/category-1", "DELETE"),
    { params: Promise.resolve({ id: "category-1" }) },
  );
  assert.equal(response.status, 200);
});

test("category deletion handles a concurrent product assignment", async (t) => {
  mockStaff(t);
  replaceMethod(t, prisma.product, "findFirst", async () => null);
  replaceMethod(t, prisma.category, "delete", async () => {
    throw new Prisma.PrismaClientKnownRequestError("Foreign key violation", {
      code: "P2003",
      clientVersion: "test",
    });
  });
  const response = await DELETE(
    request("/api/categories/category-1", "DELETE"),
    { params: Promise.resolve({ id: "category-1" }) },
  );
  assert.equal(response.status, 409);
});
