import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import HeaderSettingsPanel from "../components/HeaderSettingsPanel";
import StoreFooter from "../components/StoreFooter";
import { SettingsProvider } from "../context/SettingsContext";
import { defaultSettings } from "../types/settings";

const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "test",
};

test("header settings expose controls for contact icons and navigation", () => {
  const html = renderToStaticMarkup(
    <HeaderSettingsPanel
      formData={{ ...defaultSettings, showBottomCall: true, bottomCallIconUrl: "/call.png" }}
      setFormOverrides={() => {}}
      handleChange={() => {}}
      handleFileUpload={async () => {}}
      uploadingField={null}
    />,
  );
  assert.match(html, /name="categoryBarBgColor"/);
  assert.match(html, /name="storeLocationsUrl"/);
  assert.match(html, /name="defaultLanguage"/);
  assert.match(html, /checked=""[^>]*\/>Show floating call/);
  assert.match(html, /src="\/call\.png"/);
  assert.match(html, /Upload Footer YouTube icon/);
});

test("footer uses custom social icons without changing links", () => {
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/">
        <SettingsProvider initialSettings={{
          ...defaultSettings,
          facebookUrl: "https://facebook.com/store",
          footerFacebookIconUrl: "/facebook-icon.png",
          instagramUrl: "",
          footerInstagramIconUrl: "/instagram-icon.png",
        }}>
          <StoreFooter />
        </SettingsProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
  assert.match(html, /href="https:\/\/facebook\.com\/store"/);
  assert.match(html, /src="\/facebook-icon\.png"/);
  assert.doesNotMatch(html, /instagram-icon\.png/);
});
