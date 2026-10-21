import { z } from "zod";

// Zod's JIT compiler probes `new Function`, which a strict CSP (no unsafe-eval) reports as a violation
// even though the probe is caught. Our schemas are small, so run Zod in its interpreted mode.
z.config({ jitless: true });

/** Version of the on-disk backup format. Bump when the backup shape changes incompatibly. */
export const BACKUP_SCHEMA_VERSION = 1;

export const MAX_DOCUMENT_CHARS = 2_000_000;

const id = z.string().min(1).max(64);
const timestamp = z.iso.datetime({ offset: true });
const tag = z.string().trim().min(1).max(40);
const tags = z.array(tag).max(30).default([]);

/** Where a piece of study material came from. Never claim a model was used when it was not. */
export const originSchema = z.enum(["manual", "heuristic", "local-ai", "hosted-ai"]);
export type Origin = z.infer<typeof originSchema>;

export const provenanceSchema = z.enum(["extracted", "generated", "user"]);
export type Provenance = z.infer<typeof provenanceSchema>;

/* ------------------------------ Documents ------------------------------ */

export const documentKindSchema = z.enum([
  "pdf",
  "docx",
  "pptx",
  "txt",
  "md",
  "image",
  "paste",
  "url",
  "youtube",
]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const documentSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  kind: documentKindSchema,
  sourceName: z.string().max(300).optional(),
  sourceUrl: z.string().max(2000).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  text: z.string().max(MAX_DOCUMENT_CHARS),
  wordCount: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative().optional(),
  extractionMethod: z.enum([
    "text",
    "pdf-text",
    "docx",
    "pptx",
    "ocr",
    "html",
    "transcript",
    "paste",
  ]),
  status: z.enum(["ready", "needs-ocr", "empty"]),
  warnings: z.array(z.string().max(500)).max(20).default([]),
  tags,
  collectionId: id.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type StudyDocument = z.infer<typeof documentSchema>;

/* ------------------------------ Study guides ------------------------------ */

const gText = (max: number) => z.string().trim().min(1).max(max);

/** Where a piece of guide content comes from, so source material and added explanation stay distinct. */
export const guideSourceSchema = z.enum(["document", "added"]);

const calloutTone = z.enum(["important", "warning", "tip"]);

export const guideBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: gText(4000) }),
  z.object({
    type: z.literal("keyPoints"),
    title: gText(120),
    points: z.array(gText(500)).min(1).max(12),
  }),
  z.object({
    type: z.literal("definition"),
    term: gText(120),
    definition: gText(1200),
    sourceExcerpt: z.string().max(600).optional(),
    verified: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("steps"),
    title: gText(160),
    steps: z
      .array(z.object({ title: gText(160), detail: z.string().max(800).default("") }))
      .min(2)
      .max(15),
  }),
  z.object({
    type: z.literal("table"),
    title: gText(160),
    columns: z.array(gText(80)).min(2).max(6),
    rows: z
      .array(z.array(z.string().max(400)).min(1).max(6))
      .min(1)
      .max(20),
  }),
  z.object({
    type: z.literal("example"),
    title: gText(160),
    text: gText(2000),
    source: guideSourceSchema.default("added"),
    sourceExcerpt: z.string().max(600).optional(),
  }),
  z.object({
    type: z.literal("formula"),
    name: gText(120),
    expression: gText(300),
    explanation: z.string().max(1000).default(""),
    workedExample: z.string().max(1500).optional(),
  }),
  z.object({
    type: z.literal("timeline"),
    title: gText(160),
    events: z
      .array(z.object({ label: gText(80), detail: z.string().max(400).default("") }))
      .min(2)
      .max(15),
  }),
  z.object({
    type: z.literal("flow"),
    title: gText(160),
    nodes: z
      .array(z.object({ id: gText(24), label: gText(80) }))
      .min(2)
      .max(12),
    edges: z
      .array(z.object({ from: gText(24), to: gText(24), label: z.string().max(60).optional() }))
      .min(1)
      .max(20),
  }),
  z.object({ type: z.literal("callout"), tone: calloutTone, text: gText(1000) }),
  z.object({ type: z.literal("detail"), title: gText(160), text: gText(4000) }),
]);
export type GuideBlock = z.infer<typeof guideBlockSchema>;

