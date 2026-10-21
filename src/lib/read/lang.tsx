"use client";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { dirOf, tr, type Lang, type StrKey, LANGS } from "./strings";

const KEY = "ghadi_read_lang";
const EVENT = "ghadi-read-lang";

function stored(): Lang | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v && (LANGS as string[]).includes(v) ? (v as Lang) : null;
  } catch {
    return null;
  }
}
function fromBrowser(): Lang {
  const n = (typeof navigator !== "undefined" ? navigator.language : "en")
    .slice(0, 2)
    .toLowerCase();
  return n === "ar" || n === "fr" ? n : "en";
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function setReadLang(l: Lang) {
  try {
    window.localStorage.setItem(KEY, l);
  } catch {
    /* storage may be blocked; the choice then lasts until reload */
  }
  window.dispatchEvent(new Event(EVENT));
}

interface Ctx {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: (k: StrKey) => string;
  setLang: (l: Lang) => void;
}
const LangContext = createContext<Ctx | null>(null);

export function ReadLangProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore<Lang>(
    subscribe,
    () => stored() ?? fromBrowser(),
    () => "en",
  );
  const setLang = useCallback((l: Lang) => setReadLang(l), []);
  const value = useMemo<Ctx>(
    () => ({ lang, dir: dirOf(lang), t: (k) => tr(lang, k), setLang }),
    [lang, setLang],
  );
  return (
    <LangContext.Provider value={value}>
      <div dir={value.dir} lang={lang} className="min-h-screen">
        {children}
      </div>
    </LangContext.Provider>
  );
}

export function useReadLang(): Ctx {
  const c = useContext(LangContext);
  if (!c) throw new Error("useReadLang must be used inside ReadLangProvider");
  return c;
}

/** True once the child has chosen a language on this device, so a signed-in profile language can seed the first visit. */
export function hasStoredLang(): boolean {
  return stored() !== null;
}
