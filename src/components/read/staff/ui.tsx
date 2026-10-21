"use client";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";
import { ApiFailure, get, post } from "@/lib/read/api";
import { useLoad } from "../common";

export interface StaffActor {
  id: string;
  role: "platform_admin" | "school_admin" | "teacher";
  name: string;
  email: string;
  schoolId: string | null;
  classIds: string[] | null;
}

export const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm";
export const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm placeholder:text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-brand-600";
export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50";
export const btn2 =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-50";
export const btnDanger =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50";

export function msgOf(e: unknown): string {
  if (e instanceof ApiFailure)
    return e.status === 0
      ? "Could not reach the server. Check your connection."
      : e.status === 429
        ? "Too many tries. Please wait a few minutes."
        : e.message;
  return "Something went wrong. Please try again.";
}

/** Shell for staff areas: English-only dashboard, brand header, sign-out. Redirects to /staff when signed out or in the wrong area. */
export function StaffFrame({
  area,
  title,
  children,
}: {
  area: "school" | "admin";
  title: string;
  children: (actor: StaffActor) => React.ReactNode;
}) {
  const router = useRouter();
  const { data, error, loading, reload } = useLoad(
    () => get<{ actor: StaffActor }>("staff/me"),
    [],
  );
  useEffect(() => {
    if (error instanceof ApiFailure && error.status === 401) router.replace("/staff");
    if (data) {
      if (area === "admin" && data.actor.role !== "platform_admin") router.replace("/school");
      if (area === "school" && data.actor.role === "platform_admin") router.replace("/admin");
    }
  }, [error, data, area, router]);

  if (loading) return <p className="p-10 text-center text-[var(--muted)]">Loading…</p>;
  if (error && !(error instanceof ApiFailure && error.status === 401)) {
    return (
      <div className="p-10 text-center">
        <p role="alert">{msgOf(error)}</p>
        <button className={`${btn} mt-3`} onClick={reload}>
          Try again
        </button>
      </div>
    );
  }
  if (!data) return null;
  const a = data.actor;
  if ((area === "admin") !== (a.role === "platform_admin")) return null;
  return (
    <div dir="ltr" lang="en" className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link href="/" aria-label="Ghadi">
            <Wordmark />
          </Link>
          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">
            {a.role === "platform_admin"
              ? "Platform admin"
              : a.role === "school_admin"
                ? "School admin"
                : "Teacher"}
          </span>
          <span className="ms-auto hidden text-sm text-[var(--muted)] sm:block">{a.name}</span>
          <ThemeToggle />
          <button
            className="rounded-lg p-2 hover:bg-[var(--surface-2)]"
            aria-label="Sign out"
            onClick={async () => {
              await post("staff/logout").catch(() => undefined);
              router.replace("/staff");
            }}
          >
            <LogOut aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 pt-5">
        <h1 className="mb-4 text-2xl font-extrabold text-brand-800 dark:text-brand-100">{title}</h1>
        {children(a)}
      </main>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            value === t.id
              ? "border-brand-600 text-brand-700 dark:text-brand-300"
              : "border-transparent text-[var(--muted)] hover:text-[var(--foreground,inherit)]",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className={card}>
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-sm text-[var(--muted)]">{label}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "ok";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        tone === "error"
          ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
          : tone === "ok"
            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
            : "bg-brand-50 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100",
      )}
    >
      {children}
    </p>
  );
}

/** Runs an action with busy/error/ok state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const r = await fn();
      if (success) setOk(success);
      return r;
    } catch (e) {
      setError(msgOf(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    ok,
    run,
    clear: () => {
      setError(null);
      setOk(null);
    },
  };
}

export function Bars({ rows, label }: { rows: { key: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0) return <p className="text-sm text-[var(--muted)]">No data yet.</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 truncate text-[var(--muted)]">{r.key}</span>
          <span className="h-3 flex-1 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900/40">
            <span
              className="block h-full rounded-full bg-brand-600"
              style={{ width: `${(r.n / max) * 100}%` }}
            />
          </span>
          <span className="w-8 text-end tabular-nums">{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

export function AuditTable({
  events,
}: {
  events: {
    id: string;
    at: string;
    action: string;
    actor_name: string | null;
    actor_kind: string;
    school_name?: string | null;
    detail: unknown;
  }[];
}) {
  if (events.length === 0)
    return <p className="text-sm text-[var(--muted)]">Nothing recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-start text-xs uppercase text-[var(--muted)]">
            <th className="py-2 pe-3 text-start">When</th>
            <th className="pe-3 text-start">Who</th>
            <th className="pe-3 text-start">What</th>
            <th className="text-start">Details</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-[var(--border)] align-top">
              <td className="whitespace-nowrap py-2 pe-3">{new Date(e.at).toLocaleString()}</td>
              <td className="pe-3">
                {e.actor_name ?? e.actor_kind}
                {e.school_name ? (
                  <span className="block text-xs text-[var(--muted)]">{e.school_name}</span>
                ) : null}
              </td>
              <td className="pe-3 font-mono text-xs">{e.action}</td>
              <td className="max-w-xs break-words text-xs text-[var(--muted)]">
                {e.detail && Object.keys(e.detail as object).length ? JSON.stringify(e.detail) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Shows a one-time secret (new student ID, invite link) with copy. It is never stored client-side. */
export function Secret({ label, value, note }: { label: string; value: string; note: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border-2 border-dashed border-brand-400 bg-brand-50 p-3 dark:bg-brand-900/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-200">
        {label}
      </p>
      <p
        dir="ltr"
        className="select-all break-all py-1 font-mono text-lg font-bold"
        data-testid="secret"
      >
        {value}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={btn2}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              /* select-all lets them copy by hand */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <span className="text-xs text-[var(--muted)]">{note}</span>
      </div>
    </div>
  );
}
