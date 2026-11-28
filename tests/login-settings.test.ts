import assert from "node:assert/strict";
import test from "node:test";
import { defaultLoginSettings, loginSettingsSchema } from "../types/login-settings";

test("login settings accept valid customizations", () => {
  const parsed = loginSettingsSchema.parse({
    ...defaultLoginSettings,
    loginBgImageUrl: "/uploads/login.webp",
    loginCardOpacity: 30,
    userRegistrationEnabled: false,
  });
  assert.equal(parsed.loginBgImageUrl, "/uploads/login.webp");
  assert.equal(parsed.loginCardOpacity, 30);
  assert.equal(parsed.userRegistrationEnabled, false);
});

test("login settings reject unsafe URLs, invalid colors and opacity", () => {
  for (const change of [
    { loginBgImageUrl: "//example.com/image.png" },
    { loginBgImageUrl: "javascript:alert(1)" },
    { loginGoldColor: "red" },
    { loginCardOpacity: 29 },
    { loginCardOpacity: 91 },
    { userRegistrationEnabled: "false" },
  ]) {
    assert.equal(
      loginSettingsSchema.safeParse({ ...defaultLoginSettings, ...change }).success,
      false,
    );
  }
});
