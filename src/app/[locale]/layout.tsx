import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import "../globals.css";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { BrandMark } from "@/components/BrandMark";
import { SupportChat } from "@/components/SupportChat";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { DEFAULT_LOCALE, getMessages, isDraftLocale } from "@/lib/i18n/messages";
import { isRtl, Locale } from "@/lib/schemas";
import { getViewer } from "@/lib/session";
import { signOutAction } from "./actions";

export const metadata: Metadata = { title: { default: "GHADI", template: "%s · GHADI" }, description: "Learn today. Grow for tomorrow.",
  appleWebApp: { capable: true, title: "GHADI", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#b4492a", width: "device-width", initialScale: 1 };

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const parsed = Locale.safeParse((await params).locale);
  if (!parsed.success) redirect(`/${DEFAULT_LOCALE}`);
  const locale = parsed.data;
  const m = getMessages(locale);
  const viewer = await getViewer();
  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"}>
      <body>
        <RegisterServiceWorker />
        <a className="skip-link" href="#main">{m.skip}</a>
        <header className="site-header">
          <div className="container">
            <a className="brand" href={`/${locale}`}>
              <BrandMark />
              <span>{m.brand}<small>{m.tagline}</small></span>
            </a>
            <div className="nav">
              <LocaleSwitcher current={locale} />
              {viewer ? (
                <>
                  <a className="btn btn-sm btn-secondary" href={`/${locale}/parent`}>{m.header.parentArea}</a>
                  <form action={signOutAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <button className="btn btn-sm btn-quiet">{m.header.signOut}</button>
                  </form>
                </>
              ) : (
                <>
                  <a className="btn btn-sm btn-quiet" href={`/${locale}/sign-in`}>{m.header.signIn}</a>
                  <a className="btn btn-sm btn-primary" href={`/${locale}/sign-up`}>{m.header.signUp}</a>
                </>
              )}
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="container">
            {isDraftLocale(locale) && <div className="alert warn" role="note" style={{ marginBottom: "1rem" }}>{m.common.draftTranslation}</div>}
            {children}
          </div>
        </main>
        <footer className="container small muted" style={{ padding: "1.5rem 0" }}>
          <a href={`/${locale}/privacy`}>Privacy (draft)</a> · <a href={`/${locale}/terms`}>Terms (draft)</a>
        </footer>
        <SupportChat locale={locale} email={viewer && !viewer.email.endsWith(".invalid") ? viewer.email : null} />
      </body>
    </html>
  );
}
