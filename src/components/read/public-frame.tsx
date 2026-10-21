"use client";
import Link from "next/link";
import { Wordmark } from "@/components/layout/logo";
import { GhadiMascot } from "@/components/mascot";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useReadLang } from "@/lib/read/lang";
import { LangSwitch } from "./student-shell";

/** Centered card on the brand's soft purple ground, used by sign-in, join and staff entry pages. */
export function PublicFrame({
  title,
  intro,
  children,
  wide = false,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { t } = useReadLang();
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-[var(--background)] dark:from-brand-900/30">
      <header className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Link href="/" aria-label="Ghadi">
          <Wordmark />
        </Link>
        <div className="ms-auto flex items-center gap-2">
          <LangSwitch />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className={`mx-auto px-4 pb-16 pt-4 ${wide ? "max-w-3xl" : "max-w-md"}`}>
        <div className="mb-5 flex items-end gap-4">
          <GhadiMascot className="h-24 w-20 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold leading-tight text-brand-800 dark:text-brand-100">
              {title}
            </h1>
            {intro ? <p className="mt-1 text-sm text-[var(--muted)]">{intro}</p> : null}
          </div>
        </div>
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          {children}
        </div>
        <p className="mt-4 text-center text-xs text-[var(--muted)]">{t("appTagline")}</p>
      </main>
    </div>
  );
}

export const inputCls =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base placeholder:text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-brand-600";
export const primaryBtn =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60";
export const secondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--surface-2)]";

export function FieldBox({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p
      role="alert"
      className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
    >
      {text}
    </p>
  );
}
