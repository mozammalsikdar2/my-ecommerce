"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSettings } from "@/context/SettingsContext";
import type { HeaderSettings } from "@/types/header-settings";

export type AppLanguage = HeaderSettings["defaultLanguage"];

const translations = {
  EN: {
    storeLocations: "STORE LOCATIONS",
    trackOrder: "Track Order",
    settings: "Settings",
    searchPlaceholder: "Search for Products...",
    signIn: "Sign In",
    yourAccount: "Your Account",
    myAccount: "My Account",
    allCategories: "All Categories",
    hotline: "Hotline",
    photoSearch: "Photo Search",
    noCategories: "No categories added yet",
    viewAllIn: "View all in",
  },
  BN: {
    storeLocations: "স্টোর লোকেশন",
    trackOrder: "অর্ডার ট্র্যাক",
    settings: "সেটিংস",
    searchPlaceholder: "পণ্য খুঁজুন...",
    signIn: "সাইন ইন",
    yourAccount: "আপনার অ্যাকাউন্ট",
    myAccount: "আমার অ্যাকাউন্ট",
    allCategories: "সকল ক্যাটাগরি",
    hotline: "হটলাইন",
    photoSearch: "ছবি দিয়ে খুঁজুন",
    noCategories: "কোনো ক্যাটাগরি যোগ করা হয়নি",
    viewAllIn: "সব দেখুন:",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

interface LanguageContextValue {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  t: (key: keyof typeof translations.EN) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const STORAGE_KEY = "storefront_lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage | null>(null);
  const lang = selectedLanguage ?? settings.defaultLanguage;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === "EN" || saved === "BN") {
          setSelectedLanguage((current) => current ?? saved);
        }
      } catch (error) {
        console.error("Unable to restore the storefront language:", error);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setLang = (next: AppLanguage) => {
    setSelectedLanguage(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      console.error("Unable to save the storefront language:", error);
    }
  };

  const t = (key: keyof typeof translations.EN) => translations[lang][key];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
