import { requireEntitlement } from "@/lib/repo/billing";
import type { PoolClient } from "pg";
import { getPool, withTx } from "@/lib/db";
import { getChildAccess } from "@/lib/repo/children";
import { getLessonForChild } from "@/lib/repo/curriculum";
import { isUuid } from "@/lib/repo/util";
import {
  ActivitySpec, AnswerInput, LessonContent, TeacherTurn,
  type Locale, type Phase, type PublicActivity, type TeachingState, type Visual,
} from "@/lib/schemas";
import { transition, acceptsAnswers, canUseHints, InvalidTransition, type MachineContext } from "@/lib/teaching/machine";
import { grade } from "@/lib/teaching/grading";
import { computeMastery } from "@/lib/teaching/mastery";
import { resolveTeacher } from "@/lib/teaching/demo-teacher";
import type { TeacherContext } from "@/lib/providers/types";

export class SessionError extends Error {
  constructor(public code: "not_found" | "invalid_state" | "wrong_activity" | "no_hints" | "bad_answer", message?: string) {
    super(message ?? code);
  }
}

export interface SessionView {
  id: string;
  childId: string;
  state: TeachingState;
  done: boolean;
  lesson: { title: string; language: Locale; version: number; objectives: { code: string; description: string }[]; licenseName: string; sourceTitle: string; alignmentNote: string };
  explanation: { step: number; total: number; text: string; visual?: Visual } | null;
  activity: PublicActivity | null;
  activityNumber: number;
  totalActivities: number;
  teacher: TeacherTurn;
  teacherMode: "demo" | "llm";
  teacherLabel: string;
  teacherNote?: string;
  canHint: boolean;
  hintsShown: number;
  /** Only populated in the correction state, i.e. after the child has already attempted the activity. */
  reveal: { correctOptionIds?: string[]; correctValue?: number } | null;
  sessionMinutes: number;
  startedAt: string;
  summary: { correct: number; total: number } | null;
}
export interface AnswerFeedback {
  correct: boolean;
  teacher: TeacherTurn;
}

interface SessionRow {
  id: string; child_id: string; lesson_version_id: string; state: TeachingState; activity_index: number;
  teacher_mode: "demo" | "llm"; started_at: Date; ended_at: Date | null;
}
interface ActivityRow { id: string; position: number; skill_id: string; spec: ActivitySpec }
interface Loaded {
  session: SessionRow;
  child: { displayName: string; explanationLanguage: Locale; sessionMinutes: number };
  lesson: {
    title: string; language: Locale; version: number; content: LessonContent;
    objectives: { code: string; description: string }[]; licenseName: string; sourceTitle: string; alignmentNote: string;
  };
  activities: ActivityRow[];
}

type Q = Pick<PoolClient, "query">;

async function loadOwned(q: Q, guardianId: string, sessionId: string, lock: boolean): Promise<Loaded | null> {
  if (!isUuid(sessionId)) return null;
  const s = await q.query<SessionRow & { display_name: string; explanation_language: Locale; session_minutes: number }>(
    `SELECT s.*, c.display_name, c.explanation_language, c.session_minutes
       FROM learning_sessions s
       JOIN child_guardians g ON g.child_id = s.child_id AND g.guardian_id = $2
       JOIN child_profiles c ON c.id = s.child_id
      WHERE s.id = $1 ${lock ? "FOR UPDATE OF s" : ""}`,
    [sessionId, guardianId],
  );
  const row = s.rows[0];
  if (!row) return null;
  const v = await q.query<{
    title: string; language: Locale; version: number; content: unknown; license_name: string; source_title: string; alignment_note: string;
  }>(
    `SELECT v.title, v.language, v.version, v.content, lic.name AS license_name, src.title AS source_title, c.alignment_note
       FROM lesson_versions v
       JOIN lessons l ON l.id = v.lesson_id JOIN units u ON u.id = l.unit_id JOIN books b ON b.id = u.book_id
       JOIN curricula c ON c.id = b.curriculum_id
       JOIN licenses lic ON lic.id = v.license_id JOIN content_sources src ON src.id = v.source_id
      WHERE v.id = $1`,
    [row.lesson_version_id],
  );
  const lv = v.rows[0]!;
  const objectives = (await q.query<{ code: string; description: string }>(
    "SELECT code, description FROM learning_objectives WHERE lesson_version_id=$1 ORDER BY code", [row.lesson_version_id],
  )).rows;
  const acts = (await q.query<{ id: string; position: number; skill_id: string; spec: unknown }>(
    "SELECT id, position, skill_id, spec FROM activities WHERE lesson_version_id=$1 ORDER BY position", [row.lesson_version_id],
  )).rows.map((a) => ({ ...a, spec: ActivitySpec.parse(a.spec) }));
  return {
    session: row,
    child: { displayName: row.display_name, explanationLanguage: row.explanation_language, sessionMinutes: row.session_minutes },
    lesson: {
      title: lv.title, language: lv.language, version: lv.version, content: LessonContent.parse(lv.content), objectives,
      licenseName: lv.license_name, sourceTitle: lv.source_title, alignmentNote: lv.alignment_note,
    },
    activities: acts,
  };
}

