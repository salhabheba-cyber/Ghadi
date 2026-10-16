import { describe, expect, it } from "vitest";
import { transition, InvalidTransition, type MachineContext } from "@/lib/teaching/machine";
import { grade, AnswerShapeError } from "@/lib/teaching/grading";
import { computeMastery } from "@/lib/teaching/mastery";
import { ActivitySpec } from "@/lib/schemas";

const phases = ["guided", "guided", "independent", "independent"] as const;
const ctx = (over: Partial<MachineContext>): MachineContext => ({
  state: "introduction", index: 0, explanationSteps: 2, phases: [...phases], wrongOnCurrent: 0, ...over,
});

describe("teaching state machine", () => {
  it("walks the happy path from introduction to completion", () => {
    let s = transition(ctx({}), { type: "continue" });
    expect(s).toEqual({ state: "explanation", index: 0 });
    s = transition(ctx(s), { type: "continue" });
    expect(s).toEqual({ state: "explanation", index: 1 }); // two explanation steps
    s = transition(ctx(s), { type: "continue" });
    expect(s).toEqual({ state: "guided_practice", index: 0 });
    s = transition(ctx(s), { type: "answer", correct: true });
    s = transition(ctx(s), { type: "answer", correct: true });
    expect(s).toEqual({ state: "independent_attempt", index: 2 });
    s = transition(ctx(s), { type: "answer", correct: true });
    s = transition(ctx(s), { type: "answer", correct: true });
    expect(s).toEqual({ state: "recap", index: 4 });
    s = transition(ctx(s), { type: "continue" });
    expect(s.state).toBe("completion");
  });

  it("allows one retry in guided practice, then moves to correction", () => {
    const first = transition(ctx({ state: "guided_practice", wrongOnCurrent: 0 }), { type: "answer", correct: false });
    expect(first.state).toBe("guided_practice");
    const second = transition(ctx({ state: "guided_practice", wrongOnCurrent: 1 }), { type: "answer", correct: false });
    expect(second).toEqual({ state: "correction", index: 0 });
  });

  it("goes straight to correction after a wrong independent answer and resumes at the next activity", () => {
    const wrong = transition(ctx({ state: "independent_attempt", index: 2 }), { type: "answer", correct: false });
    expect(wrong).toEqual({ state: "correction", index: 2 });
    expect(transition(ctx({ ...wrong }), { type: "continue" })).toEqual({ state: "independent_attempt", index: 3 });
  });

  it("goes to recap when the last activity is corrected", () => {
    expect(transition(ctx({ state: "correction", index: 3 }), { type: "continue" })).toEqual({ state: "recap", index: 4 });
  });

  it("skips practice when a lesson has no activities", () => {
    expect(transition(ctx({ state: "explanation", explanationSteps: 1, phases: [] }), { type: "continue" }).state).toBe("recap");
  });

  it("rejects invalid events and anything after completion", () => {
    expect(() => transition(ctx({ state: "introduction" }), { type: "answer", correct: true })).toThrow(InvalidTransition);
    expect(() => transition(ctx({ state: "recap" }), { type: "answer", correct: true })).toThrow(InvalidTransition);
    expect(() => transition(ctx({ state: "completion" }), { type: "continue" })).toThrow(InvalidTransition);
  });
});

const choice = ActivitySpec.parse({
  kind: "choice", phase: "guided", prompt: "Which is red?",
  options: [{ id: "a", label: "Red" }, { id: "b", label: "Blue" }, { id: "c", label: "Green" }],
  correctOptionIds: ["a"], hints: ["Think of an apple."], explanation: "Red is the colour of a ripe apple.",
});
const count = ActivitySpec.parse({
  kind: "count", phase: "independent", prompt: "How many?", countVisual: { emoji: "⭐", count: 3 },
  options: [2, 3, 4], correct: 3, hints: ["Point and count."], explanation: "There are three stars.",
});

describe("deterministic grading", () => {
  it("grades choice and count answers", () => {
    expect(grade(choice, { optionIds: ["a"] })).toBe(true);
    expect(grade(choice, { optionIds: ["b"] })).toBe(false);
    expect(grade(choice, { optionIds: ["a", "b"] })).toBe(false);
    expect(grade(count, { value: 3 })).toBe(true);
    expect(grade(count, { value: 2 })).toBe(false);
  });
  it("rejects answers of the wrong shape or unknown options", () => {
    expect(() => grade(choice, { value: 3 })).toThrow(AnswerShapeError);
    expect(() => grade(choice, { optionIds: ["zzz"] })).toThrow(AnswerShapeError);
    expect(() => grade(count, { optionIds: ["a"] })).toThrow(AnswerShapeError);
    expect(() => grade(count, { value: 9 })).toThrow(AnswerShapeError);
  });
});

describe("activity spec validation", () => {
  it("rejects a correct answer that is not among the options", () => {
    expect(() => ActivitySpec.parse({ ...choice, correctOptionIds: ["nope"] })).toThrow();
    expect(() => ActivitySpec.parse({ ...count, correct: 9 })).toThrow();
  });
});

describe("mastery estimate", () => {
  it("never claims anything without enough evidence", () => {
    expect(computeMastery([]).label).toBe("not_enough_evidence");
    expect(computeMastery([{ success: true, independent: true }, { success: true, independent: true }]).label).toBe("not_enough_evidence");
  });
  it("needs independent successes for 'consistent'", () => {
    const hinted = Array.from({ length: 6 }, () => ({ success: true, independent: false }));
    expect(computeMastery(hinted).label).not.toBe("consistent");
    const strong = Array.from({ length: 4 }, () => ({ success: true, independent: true }));
    expect(computeMastery(strong).label).toBe("consistent");
  });
  it("reports emerging for mostly wrong evidence", () => {
    const weak = [false, false, false, true].map((success) => ({ success, independent: true }));
    expect(computeMastery(weak).label).toBe("emerging");
  });
});
