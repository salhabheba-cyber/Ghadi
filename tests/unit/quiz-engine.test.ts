import { describe, expect, it } from "vitest";
import {
  gradeResponse,
  keywordOverlap,
  normalizeAnswer,
  prepareQuestionsForAttempt,
  scoreQuiz,
  shuffle,
  toPublicQuestion,
} from "@/lib/study/quiz-engine";
import { seededRandom } from "@/lib/study/rng";
import type { Question } from "@/lib/validation/schemas";

const base = { tags: [], explanation: "because", difficulty: "medium" as const };
const mcq: Question = {
  ...base,
  id: "q1",
  type: "mcq",
  prompt: "Capital of France?",
  options: ["Paris", "Rome", "Madrid"],
  correct: ["Paris"],
};
const tf: Question = {
  ...base,
  id: "q2",
  type: "tf",
  prompt: "The sun is a star.",
  options: ["True", "False"],
  correct: ["True"],
};
const fill: Question = {
  ...base,
  id: "q3",
  type: "fill",
  prompt: "H2O is _____",
  correct: ["water"],
};
const short: Question = {
  ...base,
  id: "q4",
  type: "short",
  prompt: "What is photosynthesis?",
  correct: ["The process by which green plants convert light energy into chemical energy."],
};

describe("answer normalisation", () => {
  it("ignores case, punctuation and extra whitespace", () => {
    expect(normalizeAnswer("  Wa-ter!!  ")).toBe("wa ter");
    expect(normalizeAnswer("WATER")).toBe("water");
  });
  it("ignores diacritics, including Arabic marks", () => {
    expect(normalizeAnswer("café")).toBe("cafe");
    expect(normalizeAnswer("إِسْلام")).toBe(normalizeAnswer("اسلام"));
  });
});

describe("grading", () => {
  it("grades multiple choice and true/false exactly", () => {
    expect(gradeResponse(mcq, "Paris")).toBe(true);
    expect(gradeResponse(mcq, "Rome")).toBe(false);
    expect(gradeResponse(tf, "True")).toBe(true);
    expect(gradeResponse(tf, "False")).toBe(false);
  });
  it("grades fill-in-the-blank after normalising", () => {
    expect(gradeResponse(fill, "  Water. ")).toBe(true);
    expect(gradeResponse(fill, "waters")).toBe(false);
  });
  it("never marks an empty or missing response correct", () => {
    expect(gradeResponse(fill, "")).toBe(false);
    expect(gradeResponse(mcq, undefined)).toBe(false);
    expect(gradeResponse(short, "   ")).toBe(false);
  });
  it("grades long short-answers on key-word coverage", () => {
    expect(gradeResponse(short, "Green plants convert light energy into chemical energy")).toBe(
      true,
    );
    expect(gradeResponse(short, "Plants eat soil")).toBe(false);
    expect(keywordOverlap("light energy", short.correct[0] as string)).toBeLessThan(0.7);
  });
  it("requires an exact match for very short accepted answers", () => {
    const q: Question = { ...short, id: "q5", correct: ["Mitochondria"] };
    expect(gradeResponse(q, "mitochondria")).toBe(true);
    expect(gradeResponse(q, "the mitochondria is an organelle")).toBe(false);
  });
});

describe("scoreQuiz", () => {
  const quiz = { questions: [mcq, tf, fill, short] };
  it("counts correct answers and percentage", () => {
    const r = scoreQuiz(quiz, { q1: "Paris", q2: "False", q3: "water" });
    expect(r.score).toBe(2);
    expect(r.total).toBe(4);
    expect(r.percent).toBe(50);
    expect(r.answers.map((a) => a.correct)).toEqual([true, false, true, false]);
  });
  it("marks unanswered questions as skipped and wrong", () => {
    const r = scoreQuiz(quiz, { q1: "Paris" });
    expect(r.answers[1]).toMatchObject({ skipped: true, correct: false, response: "" });
  });
  it("handles a quiz with no questions without dividing by zero", () => {
    expect(scoreQuiz({ questions: [] }, {}).percent).toBe(0);
  });
});

describe("answer secrecy and shuffling", () => {
  it("removes the answer, explanation and source from public questions", () => {
    const pub = toPublicQuestion({ ...mcq, sourceExcerpt: "Paris is the capital." }) as Record<
      string,
      unknown
    >;
    expect(pub.correct).toBeUndefined();
    expect(pub.explanation).toBeUndefined();
    expect(pub.sourceExcerpt).toBeUndefined();
    expect(pub.options).toEqual(["Paris", "Rome", "Madrid"]);
  });
  it("shuffles deterministically with a seeded random source and keeps every item", () => {
    const a = shuffle([1, 2, 3, 4, 5, 6], seededRandom("x"));
    const b = shuffle([1, 2, 3, 4, 5, 6], seededRandom("x"));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("shuffles multiple-choice options but never true/false", () => {
    const out = prepareQuestionsForAttempt([mcq, tf], seededRandom("seed"));
    expect([...(out[0]?.options ?? [])].sort()).toEqual(["Madrid", "Paris", "Rome"]);
    expect(out[1]?.options).toEqual(["True", "False"]);
    expect(out[0]?.correct).toEqual(["Paris"]);
  });
});
