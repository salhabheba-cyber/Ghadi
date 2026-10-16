"use client";
import { usePathname } from "next/navigation";
import { LOCALES, type Locale } from "@/lib/schemas";
import { getMessages } from "@/lib/i18n/messages";

export function LocaleSwitcher({ current }: { current: Locale }) {
  const path = usePathname() ?? `/${current}`;
  const rest = path.split("/").slice(2).join("/");
  const names = getMessages(current).langNames;
  return (
    <nav aria-label={getMessages(current).common.language} className="row" style={{ gap: "0.25rem" }}>
      {LOCALES.map((l) => (
        <a key={l} href={`/${l}${rest ? `/${rest}` : ""}`} lang={l} hrefLang={l} className={`btn btn-sm ${l === current ? "btn-primary" : "btn-quiet"}`} aria-current={l === current ? "true" : undefined}>
          {names[l]}
        </a>
      ))}
    </nav>
  );
}
