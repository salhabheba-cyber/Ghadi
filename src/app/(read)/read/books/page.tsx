"use client";
import Link from "next/link";
import { BookCard, errorText, useLoad } from "@/components/read/common";
import { get } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";
import type { ProgressBook, ProgressData } from "@/lib/read/types";

export default function MyBooks() {
  const { t } = useReadLang();
  const { data, error, loading } = useLoad(() => get<{ progress: ProgressData }>("progress"), []);
  if (loading) return <p className="py-10 text-center text-[var(--muted)]">{t("loading")}</p>;
  if (error || !data) return <p role="alert">{errorText(error, t)}</p>;
  const { reading, completed } = data.progress;
  const grid = (list: ProgressBook[]) => (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {list.map((b) => (
        <li key={b.slug}>
          <BookCard book={b} progress={{ percent: b.furthest_percent, completed: b.completed }} />
        </li>
      ))}
    </ul>
  );
  if (reading.length === 0 && completed.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4">{t("emptyMyBooks")}</p>
        <Link
          href="/read/explore"
          className="inline-flex rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
        >
          {t("goExplore")}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-extrabold text-brand-800 dark:text-brand-100">{t("myBooks")}</h1>
      {reading.length > 0 ? (
        <section aria-labelledby="r-h">
          <h2 id="r-h" className="mb-3 text-lg font-bold">
            {t("inProgress")}
          </h2>
          {grid(reading)}
        </section>
      ) : null}
      {completed.length > 0 ? (
        <section aria-labelledby="c-h">
          <h2 id="c-h" className="mb-3 text-lg font-bold">
            {t("completedBooks")}
          </h2>
          {grid(completed)}
        </section>
      ) : null}
    </div>
  );
}
