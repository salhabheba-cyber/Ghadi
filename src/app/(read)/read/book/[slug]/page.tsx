"use client";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { Cover, errorText, useLoad } from "@/components/read/common";
import { get } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";
import { LANG_NAMES } from "@/lib/read/strings";
import { ApiFailure } from "@/lib/read/api";
import type { BookFull, ProgressData } from "@/lib/read/types";

export default function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { t } = useReadLang();
  const { data, error, loading } = useLoad(async () => {
    const [b, p] = await Promise.all([
      get<{ book: BookFull }>(`books/${encodeURIComponent(slug)}`),
      get<{ progress: ProgressData }>("progress"),
    ]);
    return { book: b.book, mine: p.progress.all.find((x) => x.slug === slug) ?? null };
  }, [slug]);
  if (loading) return <p className="py-10 text-center text-[var(--muted)]">{t("loading")}</p>;
  if (error || !data)
    return (
      <p role="alert" className="py-10 text-center">
        {error instanceof ApiFailure && error.status === 404
          ? t("bookNotFound")
          : errorText(error, t)}
      </p>
    );
  const { book, mine } = data;
  const label = mine?.completed
    ? t("readAgain")
    : mine && mine.furthest_percent > 0
      ? t("resume")
      : t("startReading");
  return (
    <article className="grid gap-6 md:grid-cols-[220px_1fr]">
      <div className="mx-auto w-44 md:w-full">
        <Cover book={book} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <header>
          <h1
            dir="auto"
            className="text-2xl font-extrabold leading-tight text-brand-800 dark:text-brand-100"
          >
            {book.title}
          </h1>
          <p dir="auto" className="mt-1 text-[var(--muted)]">
            {t("byAuthor")} {book.author}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            <li className="rounded-full bg-brand-100 px-3 py-1 font-medium text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">
              {LANG_NAMES[book.language]}
            </li>
            <li className="rounded-full bg-[var(--surface-2)] px-3 py-1">
              {t("agesRange")} {book.age_min}–{book.age_max}
            </li>
            {book.est_minutes ? (
              <li className="rounded-full bg-[var(--surface-2)] px-3 py-1">
                {book.est_minutes} {t("minutesShort")}
              </li>
            ) : null}
            {book.reading_level ? (
              <li className="rounded-full bg-[var(--surface-2)] px-3 py-1">{book.reading_level}</li>
            ) : null}
            {mine?.completed ? (
              <li className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                ✓ {t("finished")}
              </li>
            ) : null}
          </ul>
        </header>
        <Link
          href={`/reader/${book.slug}`}
          className="inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-white hover:bg-brand-700 sm:w-auto sm:self-start"
        >
          {label}
          {mine && !mine.completed && mine.furthest_percent > 0
            ? ` · ${Math.round(mine.furthest_percent)}%`
            : ""}
        </Link>
        <section>
          <h2 className="mb-1 font-bold">{t("aboutBook")}</h2>
          <p dir="auto" className="leading-relaxed text-[var(--fg,inherit)]">
            {book.synopsis}
          </p>
          {book.genres?.length ? (
            <p className="mt-2 text-sm text-[var(--muted)]">{book.genres.join(" · ")}</p>
          ) : null}
        </section>
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <h2 className="mb-2 font-bold">{t("licenseAndCredit")}</h2>
          <dl className="grid gap-1.5">
            <div>
              <dt className="inline font-semibold">{t("formats")}: </dt>
              <dd className="inline">{t("formatDesc")}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">License: </dt>
              <dd className="inline">
                <a
                  className="text-brand-700 underline dark:text-brand-300"
                  href={book.license_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {book.license}
                </a>
              </dd>
            </div>
            <div dir="auto">
              <dd>{book.attribution}</dd>
            </div>
            <div>
              <a
                href={book.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-brand-700 underline dark:text-brand-300"
              >
                {t("originalSource")} <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              </a>
            </div>
          </dl>
        </section>
      </div>
    </article>
  );
}
