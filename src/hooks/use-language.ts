"use client";
import { useCallback } from "react";
import { useSettings } from "./use-settings";
import { DICTIONARY, dirFor, type Language } from "@/lib/i18n";
import { loadSettings, saveSettings } from "@/lib/storage/repo";

/** Current interface language (persisted in local settings) plus its dictionary and a setter. */
export function useLanguage() {
  const settings = useSettings();
  const lang = settings.uiLanguage;
  const setLang = useCallback(async (next: Language) => {
    const current = await loadSettings();
    await saveSettings({ ...current, uiLanguage: next });
  }, []);
  return { lang, dir: dirFor(lang), t: DICTIONARY[lang], setLang };
}
