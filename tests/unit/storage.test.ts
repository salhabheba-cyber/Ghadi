import { beforeEach, describe, expect, it } from "vitest";
import { GhadiDB, __setDbForTests, getDb } from "@/lib/storage/db";
import {
  addCards,
  createCollection,
  deleteAllData,
  deleteCollection,
  deleteDeck,
  deleteDocument,
  duplicateDeck,
  duplicateNote,
  getDueCards,
  loadSettings,
  reviewCard,
  saveAttempt,
  saveDeck,
  saveDocument,
  saveNote,
  saveQuiz,
  saveSettings,
} from "@/lib/storage/repo";
import { BackupError, createBackup, parseBackup, restoreBackup } from "@/lib/storage/backup";
import { toStudyDocument, processPastedText } from "@/lib/document-processing/process";
import { generateNotesHeuristic } from "@/lib/study/heuristic";
import { buildNote, buildQuiz, finalizeQuestions } from "@/lib/study/build";
import { newId, nowIso } from "@/lib/utils";
import { BACKUP_SCHEMA_VERSION, type Deck } from "@/lib/validation/schemas";

let counter = 0;
beforeEach(() => {
  __setDbForTests(new GhadiDB(`ghadi-test-${++counter}`));
});

const TEXT =
  "Photosynthesis is the process by which plants convert light into chemical energy. ".repeat(6);

