// @vitest-environment node
import { describe, expect, it } from "vitest";
import { finishBook, makeSchool, makeStudent, testDb } from "./helpers";
import {
  getLeaderboard,
  NEUTRAL_REWARD,
  academicYearStart,
} from "@/lib/server/services/leaderboard";
import {
  archiveChallenge,
  createClass,
  saveChallenge,
  updateSchoolSettings,
} from "@/lib/server/services/schools";
import {
  formatDisplayName,
  updateStudentSelf,
  setStudentStatus,
} from "@/lib/server/services/students";
import { voidCompletion } from "@/lib/server/services/reading";

async function shortBooks(db: Awaited<ReturnType<typeof testDb>>): Promise<string[]> {
  const r = await db.query<{ slug: string }>(
    "SELECT slug FROM books WHERE slug LIKE 'asp-%-en' ORDER BY slug LIMIT 12",
  );
  return r.rows.map((x) => x.slug);
}

async function readers(
  db: Awaited<ReturnType<typeof testDb>>,
  joinCode: string,
  classId: string,
  counts: number[],
) {
  const out = [];
  const BOOKS = await shortBooks(db);
  for (const [i, n] of counts.entries()) {
    const s = await makeStudent(db, { joinCode, classId, name: `Reader${i} Surname${i}` });
    for (let b = 0; b < n; b++) await finishBook(db, s.id, BOOKS[b]!);
    out.push(s);
  }
  return out;
}

