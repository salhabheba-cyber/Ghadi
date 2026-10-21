import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "../db/client";
import {
  buildClozeQuestions,
  buildStoryQuestions,
  SHORT_BOOK_WORDS,
  type BookContent,
  type ChoiceQuestion,
} from "@/lib/books/cloze";
import { getBook, type BookRow } from "./books";
import { ServiceError, audit, cleanText } from "./core";
import type { Actor } from "./staff";
import { awardAchievements, streakFrom } from "./achievements";
import { visibleStudent } from "./students";

/** A book counts as read only when ALL of these hold (checked on the server). */
export const COMPLETION_PERCENT = 90;
export const PASS_FRACTION = 2 / 3;
export const MAX_ATTEMPTS_PER_CHECK = 3;
const READING_WPM_FASTEST = 400; // faster than any realistic child reader; time below 40% of this is implausible
const MIN_TIME_FACTOR = 0.4;

export function minActiveSeconds(wordCount: number | null): number {
  const w = wordCount ?? 0;
  return Math.min(
    3 * 3600,
    Math.max(15, Math.round((w / READING_WPM_FASTEST) * 60 * MIN_TIME_FACTOR)),
  );
}

// ── book text ────────────────────────────────────────────────────────────────────────────────
const cache = new Map<string, BookContent>();
export async function loadBookContent(book: Pick<BookRow, "content_path">): Promise<BookContent> {
  const p = book.content_path;
  if (!/^\/books\/[A-Za-z0-9._-]+\.json$/.test(p))
    throw new ServiceError(500, "bad-content-path", "This book cannot be opened.");
  const hit = cache.get(p);
  if (hit) return hit;
  let content: BookContent;
  try {
    content = JSON.parse(
      await readFile(path.join(process.cwd(), "public", p), "utf8"),
    ) as BookContent;
  } catch {
    throw new ServiceError(500, "content-missing", "This book's file is missing or damaged.");
  }
  if (cache.size >= 6) cache.delete(cache.keys().next().value!);
  cache.set(p, content);
  return content;
}

// ── opening, position, time ──────────────────────────────────────────────────────────────────
export interface Progress {
  locator: Record<string, unknown>;
  percent: number;
  furthestPercent: number;
  activeSeconds: number;
  completed: boolean;
  completedAt: string | null;
}

async function progressOf(db: Db, studentId: string, bookId: string): Promise<Progress | null> {
  const r = await db.query<{
    locator: Record<string, unknown>;
    percent: number;
    furthest_percent: number;
    active_seconds: number;
    completed_at: Date | null;
    voided_at: Date | null;
  }>(
    `SELECT p.locator, p.percent, p.furthest_percent, p.active_seconds, c.completed_at, c.voided_at
       FROM reading_progress p LEFT JOIN completions c ON c.student_id = p.student_id AND c.book_id = p.book_id
      WHERE p.student_id = $1 AND p.book_id = $2`,
    [studentId, bookId],
  );
  const p = r.rows[0];
  if (!p) return null;
  return {
    locator: p.locator,
    percent: p.percent,
    furthestPercent: p.furthest_percent,
    activeSeconds: p.active_seconds,
    completed: Boolean(p.completed_at && !p.voided_at),
    completedAt: p.completed_at ? p.completed_at.toISOString() : null,
  };
}

export async function openBook(db: Db, studentId: string, bookSlug: string) {
  const book = await getBook(db, bookSlug);
  if (!book) throw new ServiceError(404, "not-found", "Book not found.");
  await db.query(
    `INSERT INTO reading_progress (student_id, book_id) VALUES ($1,$2)
     ON CONFLICT (student_id, book_id) DO UPDATE SET last_read_at = now()`,
    [studentId, book.id],
  );
  const s = await db.query<{ id: string }>(
    "INSERT INTO reading_sessions (student_id, book_id) VALUES ($1,$2) RETURNING id",
    [studentId, book.id],
  );
  const marks = await db.query<{ id: string; locator: unknown; label: string; created_at: Date }>(
    "SELECT id, locator, label, created_at FROM bookmarks WHERE student_id = $1 AND book_id = $2 ORDER BY created_at",
    [studentId, book.id],
  );
  return {
    book,
    sessionId: s.rows[0]!.id,
    progress: (await progressOf(db, studentId, book.id))!,
    bookmarks: marks.rows,
  };
}

/**
 * Reading time is credited only from heartbeats the page sends while it is visible and the child is interacting.
 * The server credits at most the time since the previous beat (capped at 45 s, ignoring beats under 5 s apart),
 * so a script cannot invent hours by calling the endpoint in a loop.
 */
