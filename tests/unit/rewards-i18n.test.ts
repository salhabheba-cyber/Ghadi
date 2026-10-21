import { describe, expect, it } from "vitest";
import { computeRewards } from "@/lib/rewards";
import { DICTIONARY, LANGUAGES, dirFor, isLanguage } from "@/lib/i18n";

const at = (iso: string) => ({ reviewedAt: iso });
const attempt = (score: number, iso: string) => ({ score, completedAt: iso });

describe("computeRewards", () => {
  it("is exactly zero with no study activity (no invented rewards)", () => {
    expect(computeRewards([], [])).toEqual({ xp: 0, coins: 0 });
  });

  it("XP = reviews + correct answers; coins = quizzes + distinct study days", () => {
    const reviews = [
      at("2026-06-01T09:00:00"),
      at("2026-06-01T09:05:00"),
      at("2026-06-02T09:00:00"),
    ];
    const attempts = [attempt(4, "2026-06-02T10:00:00"), attempt(3, "2026-06-03T10:00:00")];
    // 3 reviews + (4 + 3) correct = 10 XP; 2 quizzes + 3 distinct days = 5 coins
    expect(computeRewards(reviews, attempts)).toEqual({ xp: 10, coins: 5 });
  });

  it("is deterministic: the same history always gives the same totals", () => {
    const r = [at("2026-06-01T09:00:00")];
    const a = [attempt(2, "2026-06-01T10:00:00")];
    expect(computeRewards(r, a)).toEqual(computeRewards(r, a));
  });
});

describe("i18n", () => {
  it("supports exactly English, French and Arabic", () => {
    expect([...LANGUAGES]).toEqual(["en", "fr", "ar"]);
    expect(isLanguage("ar")).toBe(true);
    expect(isLanguage("de")).toBe(false);
  });

  it("Arabic is right-to-left, the others left-to-right", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
    expect(dirFor("fr")).toBe("ltr");
  });

  it("every language defines every key, with no empty strings", () => {
    const keys = Object.keys(DICTIONARY.en).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(DICTIONARY[lang]).sort()).toEqual(keys);
      for (const [k, v] of Object.entries(DICTIONARY[lang])) {
        if (Array.isArray(v)) expect(v.length, `${lang}.${k}`).toBeGreaterThan(0);
        else expect(String(v).trim().length, `${lang}.${k}`).toBeGreaterThan(0);
      }
    }
  });
});
