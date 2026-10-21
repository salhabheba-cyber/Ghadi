/** Pure helpers for the reader: book shape, reading position maths and in-book search. No DOM, so they are unit-tested. */
export interface Block {
  t: "h" | "p" | "q" | "img" | string;
  x?: string;
  src?: string;
  alt?: string;
}
export interface Chapter {
  id: string;
  title: string;
  blocks: Block[];
}
export interface BookFile {
  v: number;
  lang: "ar" | "fr" | "en";
  dir: "rtl" | "ltr";
  layout: "pages" | "scroll";
  chapters: Chapter[];
}

export function chapterText(ch: Chapter): string {
  return ch.blocks
    .filter((b) => b.t !== "img" && b.x)
    .map((b) => b.x)
    .join("\n");
}

/** Overall percent through the book: finished chapters plus the fraction scrolled within the current one. */
export function percentOf(chapterIndex: number, chapterCount: number, withinFraction = 0): number {
  if (chapterCount <= 0) return 0;
  const idx = Math.min(Math.max(chapterIndex, 0), chapterCount - 1);
  const frac = Math.min(Math.max(withinFraction, 0), 1);
  return Math.min(100, Math.round(((idx + frac) / chapterCount) * 1000) / 10);
}

/** For picture books each page counts fully once it is shown, so the last page reaches 100%. */
export function percentForPages(pageIndex: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.min(
    100,
    Math.round(((Math.min(Math.max(pageIndex, 0), pageCount - 1) + 1) / pageCount) * 1000) / 10,
  );
}

export interface SearchHit {
  chapter: number;
  snippet: string;
}

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ًͯ-ٰٟ]/g, "")
    .toLowerCase();

/** Case-, accent- and Arabic-diacritic-insensitive search. Returns at most `limit` hits with a short snippet around each. */
export function searchBook(chapters: Chapter[], query: string, limit = 40): SearchHit[] {
  const q = strip(query.trim());
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  for (let i = 0; i < chapters.length && hits.length < limit; i++) {
    for (const b of chapters[i]!.blocks) {
      if (b.t === "img" || !b.x) continue;
      const hay = strip(b.x);
      let from = 0;
      for (;;) {
        const at = hay.indexOf(q, from);
        if (at < 0 || hits.length >= limit) break;
        // NFD stripping can shift offsets for accented text, so snippets are cut from the original around the same area.
        const start = Math.max(0, at - 30);
        hits.push({
          chapter: i,
          snippet:
            (start > 0 ? "…" : "") +
            b.x.slice(start, at + q.length + 50).trim() +
            (at + q.length + 50 < b.x.length ? "…" : ""),
        });
        from = at + q.length;
      }
    }
  }
  return hits;
}

export const READER_LOCALE: Record<"ar" | "fr" | "en", string> = {
  ar: "ar",
  fr: "fr-FR",
  en: "en-GB",
};

export function validateBook(raw: unknown): BookFile {
  const b = raw as Partial<BookFile> | null;
  if (
    !b ||
    !Array.isArray(b.chapters) ||
    b.chapters.length === 0 ||
    !b.chapters.every((c) => c && Array.isArray(c.blocks))
  ) {
    throw new Error("damaged");
  }
  return {
    v: 1,
    lang: b.lang === "ar" || b.lang === "fr" ? b.lang : "en",
    dir: b.dir === "rtl" ? "rtl" : "ltr",
    layout: b.layout === "pages" ? "pages" : "scroll",
    chapters: b.chapters as Chapter[],
  };
}