const toPublic = (a: ActivityRow): PublicActivity => {
  const s = a.spec;
  if (s.kind === "choice") {
    return { id: a.id, kind: "choice", phase: s.phase, prompt: s.prompt, promptVisual: s.promptVisual, options: s.options, hintCount: s.hints.length };
  }
  return { id: a.id, kind: "count", phase: s.phase, prompt: s.prompt, countVisual: s.countVisual, numberOptions: s.options, hintCount: s.hints.length };
};

async function counts(q: Q, sessionId: string) {
  const attempts = (await q.query<{ activity_id: string; is_correct: boolean }>(
    "SELECT activity_id, is_correct FROM attempts WHERE session_id=$1", [sessionId])).rows;
  const hints = (await q.query<{ payload: { activityId?: string } }>(
    "SELECT payload FROM session_events WHERE session_id=$1 AND type='hint'", [sessionId])).rows;
  return { attempts, hints };
}

async function buildView(q: Q, L: Loaded): Promise<SessionView> {
  const { session, child, lesson, activities } = L;
  const { attempts, hints } = await counts(q, session.id);
  const state = session.state;
  const current = activities[session.activity_index];
  const showsActivity = state === "guided_practice" || state === "independent_attempt" || state === "correction";
  const hintsShown = current ? hints.filter((h) => h.payload.activityId === current.id).length : 0;
  const correctActivities = new Set(attempts.filter((a) => a.is_correct).map((a) => a.activity_id)).size;
  const { provider, note } = resolveTeacher();

  const base = { lessonVersionId: session.lesson_version_id, lessonLanguage: lesson.language, explanationLanguage: child.explanationLanguage, childName: child.displayName };
  let event: TeacherContext["event"];
  if (state === "introduction") event = { type: "greeting", lessonTitle: lesson.title };
  else if (state === "explanation") event = { type: "explain", text: lesson.content.explanation[session.activity_index]!.text };
  else if (state === "recap") event = { type: "recap", text: lesson.content.recap, correct: correctActivities, total: activities.length };
  else if (state === "completion") event = { type: "goodbye" };
  else if (state === "correction") event = { type: "correction", activityId: current!.id, explanation: current!.spec.explanation };
  else if (state === "guided_practice" && hintsShown > 0) event = { type: "hint", activityId: current!.id, hint: current!.spec.hints[Math.min(hintsShown, current!.spec.hints.length) - 1]! };
  else event = { type: "prompt", activityId: current!.id, prompt: current!.spec.prompt };
  const teacher = TeacherTurn.parse(await provider.nextTurn({ ...base, event }));

  let reveal: SessionView["reveal"] = null;
  if (state === "correction" && current) {
    reveal = current.spec.kind === "choice" ? { correctOptionIds: current.spec.correctOptionIds } : { correctValue: current.spec.correct };
  }
  const step = lesson.content.explanation[session.activity_index];
  return {
    id: session.id,
    childId: session.child_id,
    state,
    done: state === "completion",
    lesson: { title: lesson.title, language: lesson.language, version: lesson.version, objectives: lesson.objectives, licenseName: lesson.licenseName, sourceTitle: lesson.sourceTitle, alignmentNote: lesson.alignmentNote },
    explanation: state === "explanation" && step ? { step: session.activity_index + 1, total: lesson.content.explanation.length, text: step.text, visual: step.visual } : null,
    activity: showsActivity && current ? toPublic(current) : null,
    activityNumber: showsActivity && current ? session.activity_index + 1 : 0,
    totalActivities: activities.length,
    teacher,
    teacherMode: provider.mode,
    teacherLabel: provider.label,
    teacherNote: note,
    canHint: canUseHints(state) && !!current && hintsShown < current.spec.hints.length,
    hintsShown,
    reveal,
    sessionMinutes: child.sessionMinutes,
    startedAt: session.started_at.toISOString(),
    summary: state === "recap" || state === "completion" ? { correct: correctActivities, total: activities.length } : null,
  };
}

