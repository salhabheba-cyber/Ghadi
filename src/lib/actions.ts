import { createProvider, generateWithFallback } from "@/lib/ai/registry";
import { ProviderError, type CallOptions } from "@/lib/ai/types";
import { saveDeck, saveNote, saveQuiz, addCards, loadSettings } from "@/lib/storage/repo";
import { buildNote, buildQuiz, finalizeQuestions } from "@/lib/study/build";
import { newId, nowIso } from "@/lib/utils";
import type {
  Difficulty,
  Deck,
  Note,
  Quiz,
  QuestionType,
  StudyDocument,
} from "@/lib/validation/schemas";

/**
 * UI-facing orchestration: read settings, run the chosen provider (falling back to offline with an
 * honest notice), validate the result and persist it.
 */

export interface GenerationOutcome<T> {
  item: T;
  notices: string[];
}

export async function generateNoteFromDocument(
  doc: StudyDocument,
  call: CallOptions = {},
): Promise<GenerationOutcome<Note>> {
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
