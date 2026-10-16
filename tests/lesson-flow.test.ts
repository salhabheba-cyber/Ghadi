import { beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db";
import { advanceSession, requestHint, startSession, submitAnswer, getSessionView, SessionError, type SessionView } from "@/lib/repo/sessions";
import { deleteChild, deleteLearningData, resetSkill, getChildAccess } from "@/lib/repo/children";
import { getProgress } from "@/lib/repo/progress";
import { ensureSeed, findKeys, lessonBySlug, makeChild, makeParent } from "./helpers";

const ANSWER_KEYS = ["correctOptionIds", "correctValue", "correct", "hints", "spec"];
/** Anything that would let a client read answers before attempting. `reveal` is checked separately per state. */
const leaks = (v: SessionView) => [...findKeys({ ...v, reveal: null }, ANSWER_KEYS), ...findKeys(v.activity, ["explanation", ...ANSWER_KEYS])];
const choose = (v: SessionView, id: string) => submitAnswer(PARENT, v.id, v.activity!.id, { optionIds: [id] });
let PARENT = "";

describe("interactive lesson flow (colours lesson)", () => {
  let childId = ""; let sessionId = ""; let view: SessionView;

  beforeAll(async () => {
    await ensureSeed();
    PARENT = (await makeParent("flow")).id;
    childId = (await makeChild(PARENT)).id;
    view = (await startSession(PARENT, childId, await lessonBySlug(childId, "colours-red-blue-yellow")))!;
    sessionId = view.id;
  });

  it("starts in the introduction, in demo mode, with disclosure labels and source info", () => {
    expect(view.state).toBe("introduction");
    expect(view.teacherMode).toBe("demo");
    expect(view.teacherLabel).toMatch(/no AI model/i);
    expect(view.teacher.provenance.mode).toBe("demo");
    expect(view.lesson.licenseName).toBeTruthy();
    expect(view.lesson.objectives.length).toBeGreaterThan(0);
    expect(view.teacher.utterance).toContain("Sami");
  });

  it("resumes the same unfinished session instead of creating a duplicate", async () => {
    const again = await startSession(PARENT, childId, await lessonBySlug(childId, "colours-red-blue-yellow"));
    expect(again!.id).toBe(sessionId);
  });

  it("cannot skip ahead to practice or recap without going through the steps", async () => {
    await expect(submitAnswer(PARENT, sessionId, "00000000-0000-4000-8000-000000000000", { value: 1 })).rejects.toMatchObject({ code: "invalid_state" });
    await expect(requestHint(PARENT, sessionId)).rejects.toMatchObject({ code: "no_hints" });
  });

  it("walks introduction → explanation (3 steps) → guided practice", async () => {
    view = await advanceSession(PARENT, sessionId);
    expect(view.state).toBe("explanation");
    expect(view.explanation).toMatchObject({ step: 1, total: 3 });
    view = await advanceSession(PARENT, sessionId);
    expect(view.explanation?.step).toBe(2);
    view = await advanceSession(PARENT, sessionId);
    view = await advanceSession(PARENT, sessionId);
    expect(view.state).toBe("guided_practice");
    expect(view.activity?.kind).toBe("choice");
    expect(view.activityNumber).toBe(1);
  });

  it("never sends answers, hints text sources or explanations before an attempt", () => {
    expect(leaks(view)).toEqual([]);
    expect(view.reveal).toBeNull();
  });

  it("guided: a wrong answer gets feedback and an automatic hint, then a retry succeeds", async () => {
    const wrong = await choose(view, "blue");
    expect(wrong.feedback.correct).toBe(false);
    expect(wrong.view.state).toBe("guided_practice");
    expect(wrong.view.hintsShown).toBe(1);
    expect(wrong.view.teacher.kind).toBe("hint");
    expect(wrong.view.reveal).toBeNull();
    expect(leaks(wrong.view)).toEqual([]);
    const right = await choose(wrong.view, "red");
    expect(right.feedback.correct).toBe(true);
    expect(right.view.activityNumber).toBe(2);
    view = right.view;
  });

  it("guided: a requested hint is revealed one at a time, and two wrong answers lead to correction", async () => {
    view = await requestHint(PARENT, sessionId);
    expect(view.hintsShown).toBe(1);
    const w1 = await choose(view, "blue");
    expect(w1.view.state).toBe("guided_practice");
    const w2 = await choose(w1.view, "red");
    expect(w2.view.state).toBe("correction");
    expect(w2.view.reveal).toEqual({ correctOptionIds: ["yellow"] }); // revealed only after attempting
    expect(w2.view.teacher.kind).toBe("correction");
    view = await advanceSession(PARENT, sessionId);
    expect(view.state).toBe("independent_attempt");
  });

  it("independent phase: no hints, one attempt, wrong answer goes to correction", async () => {
    await expect(requestHint(PARENT, sessionId)).rejects.toMatchObject({ code: "no_hints" });
    expect(view.canHint).toBe(false);
    const wrong = await choose(view, "red"); // correct answer is blue
    expect(wrong.view.state).toBe("correction");
    view = await advanceSession(PARENT, sessionId);
    expect(view.state).toBe("independent_attempt");
    expect(view.activityNumber).toBe(4);
  });

  it("rejects an answer for the wrong activity, malformed answers and unknown options", async () => {
    await expect(submitAnswer(PARENT, sessionId, "00000000-0000-4000-8000-000000000000", { optionIds: ["yellow"] })).rejects.toMatchObject({ code: "wrong_activity" });
    await expect(submitAnswer(PARENT, sessionId, view.activity!.id, { nonsense: true })).rejects.toMatchObject({ code: "bad_answer" });
    await expect(submitAnswer(PARENT, sessionId, view.activity!.id, { optionIds: ["purple"] })).rejects.toMatchObject({ code: "bad_answer" });
    await expect(submitAnswer(PARENT, sessionId, view.activity!.id, { value: 3 })).rejects.toMatchObject({ code: "bad_answer" });
  });

  it("recap summary is derived from stored attempts, then the session completes", async () => {
    const last = await choose(view, "yellow");
    expect(last.view.state).toBe("recap");
    expect(last.view.summary).toEqual({ correct: 2, total: 4 }); // activities 1 and 4 were answered correctly
    const done = await advanceSession(PARENT, sessionId);
    expect(done.state).toBe("completion");
    expect(done.done).toBe(true);
    const row = await getPool().query("SELECT ended_at FROM learning_sessions WHERE id=$1", [sessionId]);
    expect(row.rows[0].ended_at).not.toBeNull();
    await expect(advanceSession(PARENT, sessionId)).rejects.toBeInstanceOf(SessionError);
    await expect(submitAnswer(PARENT, sessionId, "00000000-0000-4000-8000-000000000000", { value: 1 })).rejects.toBeInstanceOf(SessionError);
  });

  it("stored evidence exactly matches the attempts, and independence is only credited without hints", async () => {
    const att = await getPool().query("SELECT count(*)::int n FROM attempts WHERE child_id=$1", [childId]);
    const ev = await getPool().query("SELECT success, independent FROM skill_evidence WHERE child_id=$1 ORDER BY created_at", [childId]);
    expect(att.rows[0].n).toBe(6);
    expect(ev.rows).toHaveLength(6);
    expect(ev.rows.filter((r) => r.independent)).toHaveLength(2);
    expect(ev.rows.filter((r) => r.independent && r.success)).toHaveLength(1);
  });

  it("progress never over-claims: mixed evidence is 'emerging', not mastered", async () => {
    const p = await getProgress(childId);
    expect(p.sessionsCompleted).toBe(1);
    expect(p.totalAttempts).toBe(6);
    expect(p.skills).toHaveLength(1);
    expect(p.skills[0]).toMatchObject({ skillId: "color-recognition", evidenceCount: 6, label: "emerging" });
  });

  it("a parent can correct the record by resetting one skill", async () => {
    expect(await resetSkill(PARENT, childId, "color-recognition")).toBe(true);
    const p = await getProgress(childId);
    expect(p.skills).toHaveLength(0);
  });
});

describe("no mastery without evidence", () => {
  it("finishing only the introduction and explanation produces no skill record", async () => {
    await ensureSeed();
    const parent = (await makeParent("noev")).id;
    const child = await makeChild(parent);
    let v = (await startSession(parent, child.id, await lessonBySlug(child.id, "shapes-circle-square-triangle")))!;
    for (let i = 0; i < 4; i++) v = await advanceSession(parent, v.id);
    expect(v.state).toBe("guided_practice");
    const p = await getProgress(child.id);
    expect(p.skills).toHaveLength(0);
    expect(p.totalAttempts).toBe(0);
    // Practice cannot be skipped: "continue" is not a valid move while an activity awaits an answer.
    await expect(advanceSession(parent, v.id)).rejects.toMatchObject({ code: "invalid_state" });
  });
});

describe("counting activity grading", () => {
  it("grades numeric answers deterministically", async () => {
    await ensureSeed();
    const parent = (await makeParent("cnt")).id;
    const child = await makeChild(parent);
    let v = (await startSession(parent, child.id, await lessonBySlug(child.id, "counting-to-five")))!;
    for (let i = 0; i < 5; i++) v = await advanceSession(parent, v.id); // intro + 4 explanation steps
    expect(v.activity?.kind).toBe("count");
    expect(leaks(v)).toEqual([]);
    const wrong = await submitAnswer(parent, v.id, v.activity!.id, { value: 3 });
    expect(wrong.feedback.correct).toBe(false); // there are 2 stars
    const right = await submitAnswer(parent, v.id, v.activity!.id, { value: 2 });
    expect(right.feedback.correct).toBe(true);
  });
});

describe("deletion controls", () => {
  it("deleteLearningData removes history but keeps the profile; deleteChild removes everything and stays auditable", async () => {
    await ensureSeed();
    const parent = (await makeParent("del")).id;
    const child = await makeChild(parent, { displayName: "UniqueNameQ9" });
    let v = (await startSession(parent, child.id, await lessonBySlug(child.id, "colours-red-blue-yellow")))!;
    for (let i = 0; i < 4; i++) v = await advanceSession(parent, v.id);
    await choose2(parent, v, "red");

    const count = async (t: string) => (await getPool().query(`SELECT count(*)::int n FROM ${t} WHERE child_id=$1`, [child.id])).rows[0].n as number;
    expect(await count("attempts")).toBe(1);

    expect(await deleteLearningData(parent, child.id)).toBe(true);
    expect(await count("learning_sessions")).toBe(0);
    expect(await count("attempts")).toBe(0);
    expect(await count("skill_evidence")).toBe(0);
    expect(await count("mastery_estimates")).toBe(0);
    expect(await getChildAccess(parent, child.id)).not.toBeNull();

    expect(await deleteChild(parent, child.id)).toBe(true);
    expect(await getChildAccess(parent, child.id)).toBeNull();
    expect(await count("consent_records")).toBe(0);
    expect(await getSessionView(parent, v.id)).toBeNull();
    const audit = await getPool().query("SELECT action, metadata FROM audit_events WHERE child_id=$1 ORDER BY id", [child.id]);
    expect(audit.rows.map((r) => r.action)).toEqual(["child.created", "child.learning_data_deleted", "child.deleted"]);
    expect(JSON.stringify(audit.rows)).not.toContain("UniqueNameQ9"); // audit trail holds no child PII
    const dr = await getPool().query("SELECT status FROM deletion_requests WHERE child_id=$1", [child.id]);
    expect(dr.rows[0].status).toBe("completed");
  });
});

async function choose2(parent: string, v: SessionView, id: string) {
  return submitAnswer(parent, v.id, v.activity!.id, { optionIds: [id] });
}