export async function heartbeat(
  db: Db,
  studentId: string,
  sessionId: string,
): Promise<{ credited: number }> {
  const r = await db.query<{ credited: number }>(
    `WITH s AS (
       SELECT id, student_id, book_id, EXTRACT(EPOCH FROM (now() - last_beat_at)) AS gap
         FROM reading_sessions WHERE id = $1 AND student_id = $2 FOR UPDATE
     ), upd AS (
       UPDATE reading_sessions rs SET last_beat_at = now(),
              active_seconds = rs.active_seconds + CASE WHEN s.gap >= 5 AND s.gap <= 45 THEN s.gap::int ELSE 0 END
         FROM s WHERE rs.id = s.id
       RETURNING rs.book_id, CASE WHEN s.gap >= 5 AND s.gap <= 45 THEN s.gap::int ELSE 0 END AS credited
     ), prog AS (
       UPDATE reading_progress p SET active_seconds = p.active_seconds + upd.credited, last_read_at = now()
         FROM upd WHERE p.student_id = $2 AND p.book_id = upd.book_id
       RETURNING upd.credited
     )
     SELECT COALESCE((SELECT credited FROM prog LIMIT 1), 0)::int AS credited`,
    [sessionId, studentId],
  );
  return { credited: r.rows[0]?.credited ?? 0 };
}

export async function savePosition(
  db: Db,
  studentId: string,
  bookId: string,
  input: { locator: unknown; percent: unknown },
) {
  const percent =
    typeof input.percent === "number" && Number.isFinite(input.percent)
      ? Math.min(100, Math.max(0, input.percent))
      : null;
  if (percent === null) throw new ServiceError(400, "invalid", "Position is not valid.");
  const loc =
    input.locator && typeof input.locator === "object" && !Array.isArray(input.locator)
      ? input.locator
      : {};
  if (JSON.stringify(loc).length > 500)
    throw new ServiceError(400, "invalid", "Position is not valid.");
  const r = await db.query(
    `UPDATE reading_progress SET locator = $3, percent = $4, furthest_percent = GREATEST(furthest_percent, $4), last_read_at = now()
      WHERE student_id = $1 AND book_id = $2`,
    [studentId, bookId, JSON.stringify(loc), percent],
  );
  if (r.rowCount === 0) throw new ServiceError(404, "not-opened", "Open the book first.");
  return progressOf(db, studentId, bookId);
}

export async function addBookmark(
  db: Db,
  studentId: string,
  bookId: string,
  input: { locator: unknown; label?: unknown },
) {
  const loc = input.locator && typeof input.locator === "object" ? input.locator : null;
  if (!loc || JSON.stringify(loc).length > 500)
    throw new ServiceError(400, "invalid", "Bookmark is not valid.");
  const label = input.label ? cleanText(input.label, 0, 120, "Label") : "";
  const n = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM bookmarks WHERE student_id = $1 AND book_id = $2",
    [studentId, bookId],
  );
  if ((n.rows[0]?.n ?? 0) >= 50)
    throw new ServiceError(409, "too-many", "You have a lot of bookmarks here. Remove one first.");
  const r = await db.query<{ id: string }>(
    "INSERT INTO bookmarks (student_id, book_id, locator, label) VALUES ($1,$2,$3,$4) RETURNING id",
    [studentId, bookId, JSON.stringify(loc), label],
  );
  return { id: r.rows[0]!.id };
}

export async function removeBookmark(db: Db, studentId: string, bookmarkId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(bookmarkId)) return;
  await db.query("DELETE FROM bookmarks WHERE id = $1 AND student_id = $2", [
    bookmarkId,
    studentId,
  ]);
}

// ── completion ───────────────────────────────────────────────────────────────────────────────
export interface Eligibility {
  eligible: boolean;
  percent: number;
  neededPercent: number;
  seconds: number;
  neededSeconds: number;
  alreadyCompleted: boolean;
}

export async function eligibility(db: Db, studentId: string, book: BookRow): Promise<Eligibility> {
  const p = await progressOf(db, studentId, book.id);
  const need = minActiveSeconds(book.word_count);
  const percent = p?.furthestPercent ?? 0;
  const seconds = p?.activeSeconds ?? 0;
  return {
    eligible: Boolean(p) && percent >= COMPLETION_PERCENT && seconds >= need && !p!.completed,
    percent,
    neededPercent: COMPLETION_PERCENT,
    seconds,
    neededSeconds: need,
    alreadyCompleted: Boolean(p?.completed),
  };
}