function machineCtx(L: Loaded, wrongOnCurrent: number): MachineContext {
  return {
    state: L.session.state,
    index: L.session.activity_index,
    explanationSteps: L.lesson.content.explanation.length,
    phases: L.activities.map((a) => a.spec.phase as Phase),
    wrongOnCurrent,
  };
}

async function applyTransition(q: Q, L: Loaded, next: { state: TeachingState; index: number }) {
  await q.query(
    "UPDATE learning_sessions SET state=$2, activity_index=$3, ended_at = CASE WHEN $2='completion' THEN now() ELSE ended_at END WHERE id=$1",
    [L.session.id, next.state, next.index],
  );
  if (next.state !== L.session.state) {
    await q.query("INSERT INTO session_events (session_id, type, payload) VALUES ($1,'state_changed',$2)", [L.session.id, JSON.stringify({ from: L.session.state, to: next.state })]);
  }
  L.session.state = next.state;
  L.session.activity_index = next.index;
}

async function recomputeMastery(q: Q, childId: string, skillId: string) {
  const ev = (await q.query<{ success: boolean; independent: boolean }>(
    "SELECT success, independent FROM skill_evidence WHERE child_id=$1 AND skill_id=$2", [childId, skillId])).rows;
  const m = computeMastery(ev);
  await q.query(
    `INSERT INTO mastery_estimates (child_id, skill_id, estimate, evidence_count) VALUES ($1,$2,$3,$4)
     ON CONFLICT (child_id, skill_id) DO UPDATE SET estimate=EXCLUDED.estimate, evidence_count=EXCLUDED.evidence_count, updated_at=now()`,
    [childId, skillId, m.estimate, m.evidenceCount],
  );
}

// ---------- public API ----------

