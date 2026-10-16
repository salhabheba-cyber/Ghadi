import { describe, expect, it } from "vitest";
import { recommend, type SkillInput } from "@/lib/teaching/recommend";

const now = new Date("2026-10-15T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const sk = (over: Partial<SkillInput>): SkillInput => ({ skillId: "s", name: "Counting", label: "developing", estimate: 0.6, evidenceCount: 5, lastPracticed: daysAgo(0), ...over });

describe("recommendations (rule-based, with reasons)", () => {
  it("asks for more evidence instead of judging when there are few answers", () => {
    const r = recommend({ skills: [sk({ label: "not_enough_evidence", evidenceCount: 2 })], prerequisites: [], skillNames: {}, now });
    expect(r[0]!.reason).toEqual({ code: "few_answers", evidenceCount: 2 });
  });
  it("suggests practice for emerging skills and the prerequisite when that has little evidence", () => {
    const r = recommend({
      skills: [sk({ skillId: "b", name: "Adding", label: "emerging", estimate: 0.3 })],
      prerequisites: [{ skillId: "b", prerequisiteId: "a" }], skillNames: { a: "Counting" }, now,
    });
    expect(r.map((x) => x.reason.code)).toEqual(["needs_practice", "prerequisite"]);
  });
  it("spaced review: steady skills come back later, fresh ones are left alone", () => {
    expect(recommend({ skills: [sk({ label: "consistent", lastPracticed: daysAgo(2) })], prerequisites: [], skillNames: {}, now })).toHaveLength(0);
    expect(recommend({ skills: [sk({ label: "consistent", lastPracticed: daysAgo(8) })], prerequisites: [], skillNames: {}, now })[0]!.reason).toMatchObject({ code: "review_due", daysSince: 8 });
    expect(recommend({ skills: [sk({ label: "developing", lastPracticed: daysAgo(3) })], prerequisites: [], skillNames: {}, now })).toHaveLength(1);
  });
  it("offers to continue an unfinished lesson first", () => {
    expect(recommend({ skills: [], prerequisites: [], skillNames: {}, resumeLesson: "Counting to five", now })[0]!.reason.code).toBe("continue_lesson");
  });
});
