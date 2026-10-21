"use client";
import { Award, Clock, Medal, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useReadLang } from "@/lib/read/lang";
import { LANG_NAMES } from "@/lib/read/strings";
import { ApiFailure } from "@/lib/read/api";
import type { BookCardData } from "@/lib/read/types";

export type { BookCardData };

/** Interface-language label for a leaderboard period; challenge names are the school's own text. */
export function periodLabel(
  key: string,
  fallback: string,
  t: (k: "periodMonth" | "periodYear" | "periodAll") => string,
): string {
  return key === "month"
    ? t("periodMonth")
    : key === "year"
      ? t("periodYear")
      : key === "all"
        ? t("periodAll")
        : fallback;
}

/** Cover image, or a purple tile with the title when a book has no legally usable cover. */
export function Cover({
  book,
  className,
}: {
  book: Pick<BookCardData, "title" | "cover_path" | "language">;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={cn(
        "relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-sm",
        className,
      )}
    >
      {book.cover_path && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- local static cover already sized at build time
        <img
          src={book.cover_path}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          dir={book.language === "ar" ? "rtl" : "ltr"}
          className="flex h-full items-center justify-center p-3 text-center text-sm font-bold leading-snug"
        >
          {book.title}
        </div>
      )}
    </div>
  );
}

export function BookCard({
  book,
  progress,
  href,
}: {
  book: BookCardData;
  progress?: { percent: number; completed?: boolean };
  href?: string;
}) {
  const { t } = useReadLang();
  return (
    <Link
      href={href ?? `/read/book/${book.slug}`}
      className="group flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <Cover book={book} />
      <div className="min-w-0 px-1 pb-1">
        <p dir="auto" className="line-clamp-2 text-sm font-semibold leading-snug">
          {book.title}
        </p>
        <p dir="auto" className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">
          {book.author}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
          <span className="rounded-full bg-brand-100 px-2 py-0.5 font-medium text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">
            {LANG_NAMES[book.language]}
          </span>
          <span>
            {t("agesRange")} {book.age_min}–{book.age_max}
          </span>
          {book.est_minutes ? (
            <span className="inline-flex items-center gap-0.5">
              <Clock aria-hidden className="h-3 w-3" />
              {book.est_minutes} {t("minutesShort")}
            </span>
          ) : null}
        </div>
        {progress ? (
          <div className="mt-2">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900/50"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress.percent)}
              aria-label={book.title}
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  progress.completed ? "bg-emerald-500" : "bg-brand-600",
                )}
                style={{ width: `${Math.min(100, Math.max(2, progress.percent))}%` }}
              />
            </div>
            {progress.completed ? (
              <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                ✓ {t("finished")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export interface Entry {
  rank: number;
  name: string;
  className: string | null;
  books: number;
  reward: string;
  rewardIsPrize: boolean;
  isYou?: boolean;
}
export interface BoardData {
  period: { key: string; label: string };
  scope: { type: "school" | "class" };
  entries: Entry[];
  moreTied: number;
  participants: number;
  you: { rank: number; books: number } | null;
  tieRule: string;
}

const RANK_STYLE = [
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  "bg-slate-200 text-slate-700 dark:bg-slate-500/25 dark:text-slate-200",
  "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200",
];
function RankBadge({ rank }: { rank: number }) {
  const Icon = rank === 1 ? Trophy : rank <= 3 ? Medal : Award;
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
        RANK_STYLE[rank - 1] ??
          "bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200",
      )}
    >
      <Icon aria-hidden className="me-0.5 h-3.5 w-3.5" />
      {rank}
    </span>
  );
}

/** Ranked list shared by the student and staff views. Never shows IDs; the viewer's own place is shown even outside the top five. */
export function BoardList({ board, showYou = true }: { board: BoardData; showYou?: boolean }) {
  const { t } = useReadLang();
  const youListed = board.entries.some((e) => e.isYou);
  if (board.entries.length === 0)
    return <p className="py-6 text-center text-sm text-[var(--muted)]">{t("noReadersYet")}</p>;
  return (
    <div>
      <ol className="flex flex-col gap-2">
        {board.entries.map((e, i) => (
          <li
            key={`${e.rank}-${i}`}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5",
              e.isYou
                ? "border-brand-400 bg-brand-50 dark:bg-brand-900/30"
                : "border-[var(--border)] bg-[var(--surface)]",
            )}
          >
            <RankBadge rank={e.rank} />
            <div className="min-w-0 flex-1">
              <p dir="auto" className="truncate text-sm font-semibold">
                {e.name}
                {e.isYou ? (
                  <span className="ms-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    {t("you")}
                  </span>
                ) : null}
              </p>
              <p dir="auto" className="truncate text-xs text-[var(--muted)]">
                {[e.className, e.rewardIsPrize ? e.reward : t("neutralReward")]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <p className="text-end">
              <span className="block text-lg font-bold leading-none">{e.books}</span>
              <span className="text-[10px] text-[var(--muted)]">{t("books")}</span>
            </p>
          </li>
        ))}
      </ol>
      {board.moreTied > 0 ? (
        <p className="mt-2 text-center text-xs text-[var(--muted)]">
          +{board.moreTied} {t("moreTied")}
        </p>
      ) : null}
      {showYou && board.you && !youListed ? (
        <p className="mt-3 rounded-xl border border-dashed border-brand-400 px-3 py-2 text-center text-sm">
          {t("yourPlace")}: <strong>#{board.you.rank}</strong> · {board.you.books} {t("books")}
        </p>
      ) : null}
      <p className="mt-3 text-center text-xs text-[var(--muted)]">
        {board.tieRule && t("tieRule")}
      </p>
      <p className="mt-1 text-center text-xs text-[var(--muted)]">{t("boardKind")}</p>
    </div>
  );
}

/** Maps a failure to child-friendly text. Server messages are English-only, so known states get translated copy. */
export function errorText(
  e: unknown,
  t: (k: "genericError" | "rateLimited" | "notConfigured") => string,
): string {
  if (e instanceof ApiFailure) {
    if (e.status === 429) return t("rateLimited");
    if (e.code === "not-configured") return t("notConfigured");
    if (e.status > 0 && e.status < 500 && e.message) return e.message;
  }
  return t("genericError");
}

/** Runs an async loader and exposes loading/error state without setState-in-effect patterns. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const run = useRef(fn);
  useEffect(() => {
    run.current = fn;
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    run.current().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error) => live && setState({ data: null, error, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = () => {
    setState((s) => ({ ...s, loading: true }));
    setTick((n) => n + 1);
  };
  return { ...state, reload };
}
