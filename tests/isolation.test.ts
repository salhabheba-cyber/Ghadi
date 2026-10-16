import { beforeAll, describe, expect, it } from "vitest";
import {
  deleteAccount, deleteChild, deleteLearningData, exportChildData, getChildAccess, listChildren, resetSkill, setMicrophoneConsent, updateChild,
} from "@/lib/repo/children";
import { getSessionView, startSession, submitAnswer, advanceSession, requestHint, SessionError } from "@/lib/repo/sessions";
import { listLessonsForChild } from "@/lib/repo/curriculum";
import { getProgress } from "@/lib/repo/progress";
import { getPool } from "@/lib/db";
import { ensureSeed, lessonBySlug, makeChild, makeParent, childInput } from "./helpers";

describe("tenant isolation: a guardian can only reach their own children", () => {
  let a: { id: string }; let b: { id: string };
  let childA: Awaited<ReturnType<typeof makeChild>>;
  let sessionA: string; let lessonId: string;

  beforeAll(async () => {
    await ensureSeed();
    a = await makeParent("a"); b = await makeParent("b");
    childA = await makeChild(a.id);
    lessonId = await lessonBySlug(childA.id, "colours-red-blue-yellow");
    sessionA = (await startSession(a.id, childA.id, lessonId))!.id;
  });

  it("lists only the caller's children", async () => {
    expect((await listChildren(a.id)).map((c) => c.id)).toContain(childA.id);
    expect(await listChildren(b.id)).toHaveLength(0);
  });

  it("returns null (indistinguishable from 'not found') for another guardian's child", async () => {
    expect(await getChildAccess(b.id, childA.id)).toBeNull();
    expect(await getChildAccess(b.id, "not-a-uuid")).toBeNull();
  });

  it("blocks reading, writing, exporting, deleting and consent changes", async () => {
    expect(await updateChild(b.id, childA.id, childInput({ displayName: "Hacked" }))).toBe(false);
    expect(await exportChildData(b.id, childA.id)).toBeNull();
    expect(await deleteLearningData(b.id, childA.id)).toBe(false);
    expect(await resetSkill(b.id, childA.id, "color-recognition")).toBe(false);
    expect(await setMicrophoneConsent(b.id, childA.id, true)).toBe(false);
    expect(await deleteChild(b.id, childA.id)).toBe(false);
    expect((await getChildAccess(a.id, childA.id))?.child.displayName).toBe("Sami");
  });

  it("blocks starting, viewing and driving another guardian's learning session", async () => {
    expect(await startSession(b.id, childA.id, lessonId)).toBeNull();
    expect(await getSessionView(b.id, sessionA)).toBeNull();
    await expect(advanceSession(b.id, sessionA)).rejects.toMatchObject({ code: "not_found" });
    await expect(requestHint(b.id, sessionA)).rejects.toMatchObject({ code: "not_found" });
    await expect(submitAnswer(b.id, sessionA, "00000000-0000-4000-8000-000000000000", { value: 1 })).rejects.toBeInstanceOf(SessionError);
    expect(await getSessionView(a.id, sessionA)).not.toBeNull();
  });

  it("does not expose one child's progress to another guardian's profile", async () => {
    const childB = await makeChild(b.id, { displayName: "Lina" });
    const p = await getProgress(childB.id);
    expect(p.totalAttempts).toBe(0);
    expect(p.skills).toHaveLength(0);
  });
});

describe("content publication and age/language filtering", () => {
  it("only serves approved lessons in the child's lesson language and age band", async () => {
    await ensureSeed();
    const parent = await makeParent("lib");
    const en = await makeChild(parent.id);
    const lessons = await listLessonsForChild(en);
    expect(lessons.map((l) => l.slug).sort()).toEqual(
      ["colours-red-blue-yellow", "counting-to-five", "first-sound-sss", "shapes-circle-square-triangle"],
    );
    // French and Arabic drafts are in_review, so they must not be served yet.
    expect(await listLessonsForChild({ lessonLanguage: "fr", ageBand: "3-5" })).toHaveLength(0);
    expect(await listLessonsForChild({ lessonLanguage: "ar", ageBand: "3-5" })).toHaveLength(0);
    // The sample content only covers ages 3–5.
    expect(await listLessonsForChild({ lessonLanguage: "en", ageBand: "13-18" })).toHaveLength(0);
  });

  it("records source, license and an honest alignment note for every lesson", async () => {
    const lessons = await listLessonsForChild({ lessonLanguage: "en", ageBand: "3-5" });
    for (const l of lessons) {
      expect(l.licenseId).toBe("ghadi-original");
      expect(l.sourceTitle).toBeTruthy();
      expect(l.objectives.length).toBeGreaterThan(0);
      expect(l.alignmentNote).toMatch(/not aligned/i);
    }
  });

  it("supports search and domain filtering", async () => {
    const child = { lessonLanguage: "en" as const, ageBand: "3-5" as const };
    expect((await listLessonsForChild(child, { q: "colour" })).map((l) => l.slug)).toEqual(["colours-red-blue-yellow"]);
    expect((await listLessonsForChild(child, { domain: "Counting" })).map((l) => l.slug)).toEqual(["counting-to-five"]);
    expect(await listLessonsForChild(child, { q: "zzz-nothing" })).toHaveLength(0);
  });
});

describe("account deletion leaves no orphaned child data", () => {
  it("deleting a guardian removes children that have no other guardian, with their learning data", async () => {
    await ensureSeed();
    const parent = await makeParent("orphan");
    const child = await makeChild(parent.id);
    const lessonId = await lessonBySlug(child.id, "colours-red-blue-yellow");
    const v = (await startSession(parent.id, child.id, lessonId))!;
    await getPool().query('DELETE FROM "user" WHERE id=$1', [parent.id]);
    expect((await getPool().query("SELECT 1 FROM child_profiles WHERE id=$1", [child.id])).rowCount).toBe(0);
    expect((await getPool().query("SELECT 1 FROM learning_sessions WHERE id=$1", [v.id])).rowCount).toBe(0);
  });

  it("keeps a child that still has another guardian", async () => {
    const p1 = await makeParent("co1"); const p2 = await makeParent("co2");
    const child = await makeChild(p1.id);
    await getPool().query("INSERT INTO child_guardians (child_id, guardian_id) VALUES ($1,$2)", [child.id, p2.id]);
    await getPool().query('DELETE FROM "user" WHERE id=$1', [p1.id]);
    expect(await getChildAccess(p2.id, child.id)).not.toBeNull();
  });
});

describe("account deletion", () => {
  it("requires the exact email, removes the account, its children and uploads, and leaves no personal audit data", async () => {
    const p = await makeParent("bye"), c = await makeChild(p.id);
    expect(await deleteAccount(p.id, "wrong@example.test")).toBe(false);
    expect((await getPool().query(`SELECT 1 FROM "user" WHERE id=$1`, [p.id])).rowCount).toBe(1);
    expect(await deleteAccount(p.id, p.email.toUpperCase())).toBe(true);
    expect((await getPool().query(`SELECT 1 FROM "user" WHERE id=$1`, [p.id])).rowCount).toBe(0);
    expect((await getPool().query(`SELECT 1 FROM child_profiles WHERE id=$1`, [c.id])).rowCount).toBe(0);
  });
});