describe("Top 5 leaderboard", () => {
  it("ranks by verified completions with documented ties (1, 2, 2, 4)", async () => {
    const db = await testDb();
    const { school, classId } = await makeSchool(db);
    await readers(db, school.join_code, classId, [3, 2, 2, 1, 0]);
    const lb = await getLeaderboard(db, { schoolId: school.id, period: "all" });
    expect(lb.entries.map((e) => [e.rank, e.books])).toEqual([
      [1, 3],
      [2, 2],
      [2, 2],
      [4, 1],
    ]);
    expect(lb.participants).toBe(4); // a student with no finished books is not ranked
    expect(lb.tieRule).toMatch(/same rank/);
  });

  it("shows at most the top five ranks and the viewer's own position outside them", async () => {
    const db = await testDb();
    const { school, classId } = await makeSchool(db);
    const r = await readers(db, school.join_code, classId, [7, 6, 5, 4, 3, 2, 1]);
    const lb = await getLeaderboard(db, {
      schoolId: school.id,
      period: "all",
      viewerStudentId: r[6]!.id,
    });
    expect(lb.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(lb.entries.some((e) => e.isYou)).toBe(false);
    expect(lb.you).toEqual({ rank: 7, books: 1 });
  });

  it("uses configured prizes by rank and a neutral badge when none is configured", async () => {
    const db = await testDb();
    const { school, admin, classId } = await makeSchool(db);
    await readers(db, school.join_code, classId, [2, 1]);
    const none = await getLeaderboard(db, { schoolId: school.id, period: "all" });
    expect(none.entries.every((e) => e.reward === NEUTRAL_REWARD && !e.rewardIsPrize)).toBe(true);
    const { id } = await saveChallenge(db, admin, school.id, {
      name: "Autumn Readathon",
      startsOn: "2026-01-01",
      endsOn: "2099-12-31",
      prizes: { 1: "Book voucher from the library", 2: "  ", 9: "ignored" },
    });
    const lb = await getLeaderboard(db, { schoolId: school.id, period: `challenge:${id}` });
    expect(lb.period.label).toBe("Autumn Readathon");
    expect(lb.entries[0]).toMatchObject({
      rank: 1,
      reward: "Book voucher from the library",
      rewardIsPrize: true,
    });
    expect(lb.entries[1]).toMatchObject({ rank: 2, reward: NEUTRAL_REWARD, rewardIsPrize: false });
    const def = await getLeaderboard(db, { schoolId: school.id }); // the running challenge is the default period
    expect(def.period.key).toBe(`challenge:${id}`);
    await archiveChallenge(db, admin, school.id, id);
    expect((await getLeaderboard(db, { schoolId: school.id })).period.key).toBe("month");
  });

  it("only counts completions inside the chosen period", async () => {
    const db = await testDb();
    const { school, classId } = await makeSchool(db);
    const [r] = await readers(db, school.join_code, classId, [2]);
    await db.query(
      "UPDATE completions SET completed_at = now() - interval '400 days' WHERE student_id = $1 AND book_id = (SELECT id FROM books WHERE slug = (SELECT slug FROM books WHERE slug LIKE 'asp-%-en' ORDER BY slug LIMIT 1))",
      [r!.id],
    );
    expect(
      (await getLeaderboard(db, { schoolId: school.id, period: "all" })).entries[0]!.books,
    ).toBe(2);
    expect(
      (await getLeaderboard(db, { schoolId: school.id, period: "month" })).entries[0]!.books,
    ).toBe(1);
    expect(
      (await getLeaderboard(db, { schoolId: school.id, period: "year" })).entries[0]!.books,
    ).toBe(1);
    expect(academicYearStart(new Date("2026-03-01T00:00:00Z")).toISOString()).toBe(
      "2025-09-01T00:00:00.000Z",
    );
    expect(academicYearStart(new Date("2026-10-01T00:00:00Z")).toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
  });

  it("is scoped to the school, and to a class for the class view", async () => {
    const db = await testDb();
    const a = await makeSchool(db);
    const b = await makeSchool(db);
    const other = (await createClass(db, a.admin, a.school.id, { name: "3B" })) as { id: string };
    await readers(db, a.school.join_code, a.classId, [3]);
    await readers(db, a.school.join_code, other.id, [1]);
    await readers(db, b.school.join_code, b.classId, [9]);
    const school = await getLeaderboard(db, { schoolId: a.school.id, period: "all" });
    expect(school.entries.map((e) => e.books)).toEqual([3, 1]);
    const cls = await getLeaderboard(db, {
      schoolId: a.school.id,
      classId: other.id,
      period: "all",
    });
    expect(cls.entries.map((e) => e.books)).toEqual([1]);
    await expect(
      getLeaderboard(db, { schoolId: a.school.id, classId: b.classId, period: "all" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getLeaderboard(db, {
        schoolId: a.school.id,
        period: `challenge:${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}`,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("protects privacy: school name format, private readers, no IDs, no disabled students", async () => {
    const db = await testDb();
    const { school, admin, classId } = await makeSchool(db);
    const [a, b, c] = await readers(db, school.join_code, classId, [3, 2, 1]);
    await updateStudentSelf(db, b!.id, { showOnLeaderboard: false });
    await updateStudentSelf(db, a!.id, { nickname: "Sparrow" });
    let lb = await getLeaderboard(db, { schoolId: school.id, period: "all" });
    expect(lb.entries.map((e) => e.name)).toEqual(["Reader0 S.", "A private reader", "Reader2 S."]);
    expect(lb.entries[1]!.className).toBeNull();
    await updateSchoolSettings(db, admin, school.id, { nameFormat: "nickname" });
    lb = await getLeaderboard(db, { schoolId: school.id, period: "all" });
    expect(lb.entries.map((e) => e.name)).toEqual(["Sparrow", "A private reader", "Reader2"]);
    await updateSchoolSettings(db, admin, school.id, { nameFormat: "initials" });
    lb = await getLeaderboard(db, { schoolId: school.id, period: "all" });
    expect(lb.entries[0]!.name).toBe("R.S.");
    const json = JSON.stringify(lb);
    for (const s of [a!, b!, c!]) {
      expect(json).not.toContain(s.studentId);
      expect(json).not.toContain(s.id);
      expect(json).not.toContain(s.studentId.slice(-4) + '"');
    }
    expect(json).not.toMatch(/Surname/);
    await setStudentStatus(db, admin, c!.id, "disabled");
    expect((await getLeaderboard(db, { schoolId: school.id, period: "all" })).participants).toBe(2);
  });

  it("drops voided completions from the ranking", async () => {
    const db = await testDb();
    const { school, admin, classId } = await makeSchool(db);
    const [a] = await readers(db, school.join_code, classId, [2]);
    await voidCompletion(
      db,
      admin,
      a!.id,
      (await shortBooks(db))[0]!,
      "Duplicate of another account",
    );
    expect(
      (await getLeaderboard(db, { schoolId: school.id, period: "all" })).entries[0]!.books,
    ).toBe(1);
  });

  it("keeps long tie lists short", async () => {
    const db = await testDb();
    const { school, classId } = await makeSchool(db);
    await readers(db, school.join_code, classId, Array(12).fill(1));
    const lb = await getLeaderboard(db, { schoolId: school.id, period: "all" });
    expect(lb.entries).toHaveLength(10);
    expect(lb.moreTied).toBe(2);
    expect(new Set(lb.entries.map((e) => e.rank))).toEqual(new Set([1]));
  });
});

describe("display names", () => {
  it("formats Latin and Arabic names", () => {
    expect(formatDisplayName("Layla Haddad", null, "first_initial")).toBe("Layla H.");
    expect(formatDisplayName("ليلى حداد", null, "first_initial")).toBe("ليلى ح.");
    expect(formatDisplayName("Layla", null, "first_initial")).toBe("Layla");
    expect(formatDisplayName("Layla Haddad", null, "first_name")).toBe("Layla");
    expect(formatDisplayName("Layla Haddad", "Star", "nickname")).toBe("Star");
    expect(formatDisplayName("Layla Haddad", null, "nickname")).toBe("Layla");
  });
});