export type AiQuestionFn = (
  book: BookRow,
  content: BookContent,
) => Promise<ChoiceQuestion[] | null>;

export async function startCheck(
  db: Db,
  studentId: string,
  bookSlug: string,
  opts: { ai?: AiQuestionFn; rand?: () => number } = {},
) {
  const book = await getBook(db, bookSlug);
  if (!book) throw new ServiceError(404, "not-found", "Book not found.");
  const el = await eligibility(db, studentId, book);
  if (el.alreadyCompleted)
    throw new ServiceError(
      409,
      "already-completed",
      "You already finished this book. It counts once.",
    );
  if (!el.eligible) {
    throw new ServiceError(
      409,
      "not-ready",
      "Keep reading: you need to reach the end of the book before the check.",
      { eligibility: el },
    );
  }
  // Reuse a live check with attempts left; otherwise make a new one (at most 4 per hour per book).
  const live = await db.query<{
    id: string;
    questions: ChoiceQuestion[];
    attempts: number;
    origin: string;
  }>(
    "SELECT id, questions, attempts, origin FROM completion_checks WHERE student_id=$1 AND book_id=$2 AND passed=false AND attempts < $3 AND expires_at > now() ORDER BY created_at DESC LIMIT 1",
    [studentId, book.id, MAX_ATTEMPTS_PER_CHECK],
  );
  if (live.rows[0])
    return publicCheck(
      live.rows[0].id,
      live.rows[0].questions,
      live.rows[0].origin,
      live.rows[0].attempts,
    );
  const recent = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM completion_checks WHERE student_id=$1 AND book_id=$2 AND created_at > now() - interval '1 hour'",
    [studentId, book.id],
  );
  if ((recent.rows[0]?.n ?? 0) >= 4)
    throw new ServiceError(
      429,
      "check-cooldown",
      "Take a little break and read the last part again. You can try the check again in a while.",
    );
  const content = await loadBookContent(book);
  let questions: ChoiceQuestion[] | null = null;
  let origin: "openai" | "text" = "text";
  if (opts.ai) {
    try {
      questions = await opts.ai(book, content);
      if (questions && questions.length >= 3) origin = "openai";
      else questions = null;
    } catch {
      questions = null; // AI is optional; the text-based check below always works
    }
  }
  if (!questions) {
    if ((book.word_count ?? 0) <= SHORT_BOOK_WORDS) {
      const others = await db.query<BookRow>(
        "SELECT content_path FROM books WHERE language = $1 AND id <> $2 AND status = 'published' AND word_count <= $3 ORDER BY random() LIMIT 4",
        [book.language, book.id, SHORT_BOOK_WORDS],
      );
      const contents = await Promise.all(others.rows.map((o) => loadBookContent(o)));
      questions = buildStoryQuestions(content, contents, 3, opts.rand);
    } else {
      questions = buildClozeQuestions(content, 3, opts.rand);
    }
    origin = "text";
  }
  if (questions.length < 2) {
    throw new ServiceError(
      422,
      "check-unavailable",
      "Ghadi could not make a check for this book. Ask your teacher to confirm that you finished it.",
    );
  }
  const r = await db.query<{ id: string }>(
    "INSERT INTO completion_checks (student_id, book_id, questions, origin, expires_at) VALUES ($1,$2,$3,$4, now() + interval '1 hour') RETURNING id",
    [studentId, book.id, JSON.stringify(questions), origin],
  );
  return publicCheck(r.rows[0]!.id, questions, origin, 0);
}

function publicCheck(id: string, questions: ChoiceQuestion[], origin: string, attempts: number) {
  return {
    checkId: id,
    origin,
    attemptsLeft: MAX_ATTEMPTS_PER_CHECK - attempts,
    questions: questions.map((q) => ({ kind: q.kind, prompt: q.prompt, options: q.options })),
  };
}

