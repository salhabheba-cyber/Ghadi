import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  applyRating,
  describeInterval,
  initialSchedule,
  isDue,
  nextInterval,
  previewIntervals,
} from "@/lib/study/srs";

const NOW = new Date(2026, 2, 7, 15, 30, 0); // 7 March 2026, 15:30 local

describe("spaced repetition scheduler", () => {
  it("starts new cards as due immediately", () => {
    const s = initialSchedule(NOW);
    expect(s.intervalDays).toBe(0);
    expect(s.ease).toBe(2.5);
    expect(isDue(s, NOW)).toBe(true);
  });

  it("grows intervals 1 day, 6 days, then by ease when answers are known", () => {
    let s = initialSchedule(NOW);
    s = applyRating(s, "known", NOW);
    expect(s.intervalDays).toBe(1);
    s = applyRating(s, "known", NOW);
    expect(s.intervalDays).toBe(6);
    s = applyRating(s, "known", NOW);
    expect(s.intervalDays).toBe(16); // round(6 * 2.7)
    expect(s.repetitions).toBe(3);
    expect(s.ease).toBe(2.8);
  });

  it("resets progress and keeps the card due now when forgotten", () => {
    let s = applyRating(applyRating(initialSchedule(NOW), "known", NOW), "known", NOW);
    s = applyRating(s, "forgotten", NOW);
    expect(s.intervalDays).toBe(0);
    expect(s.repetitions).toBe(0);
    expect(s.lapses).toBe(1);
    expect(s.dueAt).toBe(NOW.toISOString());
    expect(isDue(s, NOW)).toBe(true);
  });

  it("never lets ease fall below 1.3", () => {
    let s = initialSchedule(NOW);
    for (let i = 0; i < 20; i++) s = applyRating(s, "forgotten", NOW);
    expect(s.ease).toBe(1.3);
  });

  it("treats difficult as a slow step (1 day first, then x1.2)", () => {
    let s = applyRating(initialSchedule(NOW), "difficult", NOW);
    expect(s.intervalDays).toBe(1);
    expect(s.ease).toBe(2.35);
    s = { ...s, intervalDays: 10, repetitions: 3 };
    expect(nextInterval(s, "difficult")).toBe(12);
  });

  it("always grows the interval for known answers once mature", () => {
    const s = { ...initialSchedule(NOW), intervalDays: 1, repetitions: 5, ease: 1.3 };
    expect(nextInterval(s, "known")).toBe(2);
  });

  it("schedules due dates at local midnight of the due day", () => {
    const s = applyRating(initialSchedule(NOW), "known", NOW);
    const due = new Date(s.dueAt);
    expect(due.getDate()).toBe(8);
    expect(due.getHours()).toBe(0);
    expect(due.getMinutes()).toBe(0);
    expect(isDue(s, NOW)).toBe(false);
    expect(isDue(s, new Date(2026, 2, 8, 0, 0, 1))).toBe(true);
  });

  it("keeps local midnight across a daylight-saving change (calendar arithmetic, not 24h blocks)", () => {
    // US clocks go forward on 8 March 2026. Six days after 7 March is 13 March, still at 00:00 local.
    const due = addLocalDays(new Date(2026, 2, 7, 22, 0), 6);
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(2);
    expect(due.getDate()).toBe(13);
    expect(due.getHours()).toBe(0);
  });

  it("handles month and year boundaries", () => {
    const due = addLocalDays(new Date(2026, 11, 30, 10, 0), 3);
    expect(due.getFullYear()).toBe(2027);
    expect(due.getMonth()).toBe(0);
    expect(due.getDate()).toBe(2);
  });

  it("labels intervals for the rating buttons", () => {
    expect(describeInterval(0)).toBe("<1d");
    expect(describeInterval(6)).toBe("6d");
    expect(describeInterval(21)).toBe("3w");
    expect(describeInterval(90)).toBe("3mo");
    const preview = previewIntervals(initialSchedule(NOW));
    expect(preview).toEqual({ forgotten: "<1d", difficult: "1d", known: "1d" });
  });
});
