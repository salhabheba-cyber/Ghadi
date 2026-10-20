import { getDb } from "./db";
import {
  cardSchema,
  collectionSchema,
  deckSchema,
  documentSchema,
  formatZodError,
  noteSchema,
  quizSchema,
  settingsSchema,
  attemptSchema,
  reviewLogSchema,
  type Card,
  type Collection,
  type Deck,
  type Note,
  type Quiz,
  type QuizAttempt,
  type Rating,
  type ReviewLog,
  type Settings,
  type StudyDocument,
} from "@/lib/validation/schemas";
import { newId, nowIso } from "@/lib/utils";
import { applyRating, initialSchedule } from "@/lib/study/srs";

type ParseResult<T> =
  { success: true; data: T } | { success: false; error: import("zod").ZodError };

/** Parses with a Zod schema and throws a readable error so bad data never reaches IndexedDB. */
function assertValid<T>(label: string, result: ParseResult<T>): T {
  if (!result.success) throw new Error(`Invalid ${label}: ${formatZodError(result.error)}`);
  return result.data;
}

/* ------------------------------- Documents ------------------------------ */

export async function saveDocument(doc: StudyDocument): Promise<StudyDocument> {
  const valid = assertValid("document", documentSchema.safeParse({ ...doc, updatedAt: nowIso() }));
  await getDb().documents.put(valid);
  return valid;
}

export async function getDocument(id: string): Promise<StudyDocument | undefined> {
  return getDb().documents.get(id);
}

/** Deletes a document. Notes, quizzes and decks made from it are kept but unlinked. */
export async function deleteDocument(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", [db.documents, db.notes, db.quizzes, db.decks], async () => {
    await db.documents.delete(id);
    await db.notes
      .where("documentId")
      .equals(id)
      .modify((n) => {
        delete n.documentId;
      });
    await db.quizzes
      .where("documentId")
      .equals(id)
      .modify((q) => {
        delete q.documentId;
      });
    await db.decks
      .where("documentId")
      .equals(id)
      .modify((d) => {
        delete d.documentId;
      });
  });
}

/* --------------------------------- Notes -------------------------------- */

export async function saveNote(note: Note): Promise<Note> {
  const valid = assertValid("note", noteSchema.safeParse({ ...note, updatedAt: nowIso() }));
  await getDb().notes.put(valid);
  return valid;
}

export async function getNote(id: string): Promise<Note | undefined> {
  return getDb().notes.get(id);
}

export async function deleteNote(id: string): Promise<void> {
  await getDb().notes.delete(id);
}

export async function duplicateNote(id: string): Promise<Note> {
  const note = await getNote(id);
  if (!note) throw new Error("That note no longer exists.");
  const now = nowIso();
  const copy: Note = {
    ...structuredClone(note),
    id: newId(),
    title: `${note.title} (copy)`.slice(0, 200),
    createdAt: now,
    updatedAt: now,
  };
  await getDb().notes.put(assertValid("note", noteSchema.safeParse(copy)));
  return copy;
}

/* -------------------------------- Quizzes ------------------------------- */

export async function saveQuiz(quiz: Quiz): Promise<Quiz> {
  const valid = assertValid("quiz", quizSchema.safeParse({ ...quiz, updatedAt: nowIso() }));
  await getDb().quizzes.put(valid);
  return valid;
}

export async function getQuiz(id: string): Promise<Quiz | undefined> {
  return getDb().quizzes.get(id);
}

export async function deleteQuiz(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", [db.quizzes, db.attempts], async () => {
    await db.quizzes.delete(id);
    await db.attempts.where("quizId").equals(id).delete();
  });
}

export async function duplicateQuiz(id: string): Promise<Quiz> {
  const quiz = await getQuiz(id);
  if (!quiz) throw new Error("That quiz no longer exists.");
  const now = nowIso();
  const copy: Quiz = {
    ...structuredClone(quiz),
    id: newId(),
    title: `${quiz.title} (copy)`.slice(0, 200),
    questions: quiz.questions.map((q) => ({ ...q, id: newId() })),
    createdAt: now,
    updatedAt: now,
  };
  await getDb().quizzes.put(assertValid("quiz", quizSchema.safeParse(copy)));
  return copy;
}

export async function saveAttempt(attempt: QuizAttempt): Promise<QuizAttempt> {
  const valid = assertValid("quiz attempt", attemptSchema.safeParse(attempt));
  await getDb().attempts.put(valid);
  return valid;
}

export async function getAttempt(id: string): Promise<QuizAttempt | undefined> {
  return getDb().attempts.get(id);
}

/* ------------------------------ Decks & cards --------------------------- */

export async function saveDeck(deck: Deck): Promise<Deck> {
  const valid = assertValid("deck", deckSchema.safeParse({ ...deck, updatedAt: nowIso() }));
  await getDb().decks.put(valid);
  return valid;
}

export async function getDeck(id: string): Promise<Deck | undefined> {
  return getDb().decks.get(id);
}

export async function deleteDeck(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", [db.decks, db.cards, db.reviews], async () => {
    await db.decks.delete(id);
    await db.cards.where("deckId").equals(id).delete();
    await db.reviews.where("deckId").equals(id).delete();
  });
}

export async function duplicateDeck(id: string): Promise<Deck> {
  const db = getDb();
  const deck = await getDeck(id);
  if (!deck) throw new Error("That deck no longer exists.");
  const now = nowIso();
  const newDeck: Deck = {
    ...structuredClone(deck),
    id: newId(),
    title: `${deck.title} (copy)`.slice(0, 200),
    createdAt: now,
    updatedAt: now,
  };
  const cards = await db.cards.where("deckId").equals(id).toArray();
  const copies: Card[] = cards.map((c) => ({
    ...structuredClone(c),
    id: newId(),
    deckId: newDeck.id,
    schedule: initialSchedule(new Date()),
    createdAt: now,
    updatedAt: now,
  }));
  await db.transaction("rw", [db.decks, db.cards], async () => {
    await db.decks.put(assertValid("deck", deckSchema.safeParse(newDeck)));
    await db.cards.bulkPut(copies.map((c) => assertValid("card", cardSchema.safeParse(c))));
  });
  return newDeck;
}