export const guideSectionSchema = z.object({
  heading: gText(160),
  /** One-sentence "what this section is about". */
  intro: z.string().max(600).default(""),
  blocks: z.array(guideBlockSchema).min(1).max(40),
  recap: z.string().max(1200).default(""),
});
export type GuideSection = z.infer<typeof guideSectionSchema>;

export const glossaryEntrySchema = z.object({ term: gText(120), meaning: gText(800) });

/** What a model returns for one chunk of a document. */
export const aiGuideSectionsSchema = z.object({
  sections: z.array(guideSectionSchema).min(1).max(8),
  glossary: z.array(glossaryEntrySchema).max(30).default([]),
  notices: z.array(z.string().max(300)).max(5).default([]),
});

/** What a model returns for the whole-document wrap-up (written from the section recaps only). */
export const aiGuideOverviewSchema = z.object({
  overview: gText(2500),
  objectives: z.array(gText(300)).min(1).max(10),
  finalSummary: gText(3000),
});

export const studyGuideSchema = z.object({
  id,
  documentId: id,
  title: z.string().trim().min(1).max(200),
  origin: originSchema,
  language: z.string().max(40).default("same as source"),
  overview: z.string().max(2500),
  objectives: z.array(z.string().max(300)).max(10),
  sections: z.array(guideSectionSchema).min(1).max(120),
  finalSummary: z.string().max(3000),
  glossary: z.array(glossaryEntrySchema).max(200),
  notices: z.array(z.string().max(500)).max(20).default([]),
  /** The learner's own notes on this guide. */
  userNotes: z.string().max(20_000).default(""),
  tags,
  collectionId: id.optional(),
  sourceChars: z.number().int().nonnegative(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type StudyGuide = z.infer<typeof studyGuideSchema>;

/* -------------------------------- Notes -------------------------------- */

export const noteSectionSchema = z.object({
  id,
  heading: z.string().max(200),
  body: z.string().max(20_000),
  provenance: provenanceSchema,
  sourceExcerpt: z.string().max(1000).optional(),
});
export type NoteSection = z.infer<typeof noteSectionSchema>;

export const definitionSchema = z.object({
  id,
  term: z.string().trim().min(1).max(120),
  definition: z.string().trim().min(1).max(1000),
  provenance: provenanceSchema,
  sourceExcerpt: z.string().max(1000).optional(),
});
export type Definition = z.infer<typeof definitionSchema>;

export const factSchema = z.object({
  id,
  kind: z.enum(["date", "formula"]),
  value: z.string().trim().min(1).max(500),
  context: z.string().max(500).optional(),
  provenance: provenanceSchema,
});
export type Fact = z.infer<typeof factSchema>;

export const exampleSchema = z.object({
  id,
  text: z.string().trim().min(1).max(1000),
  provenance: provenanceSchema,
});

export const checklistItemSchema = z.object({
  id,
  text: z.string().trim().min(1).max(300),
  done: z.boolean().default(false),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const noteSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  documentId: id.optional(),
  origin: originSchema,
  overview: z.string().max(5000).default(""),
  summary: z.string().max(10_000).default(""),
  keyConcepts: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  definitions: z.array(definitionSchema).max(200).default([]),
  sections: z.array(noteSectionSchema).max(200).default([]),
  facts: z.array(factSchema).max(300).default([]),
  examples: z.array(exampleSchema).max(100).default([]),
  relationships: z.array(z.string().max(300)).max(100).default([]),
  checklist: z.array(checklistItemSchema).max(200).default([]),
  /** Honest limitations of the generation, e.g. "source text was very short". */
  notices: z.array(z.string().max(500)).max(20).default([]),
  tags,
  collectionId: id.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Note = z.infer<typeof noteSchema>;

/* -------------------------------- Quizzes ------------------------------- */

export const questionTypeSchema = z.enum(["mcq", "tf", "short", "fill"]);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof difficultySchema>;

export const questionSchema = z
  .object({
    id,
    type: questionTypeSchema,
    prompt: z.string().trim().min(1).max(2000),
    /** Choices for mcq (2-6) and tf ("True"/"False"). Absent for short/fill. */
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(6).optional(),
    /** Accepted answers. For mcq/tf exactly one entry matching an option. */
    correct: z.array(z.string().trim().min(1).max(1000)).min(1).max(10),
    explanation: z.string().max(2000).default(""),
    difficulty: difficultySchema.default("medium"),
    tags,
    sourceExcerpt: z.string().max(1000).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === "mcq" || q.type === "tf") {
      if (!q.options) {
        ctx.addIssue({
          code: "custom",
          message: "Choice questions need options",
          path: ["options"],
        });
        return;
      }
      const answer = q.correct[0];
      if (q.correct.length !== 1 || answer === undefined || !q.options.includes(answer)) {
        ctx.addIssue({
          code: "custom",
          message: "Correct answer must match exactly one option",
          path: ["correct"],
        });
      }
      if (new Set(q.options).size !== q.options.length) {
        ctx.addIssue({ code: "custom", message: "Options must be unique", path: ["options"] });
      }
    }
    if (q.type === "tf" && q.options) {
      const sorted = [...q.options].sort().join("|");
      if (sorted !== "False|True") {
        ctx.addIssue({
          code: "custom",
          message: 'True/false options must be "True" and "False"',
          path: ["options"],
        });
      }
    }
  });
export type Question = z.infer<typeof questionSchema>;

export const quizSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  documentId: id.optional(),
  noteId: id.optional(),
  origin: originSchema,
  difficulty: difficultySchema.default("medium"),
  language: z.string().max(40).default("same as source"),
  /** Whether explanations were requested at generation time (they are stripped when false). */
  includeExplanations: z.boolean().default(true),
  /** When the learner sees whether an answer was right: after each question or at the end. */
  feedbackMode: z.enum(["immediate", "end"]).default("end"),
  questions: z.array(questionSchema).min(1).max(200),
  tags,
  collectionId: id.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Quiz = z.infer<typeof quizSchema>;

export const attemptAnswerSchema = z.object({
  questionId: id,
  response: z.string().max(2000),
  correct: z.boolean(),
  skipped: z.boolean().default(false),
});
export type AttemptAnswer = z.infer<typeof attemptAnswerSchema>;

export const attemptSchema = z.object({
  id,
  quizId: id,
  quizTitle: z.string().max(200),
  feedbackMode: z.enum(["immediate", "end"]),
  answers: z.array(attemptAnswerSchema).max(200),
  score: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  startedAt: timestamp,
  completedAt: timestamp,
});
export type QuizAttempt = z.infer<typeof attemptSchema>;

/* ------------------------------- Flashcards ----------------------------- */

export const scheduleSchema = z.object({
  /** SM-2 ease factor, never below 1.3. */
  ease: z.number().min(1.3).max(5),
  /** Current interval in whole days. 0 means "learning / due today". */
  intervalDays: z.number().int().nonnegative(),
  repetitions: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  /** When the card is next due, as an ISO timestamp (local midnight of the due day). */
  dueAt: timestamp,
  lastReviewedAt: timestamp.optional(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const deckSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000).default(""),
  documentId: id.optional(),
  origin: originSchema,
  tags,
  collectionId: id.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Deck = z.infer<typeof deckSchema>;

export const cardSchema = z.object({
  id,
  deckId: id,
  front: z.string().trim().min(1).max(2000),
  back: z.string().trim().min(1).max(4000),
  explanation: z.string().max(2000).optional(),
  sourceRef: z.string().max(1000).optional(),
  origin: originSchema,
  tags,
  schedule: scheduleSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Card = z.infer<typeof cardSchema>;

export const ratingSchema = z.enum(["known", "difficult", "forgotten"]);
export type Rating = z.infer<typeof ratingSchema>;

export const reviewLogSchema = z.object({
  id,
  cardId: id,
  deckId: id,
  rating: ratingSchema,
  reviewedAt: timestamp,
  previousIntervalDays: z.number().int().nonnegative(),
  newIntervalDays: z.number().int().nonnegative(),
});
export type ReviewLog = z.infer<typeof reviewLogSchema>;

/* ----------------------------- Collections etc. ------------------------- */

export const collectionSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  createdAt: timestamp,
});
export type Collection = z.infer<typeof collectionSchema>;

/** Non-secret settings only. API keys are never stored in the browser. */
export const settingsSchema = z.object({
  provider: z.enum(["offline", "ollama", "hosted"]).default("offline"),
  ollamaEndpoint: z.string().max(300).default("http://localhost:11434"),
  ollamaModel: z.string().max(120).default("llama3.2"),
  /** User has explicitly agreed to send document content to the hosted provider. */
  hostedConsent: z.boolean().default(false),
  dailyGoalCards: z.number().int().min(1).max(500).default(20),
  /** Interface language. English, French or Modern Standard Arabic (right-to-left). */
  uiLanguage: z.enum(["en", "fr", "ar"]).default("en"),
});
export type Settings = z.infer<typeof settingsSchema>;

/* --------------------------------- Backup ------------------------------- */

export const backupSchema = z.object({
  app: z.literal("ghadi"),
  schemaVersion: z.number().int().positive(),
  exportedAt: timestamp,
  data: z.object({
    documents: z.array(documentSchema),
    guides: z.array(studyGuideSchema).default([]),
    notes: z.array(noteSchema),
    quizzes: z.array(quizSchema),
    attempts: z.array(attemptSchema),
    decks: z.array(deckSchema),
    cards: z.array(cardSchema),
    reviews: z.array(reviewLogSchema),
    collections: z.array(collectionSchema),
    settings: settingsSchema.optional(),
  }),
});
export type Backup = z.infer<typeof backupSchema>;

/* ------------------------- AI generation payloads ----------------------- */

/** Shape an AI provider must return for notes. Validated before anything is saved. */
export const aiNoteSchema = z.object({
  overview: z.string().max(5000).default(""),
  summary: z.string().max(10_000),
  keyConcepts: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  definitions: z
    .array(
      z.object({
        term: z.string().trim().min(1).max(120),
        definition: z.string().trim().min(1).max(1000),
      }),
    )
    .max(50)
    .default([]),
  sections: z
    .array(z.object({ heading: z.string().max(200), body: z.string().max(10_000) }))
    .max(30)
    .default([]),
  checklist: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  notices: z.array(z.string().max(500)).max(10).default([]),
});
export type AiNote = z.infer<typeof aiNoteSchema>;

export const aiQuestionSchema = z.object({
  type: questionTypeSchema,
  prompt: z.string().trim().min(1).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6).optional(),
  correct: z.union([z.string(), z.array(z.string())]),
  explanation: z.string().max(2000).default(""),
  difficulty: difficultySchema.default("medium"),
  sourceExcerpt: z.string().max(1000).optional(),
});
export const aiQuizSchema = z.object({ questions: z.array(aiQuestionSchema).min(1).max(100) });

export const aiCardsSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().trim().min(1).max(2000),
        back: z.string().trim().min(1).max(4000),
        explanation: z.string().max(2000).optional(),
      }),
    )
    .min(1)
    .max(200),
});
export const aiTextSchema = z.object({ text: z.string().trim().min(1).max(10_000) });

export function formatZodError(error: z.ZodError, max = 5): string {
  return error.issues
    .slice(0, max)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
