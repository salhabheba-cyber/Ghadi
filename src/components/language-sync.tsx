"use client";
import { useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";

/** Keeps <html lang> and <html dir> in step with the saved interface language (Arabic is RTL). */
export function LanguageSync() {
  const { lang, dir } = useLanguage();
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);
  return null;
}