export async function startSession(guardianId: string, childId: string, lessonId: string): Promise<SessionView | null> {
  await requireEntitlement(guardianId);
  const access = await getChildAccess(guardianId, childId);
  if (!access) return null;
  const lesson = await getLessonForChild(access.child, lessonId);
  if (!lesson) return null;
  const sessionId = await withTx(async (c) => {
    const existing = await c.query<{ id: string }>(
      "SELECT id FROM learning_sessions WHERE child_id=$1 AND lesson_version_id=$2 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
      [childId, lesson.versionId],
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const { provider } = resolveTeacher();
    const ins = await c.query<{ id: string }>(
      "INSERT INTO learning_sessions (child_id, lesson_version_id, state, teacher_mode) VALUES ($1,$2,'introduction',$3) RETURNING id",
      [childId, lesson.versionId, provider.mode],
    );
    await c.query("INSERT INTO session_events (session_id, type) VALUES ($1,'started')", [ins.rows[0]!.id]);
    return ins.rows[0]!.id;
  });
  return getSessionView(guardianId, sessionId);
}

export async function getSessionView(guardianId: string, sessionId: string): Promise<SessionView | null> {
  const L = await loadOwned(getPool(), guardianId, sessionId, false);
  return L ? buildView(getPool(), L) : null;
}

export async function advanceSession(guardianId: string, sessionId: string): Promise<SessionView> {
  await requireEntitlement(guardianId);
  return withTx(async (c) => {
    const L = await loadOwned(c, guardianId, sessionId, true);
    if (!L) throw new SessionError("not_found");
    try {
      await applyTransition(c, L, transition(machineCtx(L, 0), { type: "continue" }));
    } catch (e) {
      if (e instanceof InvalidTransition) throw new SessionError("invalid_state", e.message);
      throw e;
    }
    return buildView(c, L);
  });
}

export async function requestHint(guardianId: string, sessionId: string): Promise<SessionView> {
  await requireEntitlement(guardianId);
  return withTx(async (c) => {
    const L = await loadOwned(c, guardianId, sessionId, true);
    if (!L) throw new SessionError("not_found");
    const current = L.activities[L.session.activity_index];
    if (!canUseHints(L.session.state) || !current) throw new SessionError("no_hints", "Hints are only available during guided practice.");
    const { hints } = await counts(c, sessionId);
    const shown = hints.filter((h) => h.payload.activityId === current.id).length;
    if (shown >= current.spec.hints.length) throw new SessionError("no_hints", "No more hints for this activity.");
    await c.query("INSERT INTO session_events (session_id, type, payload) VALUES ($1,'hint',$2)", [sessionId, JSON.stringify({ activityId: current.id })]);
    return buildView(c, L);
  });
}

export async function submitAnswer(
  guardianId: string, sessionId: string, activityId: string, rawAnswer: unknown,
): Promise<{ view: SessionView; feedback: AnswerFeedback }> {
  const answer = AnswerInput.safeParse(rawAnswer);
  if (!answer.success) throw new SessionError("bad_answer");
  await requireEntitlement(guardianId);
  return withTx(async (c) => {
    const L = await loadOwned(c, guardianId, sessionId, true);
    if (!L) throw new SessionError("not_found");
    const current = L.activities[L.session.activity_index];
    if (!acceptsAnswers(L.session.state) || !current) throw new SessionError("invalid_state", "This session is not waiting for an answer.");
    if (current.id !== activityId) throw new SessionError("wrong_activity");

    let correct: boolean;
    try {
      correct = grade(current.spec, answer.data);
    } catch {
      throw new SessionError("bad_answer");
    }
    const { attempts, hints } = await counts(c, sessionId);
    const prior = attempts.filter((a) => a.activity_id === current.id);
    const wrongBefore = prior.filter((a) => !a.is_correct).length;
    const hintsUsed = hints.filter((h) => h.payload.activityId === current.id).length;
    const independentPhase = L.session.state === "independent_attempt";

    const att = await c.query<{ id: string }>(
      `INSERT INTO attempts (session_id, child_id, activity_id, answer, is_correct, hints_used, phase)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [sessionId, L.session.child_id, current.id, JSON.stringify(answer.data), correct, hintsUsed, L.session.state],
    );
    await c.query(
      "INSERT INTO skill_evidence (child_id, skill_id, attempt_id, success, independent) VALUES ($1,$2,$3,$4,$5)",
      [L.session.child_id, current.skill_id, att.rows[0]!.id, correct, independentPhase && hintsUsed === 0],
    );
    await recomputeMastery(c, L.session.child_id, current.skill_id);
    await c.query("INSERT INTO session_events (session_id, type, payload) VALUES ($1,'answered',$2)", [sessionId, JSON.stringify({ activityId: current.id, correct })]);

    const next = transition(machineCtx(L, wrongBefore), { type: "answer", correct });
    const stillGuidedOnSame = !correct && next.state === "guided_practice" && next.index === L.session.activity_index;
    await applyTransition(c, L, next);

    // After a first wrong guided attempt the teacher offers the next hint automatically.
    if (stillGuidedOnSame && hintsUsed < current.spec.hints.length) {
      await c.query("INSERT INTO session_events (session_id, type, payload) VALUES ($1,'hint',$2)", [sessionId, JSON.stringify({ activityId: current.id, auto: true })]);
    }

    const { provider } = resolveTeacher();
    const teacher = TeacherTurn.parse(await provider.nextTurn({
      lessonVersionId: L.session.lesson_version_id, lessonLanguage: L.lesson.language, explanationLanguage: L.child.explanationLanguage,
      childName: L.child.displayName, event: { type: "feedback", activityId: current.id, correct, attemptNumber: prior.length + 1 },
    }));
    return { view: await buildView(c, L), feedback: { correct, teacher } };
  });
}

/** The child's most recent unfinished lesson, for the "Continue" card. */
export async function findResumable(guardianId: string, childId: string): Promise<{ lessonId: string; title: string } | null> {
  const access = await getChildAccess(guardianId, childId);
  if (!access) return null;
  const r = await getPool().query<{ lesson_id: string; title: string }>(
    `SELECT l.id AS lesson_id, v.title FROM learning_sessions s
       JOIN lesson_versions v ON v.id = s.lesson_version_id JOIN lessons l ON l.id = v.lesson_id
      WHERE s.child_id = $1 AND s.ended_at IS NULL ORDER BY s.started_at DESC LIMIT 1`,
    [childId],
  );
  return r.rows[0] ? { lessonId: r.rows[0].lesson_id, title: r.rows[0].title } : null;
}
