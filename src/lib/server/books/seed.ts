import { createHash } from "node:crypto";
import type { Db } from "../db/client";
import { CATALOG } from "@/lib/books/catalog";

/** Upserts the bundled, license-verified catalog. Skips work when nothing changed. Never touches `status`. */
export async function seedCatalog(db: Db): Promise<{ seeded: boolean; count: number }> {
  const hash = createHash("sha256").update(JSON.stringify(CATALOG)).digest("hex");
  const state = await db.query<{ manifest_hash: string }>(
    "SELECT manifest_hash FROM catalog_state WHERE id = 1",
  );
  if (state.rows[0]?.manifest_hash === hash) return { seeded: false, count: CATALOG.length };

  const rows = CATALOG.map((b) => ({
    slug: b.slug,
    source: b.source,
    source_id: b.sourceId,
    language: b.language,
    title: b.title,
    author: b.author,
    synopsis: b.synopsis,
    age_min: b.ageMin,
    age_max: b.ageMax,
    reading_level: b.readingLevel,
    level_basis: b.levelBasis,
    genres: b.genres,
    subjects: b.subjects,
    est_minutes: b.estMinutes,
    word_count: b.wordCount,
    page_count: b.pageCount,
    source_url: b.sourceUrl,
    license: b.license,
    license_url: b.licenseUrl,
    attribution: b.attribution,
    cover_path: b.coverPath,
    content_path: b.contentPath,
    layout: b.layout,
    verified_on: b.verifiedOn,
  }));
  await db.tx(async (t) => {
    await t.query(
      `INSERT INTO books (slug, source, source_id, language, title, author, synopsis, age_min, age_max,
         reading_level, level_basis, genres, subjects, est_minutes, word_count, page_count, source_url,
         license, license_url, attribution, cover_path, content_path, layout, verified_on)
       SELECT slug, source, source_id, language, title, author, synopsis, age_min, age_max,
         reading_level, level_basis, genres, subjects, est_minutes, word_count, page_count, source_url,
         license, license_url, attribution, cover_path, content_path, layout, verified_on
       FROM jsonb_to_recordset($1::jsonb) AS x(
         slug text, source text, source_id text, language text, title text, author text, synopsis text,
         age_min smallint, age_max smallint, reading_level text, level_basis text, genres text[],
         subjects text[], est_minutes int, word_count int, page_count int, source_url text, license text,
         license_url text, attribution text, cover_path text, content_path text, layout text, verified_on date)
       ON CONFLICT (source, source_id, language) DO UPDATE SET
         slug = EXCLUDED.slug, title = EXCLUDED.title, author = EXCLUDED.author, synopsis = EXCLUDED.synopsis,
         age_min = EXCLUDED.age_min, age_max = EXCLUDED.age_max, reading_level = EXCLUDED.reading_level,
         level_basis = EXCLUDED.level_basis, genres = EXCLUDED.genres, subjects = EXCLUDED.subjects,
         est_minutes = EXCLUDED.est_minutes, word_count = EXCLUDED.word_count, page_count = EXCLUDED.page_count,
         source_url = EXCLUDED.source_url, license = EXCLUDED.license, license_url = EXCLUDED.license_url,
         attribution = EXCLUDED.attribution, cover_path = EXCLUDED.cover_path,
         content_path = EXCLUDED.content_path, layout = EXCLUDED.layout, verified_on = EXCLUDED.verified_on`,
      [JSON.stringify(rows)],
    );
    await t.query(
      `INSERT INTO catalog_state (id, manifest_hash) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET manifest_hash = EXCLUDED.manifest_hash, seeded_at = now()`,
      [hash],
    );
  });
  return { seeded: true, count: CATALOG.length };
}
