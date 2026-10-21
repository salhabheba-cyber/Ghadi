import { createProvider, generateWithFallback } from "@/lib/ai/registry";
import { ProviderError, type CallOptions } from "@/lib/ai/types";
import { LlmProvider } from "@/lib/ai/llm-provider";
import { offlineProvider } from "@/lib/ai/registry";
import { analyzeTextQuality, isUsableForGeneration } from "@/lib/study/quality";
import {
  groundBlocks,
  mergeGlossary,
  mergeSections,
  outlineFromNote,
  recapsForOverview,
  splitIntoChunks,
} from "@/lib/study/guide";
import {
  saveDeck,
  saveNote,
  saveQuiz,
  saveGuide,
  getGuideForDocument,
  addCards,
  loadSettings,
} from "@/lib/storage/repo";
import { buildNote, buildQuiz, finalizeQuestions } from "@/lib/study/build";
import { newId, nowIso } from "@/lib/utils";
import type {
  Difficulty,
  Deck,
  Note,
  Quiz,
  QuestionType,
  StudyDocument,
  StudyGuide,
} from "@/lib/validation/schemas";

/**
 * UI-facing orchestration: read settings, run the chosen provider (falling back to offline with an
 * honest notice), validate the result and persist it.
 */

function assertReadable(text: string) {
  const q = analyzeTextQuality(text);
  if (!isUsableForGeneration(q)) throw new UnreadableTextError(q.message);
}

export interface GenerationOutcome<T> {
  item: T;
  notices: string[];
}

export async function generateNoteFromDocument(
  doc: StudyDocument,
  call: CallOptions = {},
): Promise<GenerationOutcome<Note>> {
  assertReadable(doc.text);
  const settings = await loadSettings();
  const r = await generateWithFallback(
    settings,
    (p, c) =>
      p.generateStudyNotes({ title: doc.title, text: doc.text }, { language: "same as source" }, c),
    call,
  );
  const draft = {
    ...r.value,
    notices: [...r.notices, ...r.value.notices.filter((n) => !r.notices.includes(n))],
  };
  const note = await saveNote(
    buildNote({ title: `${doc.title} — study notes`, documentId: doc.id, origin: r.origin, draft }),
  );
  return { item: note, notices: draft.notices };
}

export interface QuizRequest {
  count: number;
  difficulty: Difficulty;
  types: QuestionType[];
  language?: string;
  /** Keep explanations (default true). When false they are stripped before saving. */
  includeExplanations?: boolean;
  /** When the learner sees right/wrong: after each question or at the end (default "end"). */
  feedbackMode?: "immediate" | "end";
}

export async function generateQuizFromDocument(
  doc: StudyDocument,
  req: QuizRequest,
  call: CallOptions = {},
  noteId?: string,
): Promise<GenerationOutcome<Quiz>> {
  assertReadable(doc.text);
  const settings = await loadSettings();
  const language = req.language ?? "same as source";
  const r = await generateWithFallback(
    settings,
    (p, c) =>
      p.generateQuiz(
        { title: doc.title, text: doc.text },
        { count: req.count, difficulty: req.difficulty, types: req.types, language },
        c,
      ),
    call,
  );
  const { questions, dropped, duplicates, ungrounded } = finalizeQuestions(
    r.value,
    req.difficulty,
    doc.text,
  );
  const notices = [...r.notices];
  if (dropped > 0)
    notices.push(
      `${dropped} generated question${dropped === 1 ? " was" : "s were"} discarded because they were invalid.`,
    );
  if (duplicates > 0)
    notices.push(`${duplicates} repeated question${duplicates === 1 ? " was" : "s were"} removed.`);
  if (ungrounded > 0)
    notices.push(
      `${ungrounded} question${ungrounded === 1 ? " was" : "s were"} removed because the passage it cited is not in your document.`,
    );
  if (questions.length === 0) {
    throw new Error(
      "Not enough usable content to build quiz questions. Try a longer document or different question types.",
    );
  }
  if (questions.length < req.count)
    notices.push(
      `Only ${questions.length} of ${req.count} requested questions could be created from this text.`,
    );
  const quiz = await saveQuiz(
    buildQuiz({
      title: `${doc.title} — quiz`,
      documentId: doc.id,
      noteId,
      origin: r.origin,
      difficulty: req.difficulty,
      language,
      questions,
      includeExplanations: req.includeExplanations,
      feedbackMode: req.feedbackMode,
    }),
  );
  return { item: quiz, notices };
}

