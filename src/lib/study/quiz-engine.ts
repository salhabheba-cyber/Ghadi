import type { AttemptAnswer, Question, Quiz } from "@/lib/validation/schemas";
import { STOPWORDS } from "./text";

/**
 * Scoring engine. Deliberately independent of any AI provider: it only looks at saved questions and
 * the learner's responses.
 */

/** Lowercase, strip diacritics/marks and punctuation, collapse whitespace. Works for Latin and Arabic. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keyTokens(text: string): string[] {
  return normalizeAnswer(text)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Fraction of the accepted answer's key words that appear in the response. */
export const SHORT_ANSWER_THRESHOLD = 0.7;

export function keywordOverlap(response: string, accepted: string): number {
  const wanted = Array.from(new Set(keyTokens(accepted)));
  if (wanted.length === 0) return 0;
  const have = new Set(keyTokens(response));
  const hits = wanted.filter((w) => have.has(w)).length;
  return hits / wanted.length;
}

/** Returns true if the response is correct for the question. Empty responses are always wrong. */
export function gradeResponse(question: Question, response: string | undefined): boolean {
  if (response === undefined) return false;
  const given = normalizeAnswer(response);
  if (given === "") return false;

  switch (question.type) {
    case "mcq":
    case "tf":
      return question.correct.some((c) => normalizeAnswer(c) === given);
    case "fill":
      return question.correct.some((c) => normalizeAnswer(c) === given);
    case "short":
      return question.correct.some(
        (c) =>
          normalizeAnswer(c) === given ||
          // A sentence-long accepted answer is graded on key-word coverage; a short one needs an exact match.
          (keyTokens(c).length >= 3 && keywordOverlap(response, c) >= SHORT_ANSWER_THRESHOLD),
      );
  }
}

export interface ScoreResult {
  score: number;
  total: number;
  percent: number;
  answers: AttemptAnswer[];
}

/** AI check results keyed by question ID — when present, they override local grading. */
export interface AiCheckMap {
  [questionId: string]:
    { loading: boolean; result: { correct: boolean } | null; error: string | null } | undefined;
}

export function scoreQuiz(
  quiz: Pick<Quiz, "questions">,
  responses: Record<string, string | undefined>,
  aiChecks?: AiCheckMap,
): ScoreResult {
  const answers: AttemptAnswer[] = quiz.questions.map((q) => {
    const response = responses[q.id];
    const skipped = response === undefined || normalizeAnswer(response) === "";

    // If an AI result exists for this question, use it; otherwise fall back to local grading.
    const aiEntry = aiChecks?.[q.id];
    const correct = aiEntry?.result != null ? aiEntry.result.correct : gradeResponse(q, response);

    return {
      questionId: q.id,
      response: response ?? "",
      correct,
      skipped,
    };
  });
  const score = answers.filter((a) => a.correct).length;
  const total = quiz.questions.length;
  return { score, total, percent: total === 0 ? 0 : Math.round((score / total) * 100), answers };
}

export function accuracy(correct: number, total: number): number | null {
  return total === 0 ? null : Math.round((correct / total) * 100);
}

/** Question as shown to a learner BEFORE answering: no correct answer, no explanation. */
export type PublicQuestion = Omit<Question, "correct" | "explanation" | "sourceExcerpt">;

export function toPublicQuestion(q: Question): PublicQuestion {
  const { correct: _correct, explanation: _explanation, sourceExcerpt: _source, ...rest } = q;
  return rest;
}

/** Fisher-Yates shuffle with a supplied random source (so tests can be deterministic). */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = a;
  }
  return arr;
}

/** Shuffles multiple-choice options for one sitting. True/false keeps its natural order. */
export function prepareQuestionsForAttempt(
  questions: Question[],
  random: () => number = Math.random,
): Question[] {
  return questions.map((q) =>
    q.type === "mcq" && q.options ? { ...q, options: shuffle(q.options, random) } : q,
  );
}
