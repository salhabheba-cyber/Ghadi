import type { Db } from "../db/client";
import { ServiceError } from "./core";
import { formatDisplayName } from "./students";
import type { NameFormat } from "./schools";

export type PeriodKey = "month" | "year" | "all" | `challenge:${string}`;

export interface Period {
  key: string;
  label: string;
  from: Date | null;
  to: Date | null;
  prizes: Record<string, string>;
  challengeName: string | null;
}

export const NEUTRAL_REWARD = "Ghadi reading badge";

/** The academic year runs 1 September to 31 August (UTC). */
export function academicYearStart(now: Date): Date {
  const y = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return new Date(Date.UTC(y, 8, 1));
}

export async function resolvePeriod(
  db: Db,
  schoolId: string,
  key: string | undefined,
  now = new Date(),
): Promise<Period> {
  if (key?.startsWith("challenge:")) {
    const id = key.slice("challenge:".length);
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new ServiceError(404, "not-found", "Challenge not found.");
    const r = await db.query<{
      name: string;
      starts_on: string;
      ends_on: string;
      prizes: Record<string, string>;
    }>(
      "SELECT name, starts_on::text, ends_on::text, prizes FROM challenges WHERE id = $1 AND school_id = $2 AND archived_at IS NULL",
      [id, schoolId],
    );
    const c = r.rows[0];
    if (!c) throw new ServiceError(404, "not-found", "Challenge not found.");
    const to = new Date(`${c.ends_on}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 1);
    return {
      key,
      label: c.name,
      from: new Date(`${c.starts_on}T00:00:00Z`),
      to,
      prizes: c.prizes ?? {},
      challengeName: c.name,
    };
  }
  // Default: the challenge running today if there is one, else the current month.
  if (!key) {
    const today = now.toISOString().slice(0, 10);
    const r = await db.query<{ id: string }>(
      "SELECT id FROM challenges WHERE school_id = $1 AND archived_at IS NULL AND starts_on <= $2::date AND ends_on >= $2::date ORDER BY starts_on DESC LIMIT 1",
      [schoolId, today],
    );
    if (r.rows[0]) return resolvePeriod(db, schoolId, `challenge:${r.rows[0].id}`, now);
    key = "month";
  }
  if (key === "month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return {
      key,
      label: "This month",
      from,
      to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      prizes: {},
      challengeName: null,
    };
  }
  if (key === "year") {
    const from = academicYearStart(now);
    return {
      key,
      label: "This school year",
      from,
      to: new Date(Date.UTC(from.getUTCFullYear() + 1, 8, 1)),
      prizes: {},
      challengeName: null,
    };
  }
  if (key === "all")
    return { key, label: "All time", from: null, to: null, prizes: {}, challengeName: null };
  throw new ServiceError(400, "invalid", "Unknown time period.");
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  className: string | null;
  books: number;
  reward: string;
  rewardIsPrize: boolean;
  isYou?: boolean;
}

export interface Leaderboard {
  period: { key: string; label: string };
  scope: { type: "school" | "class"; classId: string | null };
  entries: LeaderboardEntry[];
  /** How many readers share the lowest rank shown beyond the entries listed (ties can be long). */
  moreTied: number;
  participants: number;
  you: { rank: number; books: number } | null;
  tieRule: string;
}

export const TIE_RULE =
  "Readers with the same number of finished books share the same rank, and the next rank is skipped (1, 2, 2, 4).";
const MAX_LISTED = 10;

/**
 * Rankings come from the completions table only: one verified, un-voided record per student per book, for active
 * students of this school. Students who chose to be private still occupy their rank but appear as "A private reader".
 */
export async function getLeaderboard(
  db: Db,
  input: {
    schoolId: string;
    classId?: string | null;
    period?: string;
    viewerStudentId?: string | null;
    ranksShown?: number;
  },
  now = new Date(),
): Promise<Leaderboard> {
  const sc = await db.query<{ name_format: NameFormat }>(
    "SELECT name_format FROM schools WHERE id = $1 AND archived_at IS NULL",
    [input.schoolId],
  );
  if (!sc.rows[0]) throw new ServiceError(404, "not-found", "School not found.");
  const period = await resolvePeriod(db, input.schoolId, input.period, now);
  const classId = input.classId ?? null;
  if (classId) {
    const ok = await db.query("SELECT 1 FROM classes WHERE id = $1 AND school_id = $2", [
      classId,
      input.schoolId,
    ]);
    if (ok.rowCount === 0) throw new ServiceError(404, "not-found", "Class not found.");
  }
  const r = await db.query<{
    id: string;
    display_name: string;
    nickname: string | null;
    show: boolean;
    class_name: string | null;
    books: number;
    rank: number;
  }>(
    `WITH counts AS (
       SELECT s.id, s.display_name, s.nickname, s.show_on_leaderboard AS show, c.name AS class_name, count(*)::int AS books
         FROM completions co
         JOIN students s ON s.id = co.student_id
         LEFT JOIN classes c ON c.id = s.class_id
        WHERE s.school_id = $1 AND s.status = 'active' AND co.voided_at IS NULL
          AND ($2::uuid IS NULL OR s.class_id = $2)
          AND ($3::timestamptz IS NULL OR co.completed_at >= $3)
          AND ($4::timestamptz IS NULL OR co.completed_at < $4)
        GROUP BY s.id, s.display_name, s.nickname, s.show_on_leaderboard, c.name
     )
     SELECT *, RANK() OVER (ORDER BY books DESC)::int AS rank FROM counts ORDER BY books DESC, display_name, id`,
    [input.schoolId, classId, period.from, period.to],
  );
  const format = sc.rows[0].name_format;
  const shown = input.ranksShown ?? 5;
  const top = r.rows.filter((x) => x.rank <= shown);
  const listed = top.slice(0, MAX_LISTED);
  const entries: LeaderboardEntry[] = listed.map((x) => {
    const prize = period.prizes[String(x.rank)];
    return {
      rank: x.rank,
      name: x.show ? formatDisplayName(x.display_name, x.nickname, format) : "A private reader",
      className: x.show ? x.class_name : null,
      books: x.books,
      reward: prize || NEUTRAL_REWARD,
      rewardIsPrize: Boolean(prize),
      isYou: input.viewerStudentId ? x.id === input.viewerStudentId : undefined,
    };
  });
  const me = input.viewerStudentId ? r.rows.find((x) => x.id === input.viewerStudentId) : undefined;
  return {
    period: { key: period.key, label: period.label },
    scope: { type: classId ? "class" : "school", classId },
    entries,
    moreTied: top.length - listed.length,
    participants: r.rows.length,
    you: me ? { rank: me.rank, books: me.books } : null,
    tieRule: TIE_RULE,
  };
}
