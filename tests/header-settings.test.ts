import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultHeaderSettings,
  headerSettingsSchema,
} from "../types/header-settings";

test("header settings accept supported languages, icons and partial updates", () => {
  const parsed = headerSettingsSchema.parse({
    ...defaultHeaderSettings,
    defaultLanguage: "BN",
    cameraIconUrl: "/uploads/camera.svg",
    storeLocationsUrl: "https://example.test/locations",
  });
  assert.equal(parsed.defaultLanguage, "BN");
  assert.equal(parsed.cameraIconUrl, "/uploads/camera.svg");
  assert.equal(headerSettingsSchema.partial().safeParse({ showBottomCall: true }).success, true);
});

test("header settings reject unsupported languages, colors and unsafe URLs", () => {
  for (const change of [
    { defaultLanguage: "FR" },
    { headerTopBgColor: "blue" },
    { cameraIconUrl: "//example.test/icon.svg" },
    { footerFacebookIconUrl: "javascript:alert(1)" },
    { storeLocationsUrl: "javascript:alert(1)" },
    { showBottomCall: "true" },
  ]) {
    assert.equal(
      headerSettingsSchema.safeParse({ ...defaultHeaderSettings, ...change }).success,
      false,
    );
  }
});
