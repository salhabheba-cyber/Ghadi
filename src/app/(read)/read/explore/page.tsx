"use client";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { BookCard, errorText, useLoad } from "@/components/read/common";
import { useMe } from "@/components/read/student-shell";
import { get } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";
import { LANGS, LANG_NAMES } from "@/lib/read/strings";
import type { BookCardData, FacetData } from "@/lib/read/types";

const sel = "rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm";
const AGES = [4, 6, 8, 10, 12, 14, 16, 18];
const PAGE = 24;

interface Filters {
  q: string;
  language: string;
  age: string;
  genre: string;
  level: string;
}
const query = (f: Filters, offset: number) => {
  const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.language) p.set("language", f.language);
  if (f.age) p.set("age", f.age);
  if (f.genre) p.set("genre", f.genre);
  if (f.level) p.set("level", f.level);
  return p.toString();
};

/** Mounted afresh (via `key`) whenever the filters change, so paging state never outlives its filters. */
function Results({ filters }: { filters: Filters }) {
  const { t } = useReadLang();
  const { data, error, loading } = useLoad(
    () => get<{ books: BookCardData[]; total: number }>(`books?${query(filters, 0)}`),
    [],
  );
  const [extra, setExtra] = useState<BookCardData[]>([]);
  const books = [...(data?.books ?? []), ...extra];
  const total = data?.total ?? 0;
  async function more() {
    const r = await get<{ books: BookCardData[] }>(`books?${query(filters, books.length)}`).catch(
      () => null,
    );
    if (r) setExtra((e) => [...e, ...r.books]);
  }
  return (
    <>
      {error ? <p role="alert">{errorText(error, t)}</p> : null}
      <p aria-live="polite" className="text-sm text-[var(--muted)]">
        {loading ? t("loading") : `${total} ${t("booksFound")}`}
      </p>
      {!loading && books.length === 0 && !error ? (
        <p className="py-8 text-center">{t("noBooksFound")}</p>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {books.map((b) => (
          <li key={b.slug}>
            <BookCard book={b} />
          </li>
        ))}
      </ul>
      {books.length < total ? (
        <button
          onClick={more}
          className="mx-auto rounded-xl border border-[var(--border)] px-6 py-2.5 font-medium hover:bg-[var(--surface-2)]"
        >
          {t("loadMore")}
        </button>
      ) : null}
    </>
  );
}

export default function Explore() {
  const { t } = useReadLang();
  const { me } = useMe();
  const [filters, setFilters] = useState<Filters>({
    q: "",
    language: me.language,
    age: "",
    genre: "",
    level: "",
  });
  const [typed, setTyped] = useState("");
  const facets = useLoad(() => get<FacetData>("books/facets"), []);

  // Typing is debounced so each keystroke does not hit the server.
  useEffect(() => {
    const id = setTimeout(() => setFilters((f) => (f.q === typed ? f : { ...f, q: typed })), 250);
    return () => clearTimeout(id);
  }, [typed]);

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setFilters({ ...filters, [k]: e.target.value });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold text-brand-800 dark:text-brand-100">{t("explore")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("catalogNote")}</p>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
        />
        <input
          type="search"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={t("searchBooks")}
          aria-label={t("searchBooks")}
          dir="auto"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pe-3 ps-9"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={t("language")}
          value={filters.language}
          onChange={set("language")}
          className={sel}
        >
          <option value="">{t("allLanguages")}</option>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_NAMES[l]}
            </option>
          ))}
        </select>
        <select aria-label={t("ageFor")} value={filters.age} onChange={set("age")} className={sel}>
          <option value="">{t("allAges")}</option>
          {AGES.map((a) => (
            <option key={a} value={a}>
              {t("ageFor")} {a}
            </option>
          ))}
        </select>
        <select
          aria-label={t("genre")}
          value={filters.genre}
          onChange={set("genre")}
          className={sel}
        >
          <option value="">{t("allGenres")}</option>
          {facets.data?.genres.map((g) => (
            <option key={g.value} value={g.value}>
              {g.value}
            </option>
          ))}
        </select>
        <select
          aria-label={t("level")}
          value={filters.level}
          onChange={set("level")}
          className={sel}
        >
          <option value="">{t("allLevels")}</option>
          {facets.data?.levels.map((l) => (
            <option key={l.value} value={l.value}>
              {l.value}
            </option>
          ))}
        </select>
      </div>
      <Results key={JSON.stringify(filters)} filters={filters} />
    </div>
  );
}
