import { describe, expect, it } from "vitest";
import {
  activityDays,
  cardStats,
  currentStreak,
  longestStreak,
  quizAccuracy,
  reviewsPerDay,
  reviewsToday,
  upcomingReviews,
} from "@/lib/stats";
import { initialSchedule } from "@/lib/study/srs";
import { localDayKey } from "@/lib/utils";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const NOW = new Date(2026, 5, 10, 15, 0);

describe("streaks", () => {
  it("is 0 with no activity", () => {
    expect(currentStreak(new Set(), NOW)).toBe(0);
    expect(longestStreak(new Set())).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const days = activityDays(
      [{ reviewedAt: at(2026, 6, 10) }, { reviewedAt: at(2026, 6, 9) }],
      [{ completedAt: at(2026, 6, 8) }],
    );
    expect(currentStreak(days, NOW)).toBe(3);
  });

  it("keeps the streak alive when only yesterday has activity", () => {
    expect(
      currentStreak(
        new Set([localDayKey(new Date(2026, 5, 9)), localDayKey(new Date(2026, 5, 8))]),
        NOW,
      ),
    ).toBe(2);
  });

  it("breaks after a missed day", () => {
    expect(currentStreak(new Set([localDayKey(new Date(2026, 5, 8))]), NOW)).toBe(0);
  });

  it("finds the longest run, including across month boundaries", () => {
    const keys = [
      [2026, 5, 30],
      [2026, 6, 1],
      [2026, 5, 31],
      [2026, 6, 5],
    ].map(([y, m, d]) => localDayKey(new Date(y!, m! - 1, d!)));
    expect(longestStreak(new Set(keys))).toBe(3);
  });
});

describe("quiz accuracy", () => {
  it("is null without attempts (no invented numbers)", () => {
    expect(quizAccuracy([])).toBeNull();
  });
  it("weights by question count", () => {
    expect(
      quizAccuracy([
        { score: 1, total: 2 },
        { score: 9, total: 10 },
      ]),
    ).toBe(83);
  });
});

describe("card statistics", () => {
  const mk = (over: Partial<ReturnType<typeof initialSchedule>>) => ({
    schedule: { ...initialSchedule(NOW), ...over },
  });
  it("classifies new, learning, mature and due cards", () => {
    const cards = [
      mk({}),
      mk({ repetitions: 2, intervalDays: 6, dueAt: at(2026, 6, 20) }),
      mk({ repetitions: 5, intervalDays: 30, dueAt: at(2026, 7, 20) }),
    ];
    expect(cardStats(cards, NOW)).toEqual({ total: 3, due: 1, new: 1, learning: 1, mature: 1 });
  });
});

describe("upcoming and history", () => {
  it("buckets overdue cards into today and future cards into their day", () => {
    const cards = [at(2026, 6, 1), at(2026, 6, 10), at(2026, 6, 12), at(2026, 6, 30)].map(
      (dueAt) => ({ schedule: { ...initialSchedule(NOW), dueAt } }),
    );
    const r = upcomingReviews(cards, 7, NOW);
    expect(r).toHaveLength(7);
    expect(r[0]?.count).toBe(2);
    expect(r[2]?.count).toBe(1);
    expect(r.reduce((s, b) => s + b.count, 0)).toBe(3);
  });

  it("counts reviews per day over a window and today", () => {
    const logs = [
      { reviewedAt: at(2026, 6, 10) },
      { reviewedAt: at(2026, 6, 10, 9) },
      { reviewedAt: at(2026, 6, 8) },
      { reviewedAt: at(2025, 1, 1) },
    ];
    const r = reviewsPerDay(logs, 3, NOW);
    expect(r.map((x) => x.count)).toEqual([1, 0, 2]);
    expect(reviewsToday(logs, NOW)).toBe(2);
  });
});
