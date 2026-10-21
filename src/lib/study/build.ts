import type { NoteDraft, QuestionDraft } from "@/lib/ai/types";
import {
  noteSchema,
  questionSchema,
  quizSchema,
  type Difficulty,
  type Note,
  type Origin,
  type Question,
  type Quiz,
} from "@/lib/validation/schemas";
import { newId, nowIso, truncate } from "@/lib/utils";
import { normalizeAnswer } from "./quiz-engine";

/** Turns a generator's draft into a validated, saved-ready Note. */
export function buildNote(args: {
  title: string;
  documentId?: string;
  origin: Origin;
  draft: NoteDraft;
  tags?: string[];
}): Note {
  const { draft } = args;
  const now = nowIso();
  const note = {
    id: newId(),
    title: truncate(args.title, 200),
    documentId: args.documentId,
    origin: args.origin,
    overview: truncate(draft.overview, 5000),
    summary: truncate(draft.summary, 10_000),
    keyConcepts: draft.keyConcepts.slice(0, 100),
    definitions: draft.definitions.slice(0, 200).map((d) => ({
      id: newId(),
      term: truncate(d.term, 120),
      definition: truncate(d.definition, 1000),
      provenance: d.provenance,
      sourceExcerpt: d.sourceExcerpt ? truncate(d.sourceExcerpt, 1000) : undefined,
    })),
    sections: draft.sections.slice(0, 200).map((s) => ({
      id: newId(),
      heading: truncate(s.heading, 200),
      body: truncate(s.body, 20_000),
      provenance: s.provenance,
      sourceExcerpt: s.sourceExcerpt ? truncate(s.sourceExcerpt, 1000) : undefined,
    })),
    facts: draft.facts.slice(0, 300).map((f) => ({
      id: newId(),
      kind: f.kind,
      value: truncate(f.value, 500),
      context: f.context ? truncate(f.context, 500) : undefined,
      provenance: args.origin === "heuristic" ? ("extracted" as const) : ("generated" as const),
    })),
    examples: draft.examples.slice(0, 100).map((text) => ({
      id: newId(),
      text: truncate(text, 1000),
      provenance: args.origin === "heuristic" ? ("extracted" as const) : ("generated" as const),
    })),
    relationships: draft.relationships.slice(0, 100).map((r) => truncate(r, 300)),
    checklist: draft.checklist
      .slice(0, 200)
      .map((text) => ({ id: newId(), text: truncate(text, 300), done: false })),
    notices: draft.notices.slice(0, 20).map((n) => truncate(n, 500)),
    tags: args.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };
  return noteSchema.parse(note);
}

export interface FinalizedQuestions {
  questions: Question[];
  /** Drafts that failed validation and were discarded. */
  dropped: number;
  /** Drafts discarded because they repeated an earlier question. */
  duplicates: number;
  /** Drafts discarded because the source passage they cite is not in the source text. */
  ungrounded: number;
}

/** True when the cited excerpt really occurs in the source (ignoring case, accents and punctuation). */
export function excerptInSource(excerpt: string, source: string): boolean {
  const e = normalizeAnswer(excerpt);
  if (e.length < 8) return true; // too short to be a meaningful claim
  return normalizeAnswer(source).includes(e);
}

/**
 * Validates question drafts (from any provider). Invalid drafts are dropped rather than saved, and
 * multiple-choice answers are re-matched to option text so a model can't save an unanswerable question.
 */
export function finalizeQuestions(
  drafts: QuestionDraft[],
  fallbackDifficulty: Difficulty = "medium",
  /** When given, questions citing a passage that is not in this text are rejected as ungrounded. */
  sourceText?: string,
): FinalizedQuestions {
  const questions: Question[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  let duplicates = 0;
  let ungrounded = 0;
  for (const d of drafts) {
    if (sourceText && d.sourceExcerpt && !excerptInSource(d.sourceExcerpt, sourceText)) {
      ungrounded++;
      continue;
    }
    const key = normalizeAnswer(d.prompt);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    let correct = d.correct.map((c) => c.trim()).filter(Boolean);
    let options = d.options?.map((o) => o.trim()).filter(Boolean);

    if (d.type === "tf") {
      options = ["True", "False"];
      const first = correct[0] ? normalizeAnswer(correct[0]) : "";
      correct = first === "true" ? ["True"] : first === "false" ? ["False"] : [];
    } else if (d.type === "mcq" && options) {
      const match = correct[0]
        ? options.find((o) => normalizeAnswer(o) === normalizeAnswer(correct[0] as string))
        : undefined;
      correct = match ? [match] : [];
    }

    const parsed = questionSchema.safeParse({
      id: newId(),
      type: d.type,
      prompt: d.prompt,
      options: d.type === "short" || d.type === "fill" ? undefined : options,
      correct,
      explanation: d.explanation ?? "",
      difficulty: d.difficulty ?? fallbackDifficulty,
      tags: [],
      sourceExcerpt: d.sourceExcerpt,
    });
    if (parsed.success) {
      seen.add(key);
      questions.push(parsed.data);
    } else dropped++;
  }
  return { questions, dropped, duplicates, ungrounded };
}

export function buildQuiz(args: {
  title: string;
  documentId?: string;
  noteId?: string;
  origin: Origin;
  difficulty: Difficulty;
  language: string;
  questions: Question[];
  includeExplanations?: boolean;
  feedbackMode?: "immediate" | "end";
  tags?: string[];
}): Quiz {
  const now = nowIso();
  return quizSchema.parse({
    id: newId(),
    title: truncate(args.title, 200),
    documentId: args.documentId,
    noteId: args.noteId,
    origin: args.origin,
    difficulty: args.difficulty,
    language: args.language,
    includeExplanations: args.includeExplanations ?? true,
    feedbackMode: args.feedbackMode ?? "end",
    questions:
      args.includeExplanations === false
        ? args.questions.map((q) => ({ ...q, explanation: "" }))
        : args.questions,
    tags: args.tags ?? [],
    createdAt: now,
    updatedAt: now,
  });
}
