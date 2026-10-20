import { isMature } from "@/lib/study/srs";
import { localDayKey } from "@/lib/utils";
import type { Card, QuizAttempt, ReviewLog } from "@/lib/validation/schemas";

/** Pure statistics over persisted records. No placeholder values: empty input gives empty/zero/null results. */

export function activityDays(
  reviews: Pick<ReviewLog, "reviewedAt">[],
  attempts: Pick<QuizAttempt, "completedAt">[],
): Set<string> {
  const days = new Set<string>();
  for (const r of reviews) days.add(localDayKey(new Date(r.reviewedAt)));
  for (const a of attempts) days.add(localDayKey(new Date(a.completedAt)));
  return days;
}

function dayBefore(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
}

/**
 * Consecutive days with activity, ending today. If nothing happened yet today the streak is still
 * alive when yesterday had activity (the user can extend it today).
 */
export function currentStreak(days: Set<string>, now = new Date()): number {
  let offset = days.has(localDayKey(now)) ? 0 : 1;
  let streak = 0;
  while (days.has(localDayKey(dayBefore(now, offset)))) {
    streak += 1;
    offset += 1;
    if (streak > 3660) break;
  }
  return streak;
}

export function longestStreak(days: Set<string>): number {
  const sorted = Array.from(days).sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of sorted) {
    const [y, m, d] = key.split("-").map(Number) as [number, number, number];
    const date = new Date(y, m - 1, d);
    run = prev && dayBefore(date, 1).getTime() === prev.getTime() ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

export function quizAccuracy(attempts: Pick<QuizAttempt, "score" | "total">[]): number | null {
  const total = attempts.reduce((s, a) => s + a.total, 0);
  if (total === 0) return null;
  return Math.round((attempts.reduce((s, a) => s + a.score, 0) / total) * 100);
}

export interface CardStats {
  total: number;
  due: number;
  new: number;
  learning: number;
  mature: number;
}

export function cardStats(cards: Pick<Card, "schedule">[], now = new Date()): CardStats {
  const iso = now.toISOString();
  let due = 0,
    fresh = 0,
    mature = 0;
  for (const c of cards) {
    if (c.schedule.dueAt <= iso) due += 1;
    if (c.schedule.repetitions === 0) fresh += 1;
    else if (isMature(c.schedule)) mature += 1;
  }
  return { total: cards.length, due, new: fresh, mature, learning: cards.length - fresh - mature };
}

/** Number of cards coming due on each of the next `days` local days (index 0 = today, incl. overdue). */
export function upcomingReviews(
  cards: Pick<Card, "schedule">[],
  days = 7,
  now = new Date(),
): { label: string; count: number }[] {
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return {
      key: localDayKey(d),
      label: i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" }),
      count: 0,
    };
  });
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  for (const c of cards) {
    const due = new Date(c.schedule.dueAt);
    const idx =
      due.getTime() < endOfToday ? 0 : buckets.findIndex((b) => b.key === localDayKey(due));
    if (idx >= 0) (buckets[idx] as { count: number }).count += 1;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

export function reviewsPerDay(
  reviews: Pick<ReviewLog, "reviewedAt">[],
  days = 14,
  now = new Date(),
): { label: string; count: number }[] {
  const out = Array.from({ length: days }, (_, i) => {
    const d = dayBefore(now, days - 1 - i);
    return {
      key: localDayKey(d),
      label: d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
      count: 0,
    };
  });
  const index = new Map(out.map((o, i) => [o.key, i]));
  for (const r of reviews) {
    const i = index.get(localDayKey(new Date(r.reviewedAt)));
    if (i !== undefined) (out[i] as { count: number }).count += 1;
  }
  return out.map(({ label, count }) => ({ label, count }));
}

export function reviewsToday(reviews: Pick<ReviewLog, "reviewedAt">[], now = new Date()): number {
  const key = localDayKey(now);
  return reviews.filter((r) => localDayKey(new Date(r.reviewedAt)) === key).length;
}
