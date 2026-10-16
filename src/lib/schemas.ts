import { z } from "zod";

export const Locale = z.enum(["en", "fr", "ar"]);
export type Locale = z.infer<typeof Locale>;
export const LOCALES = Locale.options;
export const isRtl = (l: Locale) => l === "ar";

export const AgeBand = z.enum(["3-5", "6-8", "9-12", "13-18"]);
export type AgeBand = z.infer<typeof AgeBand>;
export const AGE_RANGE: Record<AgeBand, [number, number]> = {
  "3-5": [3, 5],
  "6-8": [6, 8],
  "9-12": [9, 12],
  "13-18": [13, 18],
};

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const Visual = z.discriminatedUnion("type", [
  z.object({ type: z.literal("emoji"), value: z.string().min(1).max(8) }),
  z.object({ type: z.literal("swatch"), color: hex }),
  z.object({ type: z.literal("shape"), shape: z.enum(["circle", "square", "triangle", "star"]), color: hex }),
]);
export type Visual = z.infer<typeof Visual>;

export const Phase = z.enum(["guided", "independent"]);
export type Phase = z.infer<typeof Phase>;

const Option = z.object({
  id: z.string().min(1).max(32),
  label: z.string().min(1).max(60),
  visual: Visual.optional(),
});

export const ChoiceSpec = z.object({
  kind: z.literal("choice"),
  phase: Phase,
  prompt: z.string().min(1).max(200),
  promptVisual: Visual.optional(),
  options: z.array(Option).min(2).max(4),
  correctOptionIds: z.array(z.string()).min(1),
  hints: z.array(z.string().min(1).max(200)).min(1).max(3),
  explanation: z.string().min(1).max(300),
});

export const CountSpec = z.object({
  kind: z.literal("count"),
  phase: Phase,
  prompt: z.string().min(1).max(200),
  countVisual: z.object({ emoji: z.string().min(1).max(8), count: z.number().int().min(1).max(10) }),
  options: z.array(z.number().int().min(0).max(20)).min(2).max(4),
  correct: z.number().int(),
  hints: z.array(z.string().min(1).max(200)).min(1).max(3),
  explanation: z.string().min(1).max(300),
});

export const ActivitySpec = z
  .discriminatedUnion("kind", [ChoiceSpec, CountSpec])
  .superRefine((spec, ctx) => {
    if (spec.kind === "choice") {
      const ids = new Set(spec.options.map((o) => o.id));
      if (ids.size !== spec.options.length) ctx.addIssue({ code: "custom", message: "duplicate option ids" });
      for (const c of spec.correctOptionIds) {
        if (!ids.has(c)) ctx.addIssue({ code: "custom", message: `correct option ${c} not in options` });
      }
    } else if (!spec.options.includes(spec.correct)) {
      ctx.addIssue({ code: "custom", message: "correct count not in options" });
    }
  });
export type ActivitySpec = z.infer<typeof ActivitySpec>;

export const LessonContent = z.object({
  introduction: z.string().min(1).max(300),
  explanation: z.array(z.object({ text: z.string().min(1).max(300), visual: Visual.optional() })).min(1).max(6),
  recap: z.string().min(1).max(300),
});
export type LessonContent = z.infer<typeof LessonContent>;

/** What the browser may see of an activity. Never includes answers, explanation or hints. */
export type PublicActivity =
  | { id: string; kind: "choice"; phase: Phase; prompt: string; promptVisual?: Visual; options: { id: string; label: string; visual?: Visual }[]; hintCount: number }
  | { id: string; kind: "count"; phase: Phase; prompt: string; countVisual: { emoji: string; count: number }; numberOptions: number[]; hintCount: number };

export const AnswerInput = z.union([
  z.object({ optionIds: z.array(z.string().min(1).max(32)).min(1).max(4) }),
  z.object({ value: z.number().int().min(0).max(20) }),
]);
export type AnswerInput = z.infer<typeof AnswerInput>;

export const TeacherTurn = z.object({
  kind: z.enum(["greeting", "explain", "prompt", "feedback", "hint", "correction", "recap", "goodbye"]),
  utterance: z.string().min(1).max(500),
  language: Locale,
  activityId: z.string().uuid().nullable(),
  provenance: z.object({
    mode: z.enum(["demo", "llm"]),
    lessonVersionId: z.string().uuid(),
  }),
});
export type TeacherTurn = z.infer<typeof TeacherTurn>;

export const TeachingState = z.enum([
  "introduction", "explanation", "guided_practice", "independent_attempt", "correction", "recap", "completion",
]);
export type TeachingState = z.infer<typeof TeachingState>;

export const ChildInput = z.object({
  displayName: z.string().trim().min(1).max(40),
  ageBand: AgeBand,
  uiLocale: Locale,
  lessonLanguage: Locale,
  explanationLanguage: Locale,
  sessionMinutes: z.coerce.number().int().min(3).max(60),
});
export type ChildInput = z.infer<typeof ChildInput>;

export const ConsentInput = z.object({
  learningData: z.literal(true, { error: "learning_data_consent_required" }),
  aiDisclosure: z.literal(true, { error: "ai_disclosure_required" }),
  microphone: z.boolean(),
});
export type ConsentInput = z.infer<typeof ConsentInput>;
