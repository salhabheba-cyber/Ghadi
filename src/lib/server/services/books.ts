import type { Db } from "../db/client";

export interface BookRow {
  id: string;
  slug: string;
  title: string;
  author: string;
  language: "ar" | "fr" | "en";
  synopsis: string;
  age_min: number;
  age_max: number;
  reading_level: string | null;
  level_basis: string | null;
  genres: string[];
  subjects: string[];
  est_minutes: number | null;
  word_count: number | null;
  page_count: number | null;
  source: string;
  source_url: string;
  license: string;
  license_url: string;
  attribution: string;
  cover_path: string | null;
  content_path: string;
  layout: "pages" | "scroll";
  status: string;
}

export interface BookFilters {
  q?: string;
  language?: string;
  age?: number;
  genre?: string;
  subject?: string;
  level?: string;
  limit?: number;
  offset?: number;
}

const LIST_COLS = `id, slug, title, author, language, synopsis, age_min, age_max, reading_level, level_basis, genres, subjects, est_minutes, word_count, page_count,
  source, source_url, license, license_url, attribution, cover_path, content_path, layout, status`;

export async function searchBooks(db: Db, f: BookFilters, includeHidden = false) {
  const where: string[] = [includeHidden ? "TRUE" : "status = 'published'"];
  const vals: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    vals.push(v);
    where.push(sql.replace("?", `$${vals.length}`));
  };
  if (f.language && ["ar", "fr", "en"].includes(f.language)) add("language = ?", f.language);
  if (f.age !== undefined && Number.isFinite(f.age)) {
    vals.push(f.age);
    where.push(`age_min <= $${vals.length} AND age_max >= $${vals.length}`);
  }
  if (f.genre) add("? = ANY(genres)", f.genre.toLowerCase());
  if (f.subject) add("? = ANY(subjects)", f.subject);
  if (f.level) add("reading_level = ?", f.level);
  if (f.q?.trim()) {
    vals.push(
      `%${f.q
        .trim()
        .slice(0, 80)
        .replace(/[%_\\]/g, "\\$&")}%`,
    );
    const n = vals.length;
    where.push(`(title ILIKE $${n} OR author ILIKE $${n} OR synopsis ILIKE $${n})`);
  }
  const limit = Math.min(Math.max(f.limit ?? 24, 1), 60);
  const offset = Math.max(f.offset ?? 0, 0);
  const total = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM books WHERE ${where.join(" AND ")}`,
    vals,
  );
  const rows = await db.query<BookRow>(
    `SELECT ${LIST_COLS} FROM books WHERE ${where.join(" AND ")}
      ORDER BY (cover_path IS NOT NULL) DESC, title ASC, id ASC LIMIT ${limit} OFFSET ${offset}`,
    vals,
  );
  return { total: total.rows[0]?.n ?? 0, books: rows.rows };
}

export async function getBook(
  db: Db,
  slugOrId: string,
  includeHidden = false,
): Promise<BookRow | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  const r = await db.query<BookRow>(
    `SELECT ${LIST_COLS} FROM books WHERE ${isUuid ? "id = $1::uuid" : "slug = $1"} ${includeHidden ? "" : "AND status = 'published'"}`,
    [slugOrId],
  );
  return r.rows[0] ?? null;
}

export async function bookFacets(db: Db) {
  const [genres, levels, langs] = await Promise.all([
    db.query<{ g: string; n: number }>(
      "SELECT g, count(*)::int AS n FROM books, unnest(genres) g WHERE status='published' GROUP BY g ORDER BY n DESC, g",
    ),
    db.query<{ reading_level: string; n: number }>(
      "SELECT reading_level, count(*)::int AS n FROM books WHERE status='published' AND reading_level IS NOT NULL AND reading_level LIKE 'Level%' GROUP BY reading_level ORDER BY reading_level",
    ),
    db.query<{ language: string; n: number }>(
      "SELECT language, count(*)::int AS n FROM books WHERE status='published' GROUP BY language",
    ),
  ]);
  return {
    genres: genres.rows.map((r) => ({ value: r.g, count: r.n })),
    levels: levels.rows.map((r) => ({ value: r.reading_level, count: r.n })),
    languages: langs.rows.map((r) => ({ value: r.language, count: r.n })),
  };
}

/** Suggestions: unread books in the student's language, closest to their age, preferring ones they have not opened. */
export async function suggestBooks(
  db: Db,
  studentId: string,
  language: string,
  age: number,
  limit = 6,
) {
  const r = await db.query<BookRow>(
    `SELECT ${LIST_COLS.split(",")
      .map((c) => "b." + c.trim())
      .join(", ")}
       FROM books b
      WHERE b.status = 'published' AND b.language = $2 AND b.age_min <= $3 + 1 AND b.age_max >= $3 - 1
        AND NOT EXISTS (SELECT 1 FROM completions c WHERE c.student_id = $1 AND c.book_id = b.id)
        AND NOT EXISTS (SELECT 1 FROM reading_progress p WHERE p.student_id = $1 AND p.book_id = b.id AND p.furthest_percent > 5)
      ORDER BY abs((b.age_min + b.age_max) / 2.0 - $3), (b.cover_path IS NOT NULL) DESC, b.title LIMIT $4`,
    [studentId, language, age, limit],
  );
  return r.rows;
}

export async function setBookStatus(db: Db, bookId: string, hidden: boolean): Promise<void> {
  await db.query("UPDATE books SET status = $2 WHERE id = $1", [
    bookId,
    hidden ? "hidden" : "published",
  ]);
}
