import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import FloatingChatButtons from "../components/FloatingChatButtons";
import { SettingsProvider } from "../context/SettingsContext";
import { defaultSettings, type SiteSettings } from "../types/settings";

const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "test",
};

function renderButtons(settings: Partial<SiteSettings>) {
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <SettingsProvider initialSettings={{ ...defaultSettings, ...settings }}>
        <FloatingChatButtons />
      </SettingsProvider>
    </AppRouterContext.Provider>,
  );
}

test("floating contact buttons use enabled settings, links and custom icons", () => {
  const html = renderButtons({
    showBottomCall: true,
    headerCallNumber: "+880 (123) 456",
    bottomCallIconUrl: "/call.png",
    showBottomMessenger: true,
    messengerUsername: "https://facebook.com/example",
    bottomMessengerIconUrl: "/messenger.png",
    showBottomWhatsapp: true,
    whatsappNumber: "+880 123",
    bottomWhatsappIconUrl: "/whatsapp.png",
  });
  assert.match(html, /href="tel:\+880123456"/);
  assert.match(html, /href="https:\/\/m\.me\/example"/);
  assert.match(html, /href="https:\/\/wa\.me\/880123\?text=/);
  for (const icon of ["call", "messenger", "whatsapp"]) {
    assert.match(html, new RegExp(`src="/${icon}\\.png"`));
  }
});

test("floating contact buttons hide disabled and invalid destinations", () => {
  const mixed = renderButtons({
    showBottomCall: false,
    showBottomMessenger: false,
    messengerUsername: "example",
    showBottomWhatsapp: true,
    whatsappNumber: "123",
    bottomWhatsappIconUrl: "",
  });
  assert.match(mixed, /aria-label="Chat on WhatsApp"/);
  assert.match(mixed, /<svg/);
  assert.doesNotMatch(mixed, /aria-label="(?:Call Us|Chat on Messenger)"/);

  const disabled = renderButtons({
    showBottomCall: false,
    showBottomMessenger: false,
    showBottomWhatsapp: false,
    messengerUsername: "example",
    whatsappNumber: "123",
  });
  assert.doesNotMatch(disabled, /Bottom Quick Contact Icons/);

  const invalid = renderButtons({
    showBottomCall: true,
    headerCallNumber: "+",
    showBottomMessenger: true,
    messengerUsername: "https://example.com/unsafe",
    showBottomWhatsapp: true,
    whatsappNumber: "",
  });
  assert.doesNotMatch(invalid, /Bottom Quick Contact Icons/);
});
