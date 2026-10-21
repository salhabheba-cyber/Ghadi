"use client";
import { BookCheck, Clock, Flame, Languages } from "lucide-react";
import { useState } from "react";
import { BookCard, errorText, useLoad } from "@/components/read/common";
import { useMe } from "@/components/read/student-shell";
import { get, patch } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";
import { BadgeRow, DayBars, Stat } from "../page";
import type { ProgressData } from "@/lib/read/types";

export default function ProgressPage() {
  const { t, lang } = useReadLang();
  const { me, refresh, aiAvailable, achievements } = useMe();
  const { data, error, loading } = useLoad(() => get<{ progress: ProgressData }>("progress"), []);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle(field: "showOnLeaderboard" | "aiConsent", value: boolean) {
    setSaving(true);
    setMsg(null);
    try {
      await patch("me", { [field]: value });
      refresh();
    } catch (e) {
      setMsg(errorText(e, t));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-10 text-center text-[var(--muted)]">{t("loading")}</p>;
  if (error || !data) return <p role="alert">{errorText(error, t)}</p>;
  const p = data.progress;
  const earned = new Set(p.achievements.map((a) => a.code));
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold text-brand-800 dark:text-brand-100">
        {t("progress")}
      </h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<BookCheck aria-hidden className="h-5 w-5" />}
          value={p.completed.length}
          label={t("booksFinished")}
        />
        <Stat
          icon={<Clock aria-hidden className="h-5 w-5" />}
          value={Math.floor(p.totalSeconds / 60)}
          label={t("minutesRead")}
        />
        <Stat
          icon={<Flame aria-hidden className="h-5 w-5" />}
          value={p.streak}
          label={t("dayStreak")}
        />
        <Stat
          icon={<Languages aria-hidden className="h-5 w-5" />}
          value={p.languages.length}
          label={t("language")}
        />
      </div>
      <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <DayBars perDay={p.perDay} />
      </section>
      <section aria-labelledby="b-h">
        <h2 id="b-h" className="mb-3 text-lg font-bold">
          {t("badges")}
        </h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {achievements.map((a) => (
            <li
              key={a.code}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${earned.has(a.code) ? "border-amber-300 bg-amber-50 font-semibold dark:bg-amber-500/10" : "border-[var(--border)] opacity-60"}`}
            >
              <span aria-hidden className={earned.has(a.code) ? "" : "grayscale"}>
                {a.icon}
              </span>
              {a[lang]}
            </li>
          ))}
        </ul>
        <div className="sr-only">
          <BadgeRow earned={p.achievements} />
        </div>
      </section>
      {p.completed.length > 0 ? (
        <section aria-labelledby="c-h">
          <h2 id="c-h" className="mb-3 text-lg font-bold">
            {t("completedBooks")}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {p.completed.map((b) => (
              <li key={b.slug}>
                <BookCard book={b} progress={{ percent: 100, completed: true }} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <h2 className="mb-1 font-bold">{t("howProgress")}</h2>
        <p className="text-[var(--muted)]">{t("howProgressBody")}</p>
      </section>
      <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        {me.leaderboardEnabled ? (
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-600"
              checked={me.showOnLeaderboard}
              disabled={saving}
              onChange={(e) => toggle("showOnLeaderboard", e.target.checked)}
            />
            {t("showMe")}
          </label>
        ) : null}
        {aiAvailable ? (
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-600"
              checked={me.aiConsent}
              disabled={saving}
              onChange={(e) => toggle("aiConsent", e.target.checked)}
            />
            {t("consentTitle")}
          </label>
        ) : null}
        {msg ? <p role="alert">{msg}</p> : null}
      </section>
    </div>
  );
}