export async function answerCheck(db: Db, studentId: string, checkId: string, answers: unknown) {
  if (!/^[0-9a-f-]{36}$/i.test(checkId) || !Array.isArray(answers))
    throw new ServiceError(400, "invalid", "Answers are not valid.");
  return db.tx(async (t) => {
    const r = await t.query<{
      id: string;
      book_id: string;
      questions: ChoiceQuestion[];
      attempts: number;
      passed: boolean;
      expired: boolean;
    }>(
      "SELECT id, book_id, questions, attempts, passed, expires_at < now() AS expired FROM completion_checks WHERE id=$1 AND student_id=$2 FOR UPDATE",
      [checkId, studentId],
    );
    const c = r.rows[0];
    if (!c) throw new ServiceError(404, "not-found", "That check was not found.");
    if (c.passed) throw new ServiceError(409, "already-passed", "You already passed this check.");
    if (c.expired || c.attempts >= MAX_ATTEMPTS_PER_CHECK)
      throw new ServiceError(
        409,
        "check-over",
        "This check has finished. Read the end again and start a new one later.",
      );
    const score = c.questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
    const need = Math.ceil(c.questions.length * PASS_FRACTION);
    const passed = score >= need;
    await t.query(
      "UPDATE completion_checks SET attempts = attempts + 1, passed = $2 WHERE id = $1",
      [checkId, passed],
    );
    if (!passed) {
      return {
        passed,
        score,
        total: c.questions.length,
        attemptsLeft: MAX_ATTEMPTS_PER_CHECK - (c.attempts + 1),
        completed: false,
        newAchievements: [] as string[],
      };
    }
    const done = await finishBook(t, studentId, c.book_id, { score, method: "verified" });
    return {
      passed,
      score,
      total: c.questions.length,
      attemptsLeft: 0,
      completed: done.created,
      newAchievements: done.achievements,
    };
  });
}

/** Writes the single completion record for (student, book). Re-checks the rules; never creates a second row. */
async function finishBook(
  db: Db,
  studentId: string,
  bookId: string,
  o: { score: number | null; method: "verified" | "teacher"; awardedBy?: string },
) {
  const p = await db.query<{ furthest_percent: number; active_seconds: number }>(
    "SELECT furthest_percent, active_seconds FROM reading_progress WHERE student_id=$1 AND book_id=$2",
    [studentId, bookId],
  );
  const prog = p.rows[0];
  const book = await getBook(db, bookId);
  if (o.method === "verified") {
    if (
      !prog ||
      !book ||
      prog.furthest_percent < COMPLETION_PERCENT ||
      prog.active_seconds < minActiveSeconds(book.word_count)
    ) {
      throw new ServiceError(
        409,
        "not-ready",
        "Keep reading: you need to reach the end of the book first.",
      );
    }
  }
  const r = await db.query(
    `INSERT INTO completions (student_id, book_id, percent, active_seconds, score, method, awarded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (student_id, book_id) DO NOTHING`,
    [
      studentId,
      bookId,
      prog?.furthest_percent ?? 100,
      prog?.active_seconds ?? 0,
      o.score,
      o.method,
      o.awardedBy ?? null,
    ],
  );
  const achievements = r.rowCount > 0 ? await awardAchievements(db, studentId) : [];
  return { created: r.rowCount > 0, achievements };
}

// ── staff: investigate and correct completion records ────────────────────────────────────────
export async function studentReadingDetail(db: Db, actor: Actor, studentId: string) {
  await visibleStudent(db, actor, studentId);
  const r = await db.query(
    `SELECT b.slug, b.title, b.language, p.furthest_percent, p.active_seconds, p.first_opened_at, p.last_read_at,
            c.completed_at, c.method, c.score, c.voided_at, c.void_reason
       FROM reading_progress p JOIN books b ON b.id = p.book_id
       LEFT JOIN completions c ON c.student_id = p.student_id AND c.book_id = p.book_id
      WHERE p.student_id = $1 ORDER BY p.last_read_at DESC LIMIT 200`,
    [studentId],
  );
  return r.rows;
}

export async function voidCompletion(
  db: Db,
  actor: Actor,
  studentId: string,
  bookSlug: string,
  reason: unknown,
) {
  const s = await visibleStudent(db, actor, studentId);
  const why = cleanText(reason, 3, 300, "Reason");
  const book = await getBook(db, bookSlug, true);
  if (!book) throw new ServiceError(404, "not-found", "Book not found.");
  const r = await db.query(
    "UPDATE completions SET voided_at = now(), voided_by = $3, void_reason = $4 WHERE student_id=$1 AND book_id=$2 AND voided_at IS NULL",
    [studentId, book.id, actor.id, why],
  );
  if (r.rowCount === 0)
    throw new ServiceError(404, "not-found", "No active completion record for that book.");
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId: s.school_id,
    action: "completion.voided",
    targetKind: "student",
    targetId: studentId,
    detail: { book: bookSlug, reason: why },
  });
}

