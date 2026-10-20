import type { Rating, Schedule } from "@/lib/validation/schemas";

/**
 * Ghadi's spaced-repetition scheduler: a simplified, SM-2-inspired algorithm with three ratings.
 *
 * Ratings
 *  - forgotten: the card lapses. Repetitions reset, the interval resets to 0 (due again right now,
 *    so a study session can show it again), ease drops by 0.20 (never below 1.30).
 *  - difficult: recalled with effort. Interval grows slowly (x1.2, minimum 1 day), ease drops 0.15.
 *  - known: recalled well. Intervals follow 1 day, 6 days, then previous interval x ease.
 *    Ease rises by 0.10.
 *
 * Due dates are the local midnight that starts the due day (in the user's current time zone), so a
 * card scheduled "in 3 days" becomes due at the start of that calendar day. Interval 0 means due now.
 * Timestamps are stored as absolute ISO instants; if the user travels across time zones the card
 * simply stays due at the same instant.
 */

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;
export const MAX_INTERVAL_DAYS = 3650;

export function initialSchedule(now: Date): Schedule {
  return {
    ease: DEFAULT_EASE,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: now.toISOString(),
  };
}

/** Local midnight of (day of `from`) + `days` calendar days. Calendar arithmetic, so DST-safe. */
export function addLocalDays(from: Date, days: number): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, 0, 0, 0, 0);
}

function roundEase(value: number): number {
  return Math.max(MIN_EASE, Math.round(value * 100) / 100);
}

export function nextInterval(schedule: Schedule, rating: Rating): number {
  switch (rating) {
    case "forgotten":
      return 0;
    case "difficult":
      return schedule.repetitions === 0
        ? 1
        : Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(schedule.intervalDays * 1.2)));
    case "known":
      if (schedule.repetitions === 0) return 1;
      if (schedule.repetitions === 1) return 6;
      return Math.min(
        MAX_INTERVAL_DAYS,
        Math.max(schedule.intervalDays + 1, Math.round(schedule.intervalDays * schedule.ease)),
      );
  }
}

export function applyRating(schedule: Schedule, rating: Rating, now: Date): Schedule {
  const intervalDays = nextInterval(schedule, rating);
  const dueAt = intervalDays === 0 ? now : addLocalDays(now, intervalDays);

  switch (rating) {
    case "forgotten":
      return {
        ease: roundEase(schedule.ease - 0.2),
        intervalDays,
        repetitions: 0,
        lapses: schedule.lapses + 1,
        dueAt: dueAt.toISOString(),
        lastReviewedAt: now.toISOString(),
      };
    case "difficult":
      return {
        ease: roundEase(schedule.ease - 0.15),
        intervalDays,
        repetitions: schedule.repetitions + 1,
        lapses: schedule.lapses,
        dueAt: dueAt.toISOString(),
        lastReviewedAt: now.toISOString(),
      };
    case "known":
      return {
        ease: roundEase(schedule.ease + 0.1),
        intervalDays,
        repetitions: schedule.repetitions + 1,
        lapses: schedule.lapses,
        dueAt: dueAt.toISOString(),
        lastReviewedAt: now.toISOString(),
      };
  }
}

export function isDue(schedule: Schedule, now: Date): boolean {
  return new Date(schedule.dueAt).getTime() <= now.getTime();
}

/** Short label for the rating buttons, e.g. "<1d", "1d", "6d", "2w". */
export function describeInterval(days: number): string {
  if (days <= 0) return "<1d";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 730) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

export function previewIntervals(schedule: Schedule): Record<Rating, string> {
  return {
    forgotten: describeInterval(nextInterval(schedule, "forgotten")),
    difficult: describeInterval(nextInterval(schedule, "difficult")),
    known: describeInterval(nextInterval(schedule, "known")),
  };
}

/** A card counts as "mature" once its interval reaches 21 days. */
export function isMature(schedule: Schedule): boolean {
  return schedule.intervalDays >= 21;
}
