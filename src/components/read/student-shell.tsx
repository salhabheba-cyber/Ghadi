"use client";
import { BookOpen, Compass, Home, LineChart, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useReadLang, hasStoredLang } from "@/lib/read/lang";
import { LANGS, LANG_NAMES, type Lang } from "@/lib/read/strings";
import { ApiFailure, get, post } from "@/lib/read/api";
import { errorText, useLoad } from "./common";

export interface Me {
  id: string;
  displayName: string;
  nickname: string | null;
  age: number;
  language: Lang;
  schoolName: string;
  className: string | null;
  hasPin: boolean;
  showOnLeaderboard: boolean;
  aiConsent: boolean;
  leaderboardEnabled: boolean;
  classLeaderboardEnabled: boolean;
}
interface MeCtx {
  me: Me;
  aiAvailable: boolean;
  achievements: { code: string; icon: string; en: string; fr: string; ar: string }[];
  refresh: () => void;
}
const MeContext = createContext<MeCtx | null>(null);
export const useMe = () => {
  const c = useContext(MeContext);
  if (!c) throw new Error("useMe outside StudentShell");
  return c;
};

export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useReadLang();
  return (
    <label className={cn("flex items-center", className)}>
      <span className="sr-only">{t("language")}</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
      >
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

const TABS = [
  { href: "/read", key: "home", icon: Home, exact: true },
  { href: "/read/books", key: "myBooks", icon: BookOpen, exact: false },
  { href: "/read/explore", key: "explore", icon: Compass, exact: false },
  { href: "/read/progress", key: "progress", icon: LineChart, exact: false },
] as const;

export function StudentShell({
  children,
  bare = false,
}: {
  children: React.ReactNode;
  bare?: boolean;
}) {
  const { t, setLang } = useReadLang();
  const router = useRouter();
  const pathname = usePathname();
  const { data, error, loading, reload } = useLoad(
    () => get<{ me: Me; ai: boolean; achievements: MeCtx["achievements"] }>("me"),
    [],
  );

  useEffect(() => {
    if (error instanceof ApiFailure && error.status === 401) router.replace("/login");
  }, [error, router]);
  // A child who has not picked an interface language yet gets their reading language.
  useEffect(() => {
    if (data && !hasStoredLang()) setLang(data.me.language);
  }, [data, setLang]);

  if (loading || (error instanceof ApiFailure && error.status === 401)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--muted)]">
        {t("loading")}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p>{errorText(error, t)}</p>
        <button onClick={reload} className="rounded-lg bg-brand-600 px-4 py-2 text-white">
          {t("retry")}
        </button>
      </div>
    );
  }
  const ctx: MeCtx = {
    me: data.me,
    aiAvailable: data.ai,
    achievements: data.achievements,
    refresh: reload,
  };

  async function signOut() {
    await post("logout").catch(() => undefined);
    router.replace("/login");
  }

  if (bare) return <MeContext.Provider value={ctx}>{children}</MeContext.Provider>;

  return (
    <MeContext.Provider value={ctx}>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
            <Link href="/read" aria-label="Ghadi">
              <Wordmark />
            </Link>
            <nav aria-label={t("home")} className="ms-4 hidden items-center gap-1 md:flex">
              {TABS.map(({ href, key, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
                      active
                        ? "bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-100"
                        : "hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <Icon aria-hidden className="h-4 w-4" />
                    {t(key)}
                  </Link>
                );
              })}
            </nav>
            <div className="ms-auto flex items-center gap-2">
              <Link
                href="/"
                className="hidden rounded-lg px-2 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)] sm:inline-flex"
              >
                {t("studyTools")}
              </Link>
              <LangSwitch />
              <ThemeToggle />
              <button
                onClick={signOut}
                className="rounded-lg p-2 hover:bg-[var(--surface-2)]"
                aria-label={t("signOut")}
                title={t("signOut")}
              >
                <LogOut aria-hidden className="h-4 w-4 rtl:rotate-180" />
              </button>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 md:pb-10">
          {children}
        </main>
        <nav
          aria-label={t("home")}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <ul className="mx-auto grid max-w-md grid-cols-4">
            {TABS.map(({ href, key, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                      active ? "text-brand-700 dark:text-brand-300" : "text-[var(--muted)]",
                    )}
                  >
                    <Icon aria-hidden className={cn("h-5 w-5", active && "stroke-[2.6]")} />
                    {t(key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </MeContext.Provider>
  );
}