export async function restoreCompletion(db: Db, actor: Actor, studentId: string, bookSlug: string) {
  const s = await visibleStudent(db, actor, studentId);
  const book = await getBook(db, bookSlug, true);
  if (!book) throw new ServiceError(404, "not-found", "Book not found.");
  const r = await db.query(
    "UPDATE completions SET voided_at = NULL, voided_by = NULL, void_reason = NULL WHERE student_id=$1 AND book_id=$2 AND voided_at IS NOT NULL",
    [studentId, book.id],
  );
  if (r.rowCount === 0) throw new ServiceError(404, "not-found", "No voided record for that book.");
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId: s.school_id,
    action: "completion.restored",
    targetKind: "student",
    targetId: studentId,
    detail: { book: bookSlug },
  });
  await awardAchievements(db, studentId);
}

/** For children who read a book together with a teacher or parent and cannot use the digital check (e.g. ages 3–5). */
export async function teacherAwardCompletion(
  db: Db,
  actor: Actor,
  studentId: string,
  bookSlug: string,
  reason: unknown,
) {
  const s = await visibleStudent(db, actor, studentId);
  const why = cleanText(reason, 3, 300, "Reason");
  const book = await getBook(db, bookSlug);
  if (!book) throw new ServiceError(404, "not-found", "Book not found.");
  const out = await db.tx(async (t) => {
    await t.query(
      "INSERT INTO reading_progress (student_id, book_id, furthest_percent, percent) VALUES ($1,$2,100,100) ON CONFLICT (student_id, book_id) DO NOTHING",
      [studentId, book.id],
    );
    return finishBook(t, studentId, book.id, {
      score: null,
      method: "teacher",
      awardedBy: actor.id,
    });
  });
  if (!out.created)
    throw new ServiceError(
      409,
      "already-completed",
      "This student already has a record for that book.",
    );
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId: s.school_id,
    action: "completion.teacher_awarded",
    targetKind: "student",
    targetId: studentId,
    detail: { book: bookSlug, reason: why },
  });
}

// ── student's own progress page ──────────────────────────────────────────────────────────────
export async function studentProgress(db: Db, studentId: string) {
  const [books, totals, perDay, ach, days] = await Promise.all([
    db.query(
      `SELECT b.slug, b.title, b.author, b.language, b.cover_path, b.age_min, b.age_max, b.layout, p.percent, p.furthest_percent, p.active_seconds, p.last_read_at,
              (c.completed_at IS NOT NULL AND c.voided_at IS NULL) AS completed, c.completed_at
         FROM reading_progress p JOIN books b ON b.id = p.book_id
         LEFT JOIN completions c ON c.student_id = p.student_id AND c.book_id = p.book_id
        WHERE p.student_id = $1 ORDER BY p.last_read_at DESC LIMIT 300`,
      [studentId],
    ),
    db.query<{ seconds: number; langs: string[] }>(
      `SELECT COALESCE(sum(p.active_seconds),0)::int AS seconds,
              COALESCE(array_agg(DISTINCT b.language) FILTER (WHERE p.furthest_percent > 0), '{}') AS langs
         FROM reading_progress p JOIN books b ON b.id = p.book_id WHERE p.student_id = $1`,
      [studentId],
    ),
    db.query<{ day: string; seconds: number }>(
      `SELECT to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day, sum(active_seconds)::int AS seconds
         FROM reading_sessions WHERE student_id = $1 AND started_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`,
      [studentId],
    ),
    db.query<{ code: string; earned_at: Date }>(
      "SELECT code, earned_at FROM achievements WHERE student_id = $1 ORDER BY earned_at",
      [studentId],
    ),
    db.query<{ day: string }>(
      `SELECT DISTINCT to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day FROM reading_sessions
        WHERE student_id = $1 AND active_seconds >= 60 AND started_at > now() - interval '400 days' ORDER BY 1 DESC`,
      [studentId],
    ),
  ]);
  const rows = books.rows as { completed: boolean; furthest_percent: number }[];
  return {
    opened: rows.length,
    reading: rows.filter((b) => !b.completed && b.furthest_percent > 0),
    completed: rows.filter((b) => b.completed),
    all: books.rows,
    totalSeconds: totals.rows[0]?.seconds ?? 0,
    languages: totals.rows[0]?.langs ?? [],
    perDay: perDay.rows,
    streak: streakFrom(days.rows.map((d) => d.day)),
    achievements: ach.rows.map((a) => ({ code: a.code, earnedAt: a.earned_at })),
  };
}

export { streakFrom };
