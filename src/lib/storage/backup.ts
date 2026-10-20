import { getDb } from "./db";
import { SETTINGS_KEY } from "./repo";
import {
  BACKUP_SCHEMA_VERSION,
  backupSchema,
  formatZodError,
  type Backup,
} from "@/lib/validation/schemas";
import { nowIso } from "@/lib/utils";

/** Reject absurdly large backup files before parsing them. */
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

export async function createBackup(): Promise<Backup> {
  const db = getDb();
  const [documents, notes, quizzes, attempts, decks, cards, reviews, collections, settingsRow] =
    await Promise.all([
      db.documents.toArray(),
      db.notes.toArray(),
      db.quizzes.toArray(),
      db.attempts.toArray(),
      db.decks.toArray(),
      db.cards.toArray(),
      db.reviews.toArray(),
      db.collections.toArray(),
      db.settings.get(SETTINGS_KEY),
    ]);
  const backup = {
    app: "ghadi" as const,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: nowIso(),
    data: {
      documents,
      notes,
      quizzes,
      attempts,
      decks,
      cards,
      reviews,
      collections,
      ...(settingsRow ? { settings: settingsRow.value as Backup["data"]["settings"] } : {}),
    },
  };
  // Validate our own output so we never write a backup we could not restore.
  return backupSchema.parse(backup);
}

/**
 * Parses and validates backup text without touching the database.
 * Throws BackupError with a user-readable message for any problem.
 */
export function parseBackup(text: string): Backup {
  if (text.length > MAX_BACKUP_BYTES) {
    throw new BackupError("This file is too large to be a Ghadi backup.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("This file is not valid JSON, so it cannot be a Ghadi backup.");
  }
  if (typeof raw !== "object" || raw === null || (raw as { app?: unknown }).app !== "ghadi") {
    throw new BackupError("This file is not a Ghadi backup (missing app marker).");
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new BackupError("This backup has no valid schema version.");
  }
  if (version > BACKUP_SCHEMA_VERSION) {
    throw new BackupError(
      `This backup was made by a newer version of Ghadi (schema ${version}). This version supports up to schema ${BACKUP_SCHEMA_VERSION}. Update Ghadi and try again.`,
    );
  }
  const result = backupSchema.safeParse(raw);
  if (!result.success) {
    throw new BackupError(
      `This backup is damaged or incompatible: ${formatZodError(result.error)}`,
    );
  }
  return result.data;
}

export type RestoreMode = "replace" | "merge";

export interface RestoreSummary {
  documents: number;
  notes: number;
  quizzes: number;
  attempts: number;
  decks: number;
  cards: number;
  reviews: number;
  collections: number;
}

/**
 * Restores a validated backup in a single transaction. If anything fails the transaction rolls back
 * and existing data is left untouched.
 * - replace: wipes current data first.
 * - merge: upserts by id (backup wins on id conflicts).
 */
export async function restoreBackup(backup: Backup, mode: RestoreMode): Promise<RestoreSummary> {
  const db = getDb();
  const d = backup.data;
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
      if (mode === "replace") {
        await Promise.all([
          db.documents.clear(),
          db.notes.clear(),
          db.quizzes.clear(),
          db.attempts.clear(),
          db.decks.clear(),
          db.cards.clear(),
          db.reviews.clear(),
          db.collections.clear(),
        ]);
      }
      await db.documents.bulkPut(d.documents);
      await db.notes.bulkPut(d.notes);
      await db.quizzes.bulkPut(d.quizzes);
      await db.attempts.bulkPut(d.attempts);
      await db.decks.bulkPut(d.decks);
      await db.cards.bulkPut(d.cards);
      await db.reviews.bulkPut(d.reviews);
      await db.collections.bulkPut(d.collections);
      if (d.settings && mode === "replace") {
        await db.settings.put({ key: SETTINGS_KEY, value: d.settings });
      }
    },
  );
  return {
    documents: d.documents.length,
    notes: d.notes.length,
    quizzes: d.quizzes.length,
    attempts: d.attempts.length,
    decks: d.decks.length,
    cards: d.cards.length,
    reviews: d.reviews.length,
    collections: d.collections.length,
  };
}

export function backupFileName(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `ghadi-backup-${y}-${m}-${d}.json`;
}
