import Dexie, { type EntityTable } from "dexie";
import type {
  Card,
  Collection,
  Deck,
  Note,
  Quiz,
  QuizAttempt,
  ReviewLog,
  StudyDocument,
} from "@/lib/validation/schemas";

export interface SettingsRow {
  key: string;
  value: unknown;
}

export class GhadiDB extends Dexie {
  documents!: EntityTable<StudyDocument, "id">;
  notes!: EntityTable<Note, "id">;
  quizzes!: EntityTable<Quiz, "id">;
  attempts!: EntityTable<QuizAttempt, "id">;
  decks!: EntityTable<Deck, "id">;
  cards!: EntityTable<Card, "id">;
  reviews!: EntityTable<ReviewLog, "id">;
  collections!: EntityTable<Collection, "id">;
  settings!: EntityTable<SettingsRow, "key">;

  constructor(name = "ghadi") {
    super(name);
    this.version(1).stores({
      documents: "id, kind, updatedAt, createdAt, collectionId",
      notes: "id, documentId, updatedAt, createdAt, collectionId",
      quizzes: "id, documentId, noteId, updatedAt, createdAt, collectionId",
      attempts: "id, quizId, completedAt",
      decks: "id, documentId, updatedAt, createdAt, collectionId",
      cards: "id, deckId, schedule.dueAt, updatedAt",
      reviews: "id, cardId, deckId, reviewedAt",
      collections: "id, name",
      settings: "key",
    });
  }
}

let instance: GhadiDB | null = null;

export function isStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/** Lazily creates the database. Throws a clear error if IndexedDB is unavailable (SSR, private modes). */
export function getDb(): GhadiDB {
  if (!isStorageAvailable()) {
    throw new Error(
      "Browser storage (IndexedDB) is not available. Ghadi stores your study data locally, so it cannot run without it. Try a regular (non-private) window or a different browser.",
    );
  }
  if (!instance) instance = new GhadiDB();
  return instance;
}

/** Test helper: replace the singleton (used with fake-indexeddb). */
export function __setDbForTests(db: GhadiDB | null): void {
  instance = db;
}