/**
 * A practice quiz on a topic, with no source document. This is NOT grounded in the user's material,
 * so it needs a real AI model (offline heuristics cannot invent questions) and, for hosted AI, consent.
 * It never falls back to offline generation: it fails with an actionable message instead.
 */
export async function generateQuizFromTopic(
  topic: string,
  req: QuizRequest,
  call: CallOptions = {},
): Promise<GenerationOutcome<Quiz>> {
  const settings = await loadSettings();
  if (settings.provider === "offline") {
    throw new ProviderError(
      "not-configured",
      "Topic quizzes need an AI model. Choose Ollama or hosted AI in Settings, or import a document instead.",
    );
  }
  const provider = createProvider(settings); // throws consent-required for hosted without consent
  const language = req.language ?? "same as source";
  const r = await provider.generateQuiz(
    { title: topic, text: "", topic },
    { count: req.count, difficulty: req.difficulty, types: req.types, language },
    call,
  );
  const { questions, dropped, duplicates } = finalizeQuestions(r.value, req.difficulty);
  if (questions.length === 0) {
    throw new Error("The AI did not return any usable questions. Try again or change the topic.");
  }
  const notices = [...r.notices];
  if (dropped + duplicates > 0)
    notices.push(`${dropped + duplicates} invalid or repeated question(s) were removed.`);
  const quiz = await saveQuiz(
    buildQuiz({
      title: `Practice: ${topic}`.slice(0, 200),
      origin: r.origin,
      difficulty: req.difficulty,
      language,
      questions,
      includeExplanations: req.includeExplanations,
      feedbackMode: req.feedbackMode,
      tags: ["topic-based"],
    }),
  );
  return { item: quiz, notices };
}

export async function generateDeckFromDocument(
  doc: StudyDocument,
  count: number,
  call: CallOptions = {},
): Promise<GenerationOutcome<Deck>> {
  assertReadable(doc.text);
  const settings = await loadSettings();
  const r = await generateWithFallback(
    settings,
    (p, c) =>
      p.generateFlashcards(
        { title: doc.title, text: doc.text },
        { count, language: "same as source" },
        c,
      ),
    call,
  );
  if (r.value.length === 0) {
    throw new Error("Not enough usable content to build flashcards. Try a longer document.");
  }
  const now = nowIso();
  const deck = await saveDeck({
    id: newId(),
    title: `${doc.title} — flashcards`,
    description: "",
    documentId: doc.id,
    origin: r.origin,
    tags: [],
    createdAt: now,
    updatedAt: now,
  });
  await addCards(
    deck.id,
    r.value.map((c) => ({
      front: c.front,
      back: c.back,
      explanation: c.explanation,
      sourceRef: c.sourceRef,
      origin: r.origin,
    })),
  );
  return { item: deck, notices: r.notices };
}

/* ------------------------------- Study guide ------------------------------- */

export interface GuideProgress {
  done: number;
  total: number;
  label: string;
}

/** Thrown when the extracted text is too garbled to teach from. The UI shows the review/edit screen. */
export class UnreadableTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableTextError";
  }
}

/**
 * Builds and saves the study guide for a document ("teach me this material").
 * - Refuses garbled text (OCR noise) instead of explaining nonsense.
 * - AI providers read the document chunk by chunk, so long documents are covered completely; the
 *   chunks are then merged, checked against the source, and wrapped with an overview and summary.
 * - The offline provider can only produce a rule-based outline, and the guide says so.
 * Regenerating replaces the document's previous guide.
 */
