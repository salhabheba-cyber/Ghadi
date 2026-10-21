"use client";
import { Flame, Clock, BookCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { BookCard, Cover, errorText, useLoad } from "@/components/read/common";
import type { BookCardData, ProgressData } from "@/lib/read/types";
import { LeaderboardCard } from "@/components/read/leaderboard-card";
import { useMe } from "@/components/read/student-shell";
import { get } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";
import { Notice } from "@/components/ui/primitives";

export function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
        {icon}
      </span>
      <p className="min-w-0">
        <span className="block text-xl font-extrabold leading-none">{value}</span>
        <span className="text-xs text-[var(--muted)]">{label}</span>
      </p>
    </div>
  );
}

export function BadgeRow({ earned }: { earned: { code: string }[] }) {
  const { achievements } = useMe();
  const { lang, t } = useReadLang();
  const codes = new Set(earned.map((e) => e.code));
  const mine = achievements.filter((a) => codes.has(a.code));
  if (mine.length === 0) return <p className="text-sm text-[var(--muted)]">{t("noBadges")}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {mine.map((a) => (
        <li
          key={a.code}
          className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-100"
        >
          <span aria-hidden>{a.icon}</span>
          {a[lang]}
        </li>
      ))}
    </ul>
  );
}

export function DayBars({ perDay }: { perDay: { day: string; seconds: number }[] }) {
  const { t } = useReadLang();
  const days: { day: string; minutes: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      day: key,
      minutes: Math.round((perDay.find((p) => p.day === key)?.seconds ?? 0) / 60),
    });
  }
  const max = Math.max(10, ...days.map((d) => d.minutes));
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold">{t("last14")}</figcaption>
      <div
        className="flex h-28 items-end gap-1"
        role="img"
        aria-label={days.map((d) => `${d.day}: ${d.minutes} ${t("minutesShort")}`).join(", ")}
      >
        {days.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center justify-end">
            <div
              className="w-full rounded-t-md bg-brand-500"
              style={{
                height: `${Math.max(d.minutes > 0 ? 6 : 2, (d.minutes / max) * 100)}%`,
                opacity: d.minutes > 0 ? 1 : 0.25,
              }}
              title={`${d.day}: ${d.minutes} ${t("minutesShort")}`}
            />
          </div>
        ))}
      </div>
    </figure>
  );
}

export default function StudentHome() {
  const { t } = useReadLang();
  const { me } = useMe();
  const { data, error, loading, reload } = useLoad(
    () => get<{ progress: ProgressData; suggestions: BookCardData[] }>("home"),
    [],
  );
  if (loading) return <p className="py-10 text-center text-[var(--muted)]">{t("loading")}</p>;
  if (error || !data) {
    return (
      <Notice tone="error">
        {errorText(error, t)}{" "}
        <button className="underline" onClick={reload}>
          {t("retry")}
        </button>
      </Notice>
    );
  }
  const { progress, suggestions } = data;
  const current = progress.reading[0];
  const first = (me.nickname || me.displayName).split(/\s+/)[0];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold text-brand-800 dark:text-brand-100">
        {t("welcome")}, <span dir="auto">{first}</span> 👋
      </h1>

      <section aria-label={t("continueReading")}>
        {current ? (
          <Link
            href={`/reader/${current.slug}`}
            className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white shadow-md transition hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <div className="w-20 shrink-0 sm:w-24">
              <Cover book={current} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-100">
                {t("continueReading")}
              </p>
              <p dir="auto" className="mt-1 line-clamp-2 text-lg font-bold leading-snug">
                {current.title}
              </p>
              <p dir="auto" className="line-clamp-1 text-sm text-brand-100">
                {current.author}
              </p>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-white/25"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(current.furthest_percent)}
                aria-label={current.title}
              >
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${Math.max(3, current.furthest_percent)}%` }}
                />
              </div>
            </div>
          </Link>
        ) : (
          <div className="rounded-3xl border border-dashed border-brand-400 p-6 text-center">
            <p className="mb-3">{t("nothingYet")}</p>
            <Link
              href="/read/explore"
              className="inline-flex rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
            >
              {t("goExplore")}
            </Link>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          icon={<BookCheck aria-hidden className="h-5 w-5" />}
          value={progress.completed.length}
          label={t("booksFinished")}
        />
        <Stat
          icon={<Clock aria-hidden className="h-5 w-5" />}
          value={Math.floor(progress.totalSeconds / 60)}
          label={t("minutesRead")}
        />
        <Stat
          icon={<Flame aria-hidden className="h-5 w-5" />}
          value={progress.streak}
          label={t("dayStreak")}
        />
      </div>

      <LeaderboardCard />

      {suggestions.length > 0 ? (
        <section aria-labelledby="sug-h">
          <h2 id="sug-h" className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Sparkles aria-hidden className="h-5 w-5 text-amber-500" />
            {t("suggested")}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {suggestions.map((b) => (
              <li key={b.slug}>
                <BookCard book={b} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="bd-h">
        <h2 id="bd-h" className="mb-2 text-lg font-bold">
          {t("badges")}
        </h2>
        <BadgeRow earned={progress.achievements} />
      </section>
    </div>
  );
}
