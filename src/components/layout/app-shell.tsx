"use client";
import {
  BarChart3,
  BookOpen,
  Brain,
  FileText,
  Layers,
  Library,
  Menu,
  NotebookPen,
  Settings,
  X,
  ListChecks,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { UiProvider, Notice } from "@/components/ui/primitives";
import { isStorageAvailable } from "@/lib/storage/db";
import { Wordmark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/library", label: "My Library", icon: Library },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/notes", label: "Study Notes", icon: NotebookPen },
  { href: "/quizzes", label: "Quizzes", icon: ListChecks },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/review", label: "Review", icon: Brain },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The mobile menu is "open" only for the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);
  const storageOk = useSyncExternalStore(
    () => () => {},
    isStorageAvailable,
    () => true,
  );

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              active
                ? "bg-brand-600 text-white"
                : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <UiProvider>
      <div className="flex min-h-screen">
        <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-[var(--border)] bg-[var(--surface)] p-4 md:flex">
          <Link href="/" aria-label="Ghadi home">
            <Wordmark />
          </Link>
          {nav}
          <p className="mt-auto flex items-center gap-2 text-xs text-[var(--muted)]">
            <BookOpen className="h-3 w-3" aria-hidden /> Your data stays on this device.
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 md:justify-end">
            <button
              type="button"
              className="rounded-lg p-2 hover:bg-[var(--surface-2)] md:hidden"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="md:hidden">
              <Wordmark />
            </div>
            <ThemeToggle />
          </header>

          {open ? (
            <div
              className="no-print fixed inset-0 z-40 md:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
            >
              <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-0 flex h-full w-64 flex-col gap-6 bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between">
                  <Wordmark />
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setOpen(false)}
                    className="rounded p-1 hover:bg-[var(--surface-2)]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {nav}
              </div>
            </div>
          ) : null}

          <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8">
            {!storageOk ? (
              <div className="mb-4">
                <Notice tone="warn">
                  Local storage is unavailable in this browser (private mode or blocked site data).
                  Ghadi cannot save your work. Use a normal window or allow site data.
                </Notice>
              </div>
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </UiProvider>
  );
}
