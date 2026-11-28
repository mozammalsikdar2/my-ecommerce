import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { signAccessToken } from "../lib/jwt";
import { proxy } from "../proxy";

test("admin login preview is available without changing normal redirects", async () => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "test-access-secret-for-preview-only-12345";
  try {
    const token = await signAccessToken({
      userId: "test-admin",
      email: "admin@example.test",
      name: "Test Admin",
      role: "ADMIN",
    });
    const request = (path: string) =>
      new NextRequest(`http://localhost:3000${path}`, {
        headers: { cookie: `admin_access_token=${token}` },
      });

    const regular = await proxy(request("/admin/login"));
    assert.equal(regular.status, 307);
    assert.equal(regular.headers.get("location"), "http://localhost:3000/admin");

    const preview = await proxy(request("/admin/login?preview=1"));
    assert.equal(preview.status, 200);

    const unauthenticated = await proxy(
      new NextRequest("http://localhost:3000/admin/settings"),
    );
    assert.equal(unauthenticated.status, 307);
    assert.match(unauthenticated.headers.get("location") ?? "", /\/admin\/login/);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousSecret;
  }
});
