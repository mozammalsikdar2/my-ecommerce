"use client";

import Image from "next/image";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { SiteSettings } from "@/types/settings";
import { headerSettingsSchema } from "@/types/header-settings";

type IconField =
  | "storeLocationsIconUrl"
  | "cameraIconUrl"
  | "accountIconUrl"
  | "cartIconUrl"
  | "headerMessengerIconUrl"
  | "headerWhatsappIconUrl"
  | "headerCallIconUrl"
  | "bottomWhatsappIconUrl"
  | "bottomMessengerIconUrl"
  | "bottomCallIconUrl"
  | "footerFacebookIconUrl"
  | "footerInstagramIconUrl"
  | "footerYoutubeIconUrl";

const colors = [
  ["headerTopBgColor", "Top utility bar color"],
  ["headerMainBgColor", "Main header and categories button color"],
  ["headerSearchBtnColor", "Search and cart accent color"],
  ["categoryBarBgColor", "Category bar color"],
] as const;

const sections = [
  {
    title: "Top utility bar",
    toggles: [["showTopUtilityBar", "Show utility bar"], ["showTrackOrder", "Show track order"]],
    fields: [
      ["storeLocationsText", "Store locations label"],
      ["storeLocationsUrl", "Store locations link"],
      ["trackOrderText", "Track order label"],
      ["announcementText", "Announcement"],
    ],
    icons: [["storeLocationsIconUrl", "Store locations icon"]],
  },
  {
    title: "Action icons and language",
    toggles: [["enableLanguageSwitcher", "Show language switcher"], ["showCameraSearchIcon", "Show photo search"]],
    fields: [],
    icons: [["accountIconUrl", "Account icon"], ["cartIconUrl", "Cart icon"], ["cameraIconUrl", "Photo search icon"]],
  },
  {
    title: "Category row contact icons",
    toggles: [["showHeaderMessenger", "Show Messenger"], ["showHeaderWhatsapp", "Show WhatsApp"], ["showHeaderCall", "Show hotline"]],
    fields: [["messengerUsername", "Messenger page username"], ["whatsappNumber", "WhatsApp number"], ["headerCallNumber", "Hotline number"], ["headerCallLabel", "Hotline label"]],
    icons: [["headerMessengerIconUrl", "Messenger icon"], ["headerWhatsappIconUrl", "WhatsApp icon"], ["headerCallIconUrl", "Hotline icon"]],
  },
  {
    title: "Floating and footer icons",
    toggles: [["showBottomMessenger", "Show floating Messenger"], ["showBottomWhatsapp", "Show floating WhatsApp"], ["showBottomCall", "Show floating call"]],
    fields: [],
    icons: [["bottomMessengerIconUrl", "Floating Messenger icon"], ["bottomWhatsappIconUrl", "Floating WhatsApp icon"], ["bottomCallIconUrl", "Floating call icon"], ["footerFacebookIconUrl", "Footer Facebook icon"], ["footerInstagramIconUrl", "Footer Instagram icon"], ["footerYoutubeIconUrl", "Footer YouTube icon"]],
  },
] as const satisfies readonly {
  title: string;
  toggles: readonly (readonly [keyof SiteSettings, string])[];
  fields: readonly (readonly [keyof SiteSettings, string])[];
  icons: readonly (readonly [IconField, string])[];
}[];

interface HeaderSettingsPanelProps {
  formData: SiteSettings;
  setFormOverrides: Dispatch<SetStateAction<Partial<SiteSettings>>>;
  handleChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  handleFileUpload: (file: File, field: string, onSuccess: (url: string) => void) => Promise<void>;
  uploadingField: string | null;
}

export default function HeaderSettingsPanel({
  formData,
  setFormOverrides,
  handleChange,
  handleFileUpload,
  uploadingField,
}: HeaderSettingsPanelProps) {
  return (
    <div>
      <h2 className="mb-2 border-b pb-2 text-lg font-semibold">Header, Language &amp; Icons</h2>
      <p className="text-sm text-gray-500">Configure storefront navigation, language, contact buttons and icons. Leave an icon URL blank to use its default.</p>
      <section className="mt-6">
        <h3 className="mb-3 text-sm font-bold">Header colors</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {colors.map(([field, label]) => (
            <div key={field}>
              <label htmlFor={`${field}-picker`} className="text-xs font-bold text-gray-700">{label}</label>
              <div className="mt-1 flex gap-2">
                <input id={`${field}-picker`} type="color" name={field} value={formData[field]} onChange={handleChange} className="h-10 w-12 rounded border" />
                <input aria-label={`${label} hex`} type="text" name={field} value={formData[field]} onChange={handleChange} maxLength={7} pattern="#[0-9a-fA-F]{6}" required className="w-full rounded-lg border p-2.5 font-mono text-sm" />
              </div>
            </div>
          ))}
        </div>
      </section>
      {sections.map((section) => (
        <section key={section.title} className="mt-6 border-t pt-5">
          <h3 className="mb-3 text-sm font-bold">{section.title}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.toggles.map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={formData[field]} onChange={(event) => setFormOverrides((previous) => ({ ...previous, [field]: event.target.checked }))} />
                {label}
              </label>
            ))}
            {section.title === "Action icons and language" && (
              <label className="text-xs font-bold text-gray-700">
                Default storefront language
                <select name="defaultLanguage" value={formData.defaultLanguage} onChange={handleChange} className="mt-1 block w-full rounded-lg border bg-white p-2.5 text-sm">
                  <option value="EN">English (EN)</option>
                  <option value="BN">Bengali (বাংলা)</option>
                </select>
              </label>
            )}
            {section.fields.map(([field, label]) => (
              <label key={field} className="text-xs font-bold text-gray-700">
                {label}
                <input type="text" name={field} value={formData[field]} onChange={handleChange} className="mt-1 block w-full rounded-lg border p-2.5 text-sm" />
              </label>
            ))}
            {section.icons.map(([field, label]) => (
              <div key={field}>
                <label htmlFor={field} className="text-xs font-bold text-gray-700">{label} URL</label>
                <div className="mt-1 flex items-center gap-2">
                  {formData[field] && headerSettingsSchema.shape[field].safeParse(formData[field]).success && (
                    <Image src={formData[field]} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded border object-contain p-1" />
                  )}
                  <input id={field} name={field} type="text" value={formData[field]} onChange={handleChange} maxLength={2048} placeholder="Blank = default icon" className="min-w-0 flex-1 rounded-lg border p-2 text-xs" />
                </div>
                <label className="mt-1 block text-xs text-gray-600">
                  {uploadingField === field ? `Uploading ${label}...` : `Upload ${label}`}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" disabled={uploadingField !== null} onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void handleFileUpload(file, field, (url) => setFormOverrides((previous) => ({ ...previous, [field]: url })));
                  }} className="mt-1 block w-full text-xs" />
                </label>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