export async function generateStudyGuide(
  doc: StudyDocument,
  opts: { language?: string; onProgress?: (p: GuideProgress) => void } = {},
  call: CallOptions = {},
): Promise<GenerationOutcome<StudyGuide>> {
  const quality = analyzeTextQuality(doc.text);
  if (!isUsableForGeneration(quality)) throw new UnreadableTextError(quality.message);
  const settings = await loadSettings();
  const language = opts.language ?? "same as source";
  const now = nowIso();
  const previous = await getGuideForDocument(doc.id);
  // The guide shares its document's id: one guide per document, and the library can link to /study/<id>.
  const base = { id: previous?.id ?? doc.id, createdAt: previous?.createdAt ?? now };

  if (settings.provider === "offline") {
    opts.onProgress?.({ done: 0, total: 1, label: "Outlining" });
    const note = await offlineProvider.generateStudyNotes(
      { title: doc.title, text: doc.text },
      { language },
    );
    const guide = await saveGuide({
      ...outlineFromNote(doc.title, doc.id, note.value, doc.text.length),
      ...base,
      userNotes: previous?.userNotes ?? "",
      tags: previous?.tags ?? [],
      collectionId: previous?.collectionId,
    });
    opts.onProgress?.({ done: 1, total: 1, label: "Done" });
    return { item: guide, notices: guide.notices };
  }

  const provider = createProvider(settings);
  if (!(provider instanceof LlmProvider)) {
    throw new ProviderError("not-configured", "This generator cannot write study guides.");
  }
  const chunks = splitIntoChunks(doc.text);
  const total = chunks.length + 1;
  const sections = [];
  const glossary = [];
  const notices: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (call.signal?.aborted) throw new ProviderError("cancelled", "Generation was cancelled.");
    opts.onProgress?.({ done: i, total, label: `Part ${i + 1} of ${chunks.length}` });
    let part;
    try {
      part = await provider.generateGuideSections(
        { title: doc.title, text: chunks[i]!, part: i + 1, parts: chunks.length, language },
        call,
      );
    } catch (e) {
      if (e instanceof ProviderError && e.code !== "cancelled" && chunks.length > 1) {
        throw new ProviderError(
          e.code,
          `Part ${i + 1} of ${chunks.length} failed, so no guide was saved. ${e.message}`,
        );
      }
      throw e;
    }
    for (const sec of part.sections)
      sections.push({ ...sec, blocks: groundBlocks(sec.blocks, doc.text) });
    glossary.push(...part.glossary);
    notices.push(...part.notices);
  }
  const merged = mergeSections(sections.filter((s) => s.blocks.length > 0));
  if (merged.length === 0) {
    throw new ProviderError(
      "invalid-output",
      "The model did not return any usable sections. Try again.",
    );
  }
  opts.onProgress?.({ done: chunks.length, total, label: "Writing the overview" });
  const wrap = await provider.generateGuideOverview(
    { title: doc.title, recaps: recapsForOverview(merged), language },
    call,
  );
  const unverified = merged
    .flatMap((s) => s.blocks)
    .filter((b) => b.type === "definition" && b.verified === false).length;
  const guide = await saveGuide({
    ...base,
    documentId: doc.id,
    title: doc.title,
    origin: provider.origin,
    language,
    overview: wrap.overview,
    objectives: wrap.objectives,
    sections: merged,
    finalSummary: wrap.finalSummary,
    glossary: mergeGlossary(glossary),
    notices: [
      `Written by ${provider.label} from your document. AI can make mistakes: compare with the original, especially numbers and definitions.`,
      ...(unverified > 0
        ? [
            `${unverified} definition(s) could not be matched to a quote in your document and are marked.`,
          ]
        : []),
      ...Array.from(new Set(notices)).slice(0, 5),
    ],
    userNotes: previous?.userNotes ?? "",
    tags: previous?.tags ?? [],
    collectionId: previous?.collectionId,
    sourceChars: doc.text.length,
    createdAt: base.createdAt,
    updatedAt: now,
  });
  opts.onProgress?.({ done: total, total, label: "Done" });
  return { item: guide, notices: guide.notices };
}

/** Explains a selected passage again in simpler words. Needs an AI generator; offline cannot do this. */
export async function simplifyPassage(
  passage: string,
  context: string | undefined,
  language = "same as source",
  call: CallOptions = {},
): Promise<string> {
  const settings = await loadSettings();
  if (settings.provider === "offline") {
    throw new ProviderError(
      "not-configured",
      "A simpler explanation needs an AI model. Choose OpenAI or Ollama in Settings.",
    );
  }
  const provider = createProvider(settings);
  if (!(provider instanceof LlmProvider)) {
    throw new ProviderError("not-configured", "This generator cannot simplify text.");
  }
  return provider.simplify(
    { concept: passage.slice(0, 1000), context: context?.slice(0, 1500), language },
    call,
  );
}
