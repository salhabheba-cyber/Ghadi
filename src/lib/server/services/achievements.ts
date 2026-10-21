import type { Db } from "../db/client";

export interface AchievementDef {
  code: string;
  en: string;
  fr: string;
  ar: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    code: "first-book",
    icon: "🌱",
    en: "First book finished",
    fr: "Premier livre terminé",
    ar: "أول كتاب أنهيته",
  },
  {
    code: "books-5",
    icon: "📚",
    en: "5 books finished",
    fr: "5 livres terminés",
    ar: "أنهيت ٥ كتب",
  },
  {
    code: "books-10",
    icon: "🌟",
    en: "10 books finished",
    fr: "10 livres terminés",
    ar: "أنهيت ١٠ كتب",
  },
  {
    code: "books-25",
    icon: "🏆",
    en: "25 books finished",
    fr: "25 livres terminés",
    ar: "أنهيت ٢٥ كتابًا",
  },
  {
    code: "two-languages",
    icon: "🌍",
    en: "Read in two languages",
    fr: "Lecture en deux langues",
    ar: "قرأت بلغتين",
  },
  {
    code: "three-languages",
    icon: "🦋",
    en: "Read in three languages",
    fr: "Lecture en trois langues",
    ar: "قرأت بثلاث لغات",
  },
  {
    code: "streak-3",
    icon: "🔥",
    en: "3 reading days in a row",
    fr: "3 jours de lecture d'affilée",
    ar: "قراءة ٣ أيام متتالية",
  },
  {
    code: "streak-7",
    icon: "⭐",
    en: "7 reading days in a row",
    fr: "7 jours de lecture d'affilée",
    ar: "قراءة ٧ أيام متتالية",
  },
];

/** Evaluates every rule from verified records and returns the codes earned just now. Idempotent. */
export async function awardAchievements(db: Db, studentId: string): Promise<string[]> {
  const c = await db.query<{ n: number; langs: number }>(
    `SELECT count(*)::int AS n, count(DISTINCT b.language)::int AS langs
       FROM completions co JOIN books b ON b.id = co.book_id WHERE co.student_id = $1 AND co.voided_at IS NULL`,
    [studentId],
  );
  const n = c.rows[0]?.n ?? 0;
  const langs = c.rows[0]?.langs ?? 0;
  const days = await db.query<{ day: string }>(
    `SELECT DISTINCT to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day FROM reading_sessions
      WHERE student_id = $1 AND active_seconds >= 60 AND started_at > now() - interval '60 days'`,
    [studentId],
  );
  const streak = streakFrom(days.rows.map((d) => d.day));
  const earned: string[] = [];
  if (n >= 1) earned.push("first-book");
  if (n >= 5) earned.push("books-5");
  if (n >= 10) earned.push("books-10");
  if (n >= 25) earned.push("books-25");
  if (langs >= 2) earned.push("two-languages");
  if (langs >= 3) earned.push("three-languages");
  if (streak >= 3) earned.push("streak-3");
  if (streak >= 7) earned.push("streak-7");
  const fresh: string[] = [];
  for (const code of earned) {
    const r = await db.query(
      "INSERT INTO achievements (student_id, code) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [studentId, code],
    );
    if (r.rowCount > 0) fresh.push(code);
  }
  return fresh;
}

/** Consecutive UTC days (ending today or yesterday) with at least one minute of reading. */
export function streakFrom(daysDesc: string[], today = new Date()): number {
  const set = new Set(daysDesc);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!set.has(fmt(d))) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (set.has(fmt(d))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
