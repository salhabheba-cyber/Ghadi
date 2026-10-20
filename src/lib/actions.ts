import { generateWithFallback } from "@/lib/ai/registry";
import type { CallOptions } from "@/lib/ai/types";
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
  const { questions, dropped } = finalizeQuestions(r.value, req.difficulty);
  const notices = [...r.notices];
  if (dropped > 0)
    notices.push(
      `${dropped} generated question${dropped === 1 ? " was" : "s were"} discarded because they were invalid.`,
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
