import type { ActivitySpec, AnswerInput } from "@/lib/schemas";

export class AnswerShapeError extends Error {}

/** Deterministic grading. No model is involved in deciding correctness. */
export function grade(spec: ActivitySpec, answer: AnswerInput): boolean {
  if (spec.kind === "choice") {
    if (!("optionIds" in answer)) throw new AnswerShapeError("expected optionIds");
    const given = new Set(answer.optionIds);
    const valid = new Set(spec.options.map((o) => o.id));
    for (const id of given) if (!valid.has(id)) throw new AnswerShapeError("unknown option");
    const correct = new Set(spec.correctOptionIds);
    return given.size === correct.size && [...given].every((id) => correct.has(id));
  }
  if (!("value" in answer)) throw new AnswerShapeError("expected value");
  if (!spec.options.includes(answer.value)) throw new AnswerShapeError("unknown option");
  return answer.value === spec.correct;
}