export interface CardDraftInput {
  front: string;
  back: string;
  explanation?: string;
  sourceRef?: string;
  tags?: string[];
  origin: Card["origin"];
}

export function buildCard(deckId: string, draft: CardDraftInput, now = new Date()): Card {
  const iso = nowIso(now);
  return {
    id: newId(),
    deckId,
    front: draft.front,
    back: draft.back,
    explanation: draft.explanation,
    sourceRef: draft.sourceRef,
    origin: draft.origin,
    tags: draft.tags ?? [],
    schedule: initialSchedule(now),
    createdAt: iso,
    updatedAt: iso,
  };
}

export async function addCards(deckId: string, drafts: CardDraftInput[]): Promise<Card[]> {
  const now = new Date();
  const cards = drafts.map((d) =>
    assertValid("card", cardSchema.safeParse(buildCard(deckId, d, now))),
  );
  await getDb().cards.bulkPut(cards);
  return cards;
}

export async function saveCard(card: Card): Promise<Card> {
  const valid = assertValid("card", cardSchema.safeParse({ ...card, updatedAt: nowIso() }));
  await getDb().cards.put(valid);
  return valid;
}

export async function deleteCard(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", [db.cards, db.reviews], async () => {
    await db.cards.delete(id);
    await db.reviews.where("cardId").equals(id).delete();
  });
}

/**
 * Records one review: updates the card's schedule and appends a review log, atomically.
 * Returns the updated card.
 */
export async function reviewCard(cardId: string, rating: Rating, now = new Date()): Promise<Card> {
  const db = getDb();
  return db.transaction("rw", [db.cards, db.reviews], async () => {
    const card = await db.cards.get(cardId);
    if (!card) throw new Error("That card no longer exists.");
    const schedule = applyRating(card.schedule, rating, now);
    const updated = assertValid(
      "card",
      cardSchema.safeParse({ ...card, schedule, updatedAt: nowIso(now) }),
    );
    const log: ReviewLog = assertValid(
      "review",
      reviewLogSchema.safeParse({
        id: newId(),
        cardId,
        deckId: card.deckId,
        rating,
        reviewedAt: nowIso(now),
        previousIntervalDays: card.schedule.intervalDays,
        newIntervalDays: schedule.intervalDays,
      }),
    );
    await db.cards.put(updated);
    await db.reviews.put(log);
    return updated;
  });
}

/** Cards due now (dueAt <= now). Optionally scoped to one deck. */
export async function getDueCards(now = new Date(), deckId?: string): Promise<Card[]> {
  const db = getDb();
  const iso = nowIso(now);
  const all = deckId
    ? await db.cards.where("deckId").equals(deckId).toArray()
    : await db.cards.toArray();
  return all
    .filter((c) => c.schedule.dueAt <= iso)
    .sort((a, b) => a.schedule.dueAt.localeCompare(b.schedule.dueAt));
}

/* ------------------------------- Collections ---------------------------- */

export async function createCollection(name: string): Promise<Collection> {
  const col = assertValid(
    "collection",
    collectionSchema.safeParse({ id: newId(), name, createdAt: nowIso() }),
  );
  await getDb().collections.put(col);
  return col;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const db = getDb();
  const existing = await db.collections.get(id);
  if (!existing) throw new Error("That collection no longer exists.");
  await db.collections.put(
    assertValid("collection", collectionSchema.safeParse({ ...existing, name })),
  );
}

export async function deleteCollection(id: string): Promise<void> {
  const db = getDb();
  await db.transaction(
    "rw",
    [db.collections, db.documents, db.notes, db.quizzes, db.decks],
    async () => {
      await db.collections.delete(id);
      await db.documents
        .where("collectionId")
        .equals(id)
        .modify((x) => {
          delete x.collectionId;
        });
      await db.notes
        .where("collectionId")
        .equals(id)
        .modify((x) => {
          delete x.collectionId;
        });
      await db.quizzes
        .where("collectionId")
        .equals(id)
        .modify((x) => {
          delete x.collectionId;
        });
      await db.decks
        .where("collectionId")
        .equals(id)
        .modify((x) => {
          delete x.collectionId;
        });
    },
  );
}

/* -------------------------------- Settings ------------------------------ */

export const SETTINGS_KEY = "app-settings";

export async function loadSettings(): Promise<Settings> {
  const row = await getDb().settings.get(SETTINGS_KEY);
  const parsed = settingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const valid = assertValid("settings", settingsSchema.safeParse(settings));
  await getDb().settings.put({ key: SETTINGS_KEY, value: valid });
  return valid;
}

/* --------------------------------- Counts ------------------------------- */

export async function deleteAllData(): Promise<void> {
  const db = getDb();
  await db.transaction(
    "rw",
    [
      db.documents,
      db.notes,
      db.quizzes,
      db.attempts,
      db.decks,
      db.cards,
      db.reviews,
      db.collections,
      db.settings,
    ],
    async () => {
      await Promise.all([
        db.documents.clear(),
        db.notes.clear(),
        db.quizzes.clear(),
        db.attempts.clear(),
        db.decks.clear(),
        db.cards.clear(),
        db.reviews.clear(),
        db.collections.clear(),
        db.settings.clear(),
      ]);
    },
  );
}