async function seed() {
  const doc = await saveDocument(toStudyDocument(processPastedText("Plants", TEXT)));
  const note = await saveNote(
    buildNote({
      title: "Plants notes",
      documentId: doc.id,
      origin: "heuristic",
      draft: generateNotesHeuristic("Plants", TEXT),
    }),
  );
  const { questions } = finalizeQuestions([
    {
      type: "tf",
      prompt: "True or false: plants make sugar.",
      options: ["True", "False"],
      correct: ["True"],
      explanation: "",
      difficulty: "easy",
    },
  ]);
  const quiz = await saveQuiz(
    buildQuiz({
      title: "Plants quiz",
      documentId: doc.id,
      origin: "heuristic",
      difficulty: "easy",
      language: "same as source",
      questions,
    }),
  );
  const now = nowIso();
  const deck: Deck = {
    id: newId(),
    title: "Plants deck",
    description: "",
    documentId: doc.id,
    origin: "manual",
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveDeck(deck);
  const cards = await addCards(deck.id, [
    { front: "Chlorophyll", back: "Green pigment", origin: "manual" },
    { front: "Stomata", back: "Leaf pores", origin: "manual" },
  ]);
  return { doc, note, quiz, deck, cards };
}

describe("storage repository", () => {
  it("persists documents, notes, quizzes, decks and cards", async () => {
    const { doc, note, quiz, deck } = await seed();
    const db = getDb();
    expect((await db.documents.get(doc.id))?.wordCount).toBeGreaterThan(10);
    expect((await db.notes.get(note.id))?.origin).toBe("heuristic");
    expect((await db.quizzes.get(quiz.id))?.questions).toHaveLength(1);
    expect(await db.cards.where("deckId").equals(deck.id).count()).toBe(2);
  });

  it("refuses to save invalid data instead of corrupting the database", async () => {
    const { doc } = await seed();
    await expect(saveDocument({ ...doc, title: "   " })).rejects.toThrow(/Invalid document/);
    await expect(
      saveSettings({
        hostedConsent: false,
        uiLanguage: "en",
        dailyGoalCards: 0,
      }),
    ).rejects.toThrow(/Invalid settings/);
  });

  it("unlinks (but keeps) study material when its document is deleted", async () => {
    const { doc, note, quiz, deck } = await seed();
    await deleteDocument(doc.id);
    const db = getDb();
    expect(await db.documents.get(doc.id)).toBeUndefined();
    expect((await db.notes.get(note.id))?.documentId).toBeUndefined();
    expect((await db.quizzes.get(quiz.id))?.documentId).toBeUndefined();
    expect((await db.decks.get(deck.id))?.documentId).toBeUndefined();
  });

  it("duplicates notes and decks with fresh ids and reset review state", async () => {
    const { note, deck, cards } = await seed();
    const noteCopy = await duplicateNote(note.id);
    expect(noteCopy.id).not.toBe(note.id);
    expect(noteCopy.title).toMatch(/\(copy\)$/);
    await reviewCard((cards[0] as { id: string }).id, "known");
    const deckCopy = await duplicateDeck(deck.id);
    const copied = await getDb().cards.where("deckId").equals(deckCopy.id).toArray();
    expect(copied).toHaveLength(2);
    expect(
      copied.every((c) => c.schedule.repetitions === 0 && !cards.some((o) => o.id === c.id)),
    ).toBe(true);
  });

  it("records a review: updates the schedule and writes a review log atomically", async () => {
    const { cards } = await seed();
    const id = (cards[0] as { id: string }).id;
    const now = new Date(2026, 5, 1, 9, 0);
    const updated = await reviewCard(id, "known", now);
    expect(updated.schedule.intervalDays).toBe(1);
    const logs = await getDb().reviews.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      cardId: id,
      rating: "known",
      previousIntervalDays: 0,
      newIntervalDays: 1,
    });
    await expect(reviewCard("missing", "known")).rejects.toThrow(/no longer exists/);
  });

  it("lists only cards that are due", async () => {
    const { cards, deck } = await seed();
    // Cards are created "now"; ask about a later day so they are due.
    const now = new Date(2030, 5, 1, 9, 0);
    expect(await getDueCards(now, deck.id)).toHaveLength(2);
    await reviewCard((cards[0] as { id: string }).id, "known", now);
    const due = await getDueCards(now, deck.id);
    expect(due).toHaveLength(1);
    expect(due[0]?.id).toBe((cards[1] as { id: string }).id);
    expect(await getDueCards(new Date(2030, 5, 2, 0, 0, 1), deck.id)).toHaveLength(2);
  });

  it("removes a deck's cards and review history with it", async () => {
    const { cards, deck } = await seed();
    await reviewCard((cards[0] as { id: string }).id, "known");
    await deleteDeck(deck.id);
    expect(await getDb().cards.count()).toBe(0);
    expect(await getDb().reviews.count()).toBe(0);
  });

  it("collections: assigning and deleting a collection unlinks items", async () => {
    const { doc } = await seed();
    const col = await createCollection("Biology");
    await saveDocument({ ...doc, collectionId: col.id });
    await deleteCollection(col.id);
    expect((await getDb().documents.get(doc.id))?.collectionId).toBeUndefined();
  });

  it("settings fall back to safe defaults and never contain secrets", async () => {
    const defaults = await loadSettings();
    expect(defaults).toMatchObject({ hostedConsent: false });
    await saveSettings({ ...defaults, hostedConsent: true });
    expect((await loadSettings()).hostedConsent).toBe(true);
    expect(Object.keys(defaults).join()).not.toMatch(/key|token|secret/i);
  });

  it("delete-all wipes every table", async () => {
    await seed();
    await deleteAllData();
    const db = getDb();
    const counts = await Promise.all([
      db.documents.count(),
      db.notes.count(),
      db.quizzes.count(),
      db.decks.count(),
      db.cards.count(),
      db.settings.count(),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("saves quiz attempts", async () => {
    const { quiz } = await seed();
    const t = nowIso();
    await saveAttempt({
      id: newId(),
      quizId: quiz.id,
      quizTitle: quiz.title,
      feedbackMode: "end",
      answers: [],
      score: 0,
      total: 1,
      startedAt: t,
      completedAt: t,
    });
    expect(await getDb().attempts.count()).toBe(1);
  });
});

describe("backup and restore", () => {
  it("round-trips all data through JSON", async () => {
    const { doc, cards } = await seed();
    await reviewCard((cards[0] as { id: string }).id, "difficult");
    const text = JSON.stringify(await createBackup());
    const parsed = parseBackup(text);
    expect(parsed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    await deleteAllData();
    const summary = await restoreBackup(parsed, "replace");
    expect(summary).toMatchObject({
      documents: 1,
      notes: 1,
      quizzes: 1,
      decks: 1,
      cards: 2,
      reviews: 1,
    });
    expect((await getDb().documents.get(doc.id))?.title).toBe("Plants");
  });

  it("merge mode keeps existing items and upserts by id", async () => {
    const { doc } = await seed();
    const backup = parseBackup(JSON.stringify(await createBackup()));
    await saveDocument(toStudyDocument(processPastedText("Other", TEXT)));
    await restoreBackup(backup, "merge");
    expect(await getDb().documents.count()).toBe(2);
    expect((await getDb().documents.get(doc.id))?.title).toBe("Plants");
  });

  it("replace mode removes items that are not in the backup", async () => {
    await seed();
    const backup = parseBackup(JSON.stringify(await createBackup()));
    await saveDocument(toStudyDocument(processPastedText("Extra", TEXT)));
    await restoreBackup(backup, "replace");
    expect(await getDb().documents.count()).toBe(1);
  });

  it("rejects files that are not valid Ghadi backups, with readable messages", () => {
    expect(() => parseBackup("not json")).toThrow(/not valid JSON/);
    expect(() => parseBackup("[]")).toThrow(/not a Ghadi backup/);
    expect(() => parseBackup(JSON.stringify({ app: "other" }))).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ app: "ghadi" }))).toThrow(/schema version/);
    expect(() =>
      parseBackup(
        JSON.stringify({ app: "ghadi", schemaVersion: 999, exportedAt: nowIso(), data: {} }),
      ),
    ).toThrow(/newer version/);
    expect(() =>
      parseBackup(
        JSON.stringify({
          app: "ghadi",
          schemaVersion: 1,
          exportedAt: nowIso(),
          data: { documents: "nope" },
        }),
      ),
    ).toThrow(/damaged or incompatible/);
  });

  it("does not touch existing data when a backup is invalid", async () => {
    await seed();
    expect(() =>
      parseBackup(
        JSON.stringify({ app: "ghadi", schemaVersion: 1, exportedAt: nowIso(), data: {} }),
      ),
    ).toThrow();
    expect(await getDb().documents.count()).toBe(1);
  });
});
