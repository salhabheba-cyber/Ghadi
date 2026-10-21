// @vitest-environment node
import { describe, expect, it } from "vitest";
import { finishBook, makeSchool, makeStudent, testDb } from "./helpers";
import {
  addBookmark,
  answerCheck,
  heartbeat,
  minActiveSeconds,
  openBook,
  removeBookmark,
  savePosition,
  startCheck,
  streakFrom,
  studentProgress,
  teacherAwardCompletion,
  voidCompletion,
  restoreCompletion,
} from "@/lib/server/services/reading";
import { searchBooks, getBook, bookFacets, suggestBooks } from "@/lib/server/services/books";
import { buildClozeQuestions, buildStoryQuestions } from "@/lib/books/cloze";
import { readFile } from "node:fs/promises";

const SHORT = "asp-0001-en";
const LONG = "se-lewis-carroll-alices-adventures-in-wonderland";

describe("book search and filters", () => {
  it("filters by language, age, genre and text", async () => {
    const db = await testDb();
    const ar = await searchBooks(db, { language: "ar", limit: 60 });
    expect(ar.total).toBeGreaterThan(10);
    expect(ar.books.every((b) => b.language === "ar")).toBe(true);
    const toddlers = await searchBooks(db, { age: 4, language: "en", limit: 60 });
    expect(toddlers.books.every((b) => b.age_min <= 4 && b.age_max >= 4)).toBe(true);
    const teen = await searchBooks(db, { age: 16, language: "en", limit: 60 });
    expect(teen.books.some((b) => b.slug === "se-jane-austen-pride-and-prejudice")).toBe(true);
    expect(teen.books.some((b) => b.slug === SHORT)).toBe(false);
    const q = await searchBooks(db, { q: "alice" });
    expect(q.books.map((b) => b.slug)).toContain(LONG);
    const g = await searchBooks(db, { genre: "mystery", language: "en" });
    expect(g.total).toBeGreaterThan(0);
    const none = await searchBooks(db, { q: "%_\\' OR 1=1 --" });
    expect(none.total).toBe(0);
    const facets = await bookFacets(db);
    expect(facets.languages.map((l) => l.value).sort()).toEqual(["ar", "en", "fr"]);
  });

  it("every book has the required licensing metadata and a readable file", async () => {
    const db = await testDb();
    const all = await searchBooks(db, { limit: 60 });
    expect(all.total).toBeGreaterThan(200);
    const sample = [
      ...(await searchBooks(db, { language: "ar", limit: 3 })).books,
      ...(await searchBooks(db, { language: "fr", genre: "classic", limit: 3 })).books,
      (await getBook(db, LONG))!,
    ];
    for (const b of sample) {
      expect(b.license).toBeTruthy();
      expect(b.license_url).toMatch(/^https:\/\//);
      expect(b.attribution.length).toBeGreaterThan(20);
      expect(b.source_url).toMatch(/^https:\/\//);
      const json = JSON.parse(await readFile(`public${b.content_path}`, "utf8"));
      expect(json.lang).toBe(b.language);
      expect(json.dir).toBe(b.language === "ar" ? "rtl" : "ltr");
      expect(json.chapters.length).toBeGreaterThan(0);
    }
  });

  it("suggests unread books for the child's age and language", async () => {
    const db = await testDb();
    const { school } = await makeSchool(db);
    const s = await makeStudent(db, { joinCode: school.join_code, age: 5, language: "fr" });
    const sug = await suggestBooks(db, s.id, "fr", 5);
    expect(sug.length).toBeGreaterThan(0);
    expect(sug.every((b) => b.language === "fr" && b.age_min <= 6 && b.age_max >= 4)).toBe(true);
  });
});

describe("reading progress and time", () => {
  it("saves and restores the position and bookmarks per student", async () => {
    const db = await testDb();
    const { school } = await makeSchool(db);
    const a = await makeStudent(db, { joinCode: school.join_code });
    const b = await makeStudent(db, { joinCode: school.join_code });
    const o = await openBook(db, a.id, LONG);
    await savePosition(db, a.id, o.book.id, {
      locator: { chapter: 3, offset: 120 },
      percent: 23.5,
    });
    await addBookmark(db, a.id, o.book.id, { locator: { chapter: 2 }, label: "Great part" });
    const again = await openBook(db, a.id, LONG);
    expect(again.progress.locator).toEqual({ chapter: 3, offset: 120 });
    expect(again.progress.percent).toBeCloseTo(23.5);
    expect(again.bookmarks).toHaveLength(1);
    const other = await openBook(db, b.id, LONG);
    expect(other.progress.percent).toBe(0);
    expect(other.bookmarks).toHaveLength(0);
    await removeBookmark(db, b.id, again.bookmarks[0]!.id as string); // not theirs: no effect
    expect((await openBook(db, a.id, LONG)).bookmarks).toHaveLength(1);
    await removeBookmark(db, a.id, again.bookmarks[0]!.id as string);
    expect((await openBook(db, a.id, LONG)).bookmarks).toHaveLength(0);
    await expect(
      savePosition(db, b.id, "00000000-0000-0000-0000-000000000000", { locator: {}, percent: 5 }),
    ).rejects.toMatchObject({ code: "not-opened" });
    await expect(
      savePosition(db, a.id, o.book.id, { locator: {}, percent: "x" }),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("furthest progress never goes backwards", async () => {
    const db = await testDb();
    const { school } = await makeSchool(db);
    const a = await makeStudent(db, { joinCode: school.join_code });
    const o = await openBook(db, a.id, LONG);
    await savePosition(db, a.id, o.book.id, { locator: {}, percent: 80 });
    const back = await savePosition(db, a.id, o.book.id, { locator: {}, percent: 10 });
    expect(back!.percent).toBe(10);
    expect(back!.furthestPercent).toBe(80);
  });

  it("credits reading time only for plausible heartbeats and cannot be inflated by spamming", async () => {
    const db = await testDb();
    const { school } = await makeSchool(db);
    const a = await makeStudent(db, { joinCode: school.join_code });
    const o = await openBook(db, a.id, LONG);
    // spam: all beats arrive within 5 s of each other
    for (let i = 0; i < 20; i++) expect((await heartbeat(db, a.id, o.sessionId)).credited).toBe(0);
    // a normal 15 s beat is credited
    await db.query(
      "UPDATE reading_sessions SET last_beat_at = now() - interval '15 seconds' WHERE id = $1",
      [o.sessionId],
    );
    expect((await heartbeat(db, a.id, o.sessionId)).credited).toBeGreaterThanOrEqual(14);
    // a beat after the tab sat idle for 10 minutes credits nothing
    await db.query(
      "UPDATE reading_sessions SET last_beat_at = now() - interval '10 minutes' WHERE id = $1",
      [o.sessionId],
    );
    expect((await heartbeat(db, a.id, o.sessionId)).credited).toBe(0);
    // someone else's session id credits nothing and changes nothing
    const b = await makeStudent(db, { joinCode: school.join_code });
    await db.query(
      "UPDATE reading_sessions SET last_beat_at = now() - interval '15 seconds' WHERE id = $1",
      [o.sessionId],
    );
    expect((await heartbeat(db, b.id, o.sessionId)).credited).toBe(0);
    const p = (await openBook(db, a.id, LONG)).progress;
    expect(p.activeSeconds).toBeLessThan(40);
  });

  it("computes reading streaks from consecutive days", () => {
    const today = new Date("2026-10-21T10:00:00Z");
    expect(streakFrom(["2026-10-21", "2026-10-20", "2026-10-19", "2026-10-17"], today)).toBe(3);
    expect(streakFrom(["2026-10-20", "2026-10-19"], today)).toBe(2); // not read yet today: streak still alive
    expect(streakFrom(["2026-10-18"], today)).toBe(0);
    expect(streakFrom([], today)).toBe(0);
  });
});

describe("completion: counted once, verified, and correctable", () => {
  it("needs the end of the book, enough real reading time, and a passed check", async () => {
    const db = await testDb();
    const { school } = await makeSchool(db);
    const a = await makeStudent(db, { joinCode: school.join_code });
    const o = await openBook(db, a.id, LONG);
    await expect(startCheck(db, a.id, LONG)).rejects.toMatchObject({ code: "not-ready" });
    await savePosition(db, a.id, o.book.id, { locator: {}, percent: 100 }); // skipped to the end with no reading time
    await expect(startCheck(db, a.id, LONG)).rejects.toMatchObject({ code: "not-ready" });
    expect(minActiveSeconds(o.book.word_count)).toBeGreaterThan(600);
    await db.query(
      "UPDATE reading_progress SET active_seconds = $3 WHERE student_id=$1 AND book_id=$2",
      [a.id, o.book.id, minActiveSeconds(o.book.word_count)],
    );
    const check = await startCheck(db, a.id, LONG, { rand: () => 0.3 });
    expect(check.questions).toHaveLength(3);
    expect(JSON.stringify(check)).not.toMatch(/"answer"/); // the answer key never leaves the server
    // wrong answers do not complete
    const wrong = await answerCheck(db, a.id, check.checkId, [9, 9, 9]);
    expect(wrong.passed).toBe(false);
    expect(wrong.completed).toBe(false);
    expect(wrong).not.toHaveProperty("correct");
    const prog = await studentProgress(db, a.id);
    expect(prog.completed).toHaveLength(0);
  });

  it("creates exactly one completion record, however many times the book is reopened or re-checked", async () => {
    const db = await testDb();
    const { school } = await makeSchool(db);
    const a = await makeStudent(db, { joinCode: school.join_code });
    expect((await finishBook(db, a.id, SHORT)).completed).toBe(true);
    await openBook(db, a.id, SHORT);
    await openBook(db, a.id, SHORT);
    await expect(startCheck(db, a.id, SHORT)).rejects.toMatchObject({ code: "already-completed" });
    const n = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM completions WHERE student_id = $1",
      [a.id],
    );
    expect(n.rows[0]!.n).toBe(1);
    const prog = await studentProgress(db, a.id);
    expect(prog.completed).toHaveLength(1);
    expect(prog.achievements.map((x) => x.code)).toContain("first-book");
  });

  it("limits attempts and starts a cooldown after repeated failures", async () => {
    const db = await testDb();
    const { school } = await makeSchool(db);
    const a = await makeStudent(db, { joinCode: school.join_code });
    const o = await openBook(db, a.id, SHORT);
    await savePosition(db, a.id, o.book.id, { locator: {}, percent: 100 });
    await db.query("UPDATE reading_progress SET active_seconds = 999 WHERE student_id=$1", [a.id]);
    for (let round = 0; round < 4; round++) {
      const c = await startCheck(db, a.id, SHORT);
      for (let i = 0; i < 3; i++) await answerCheck(db, a.id, c.checkId, [99, 99, 99]);
      await expect(answerCheck(db, a.id, c.checkId, [0, 0, 0])).rejects.toMatchObject({
        code: "check-over",
      });
    }
    await expect(startCheck(db, a.id, SHORT)).rejects.toMatchObject({ code: "check-cooldown" });
  });

  it("lets staff investigate, void and restore a record, and award one for a shared reading", async () => {
    const db = await testDb();
    const { school, admin, classId } = await makeSchool(db);
    const a = await makeStudent(db, { joinCode: school.join_code, classId });
    await finishBook(db, a.id, SHORT);
    await voidCompletion(db, admin, a.id, SHORT, "Entered by mistake");
    expect((await studentProgress(db, a.id)).completed).toHaveLength(0);
    await expect(voidCompletion(db, admin, a.id, SHORT, "again")).rejects.toMatchObject({
      status: 404,
    });
    await restoreCompletion(db, admin, a.id, SHORT);
    expect((await studentProgress(db, a.id)).completed).toHaveLength(1);
    await expect(
      teacherAwardCompletion(db, admin, a.id, SHORT, "read together"),
    ).rejects.toMatchObject({ code: "already-completed" });
    await teacherAwardCompletion(db, admin, a.id, "asp-0004-en", "Read together in class");
    const rows = await db.query<{ method: string }>(
      "SELECT method FROM completions WHERE student_id=$1 ORDER BY method",
      [a.id],
    );
    expect(rows.rows.map((r) => r.method)).toEqual(["teacher", "verified"]);
    const log = await db.query<{ action: string }>(
      "SELECT action FROM audit_events WHERE school_id=$1 AND action LIKE 'completion.%'",
      [school.id],
    );
    expect(log.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        "completion.voided",
        "completion.restored",
        "completion.teacher_awarded",
      ]),
    );
  });

  it("only other schools' staff are refused", async () => {
    const db = await testDb();
    const a = await makeSchool(db);
    const b = await makeSchool(db);
    const s = await makeStudent(db, { joinCode: a.school.join_code, classId: a.classId });
    await finishBook(db, s.id, SHORT);
    await expect(
      voidCompletion(db, b.admin, s.id, SHORT, "not mine to void"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("comprehension questions from the book's own text", () => {
  it("builds missing-word questions for long books, with exactly one correct option", async () => {
    const content = JSON.parse(await readFile(`public/books/${LONG}.json`, "utf8"));
    const qs = buildClozeQuestions(content, 3, () => 0.37);
    expect(qs.length).toBe(3);
    for (const q of qs) {
      expect(q.prompt).toContain("_____");
      expect(new Set(q.options).size).toBe(4);
      const filled = q.prompt.replace("_____", q.options[q.answer]!);
      expect(
        content.chapters
          .flatMap((c: { blocks: { x?: string }[] }) => c.blocks)
          .some((b: { x?: string }) =>
            b.x?.toLowerCase().includes(filled.toLowerCase().slice(0, 30)),
          ),
      ).toBe(true);
    }
  });

  it("builds 'which line is from this story' questions for picture books, in Arabic too", async () => {
    const ar = JSON.parse(await readFile("public/books/asp-0001-ar.json", "utf8"));
    const others = [
      JSON.parse(await readFile("public/books/asp-0004-ar.json", "utf8")),
      JSON.parse(await readFile("public/books/asp-0006-ar.json", "utf8")),
    ];
    const qs = buildStoryQuestions(ar, others, 3, () => 0.5);
    expect(qs.length).toBeGreaterThanOrEqual(2);
    const own = new Set(
      ar.chapters.flatMap((c: { blocks: { x?: string }[] }) => c.blocks.map((b) => b.x)),
    );
    for (const q of qs) {
      expect(own.has(q.options[q.answer])).toBe(true);
      expect(q.options.filter((o) => own.has(o))).toHaveLength(1);
    }
  });
});
