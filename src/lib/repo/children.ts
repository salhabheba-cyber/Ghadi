import { getPool, withTx } from "@/lib/db";
import { isUuid } from "@/lib/repo/util";
import type { AgeBand, ChildInput, ConsentInput, Locale } from "@/lib/schemas";

export const POLICY_VERSION = "draft-2026-10"; // placeholder until legal review produces a real policy

export interface Child {
  id: string;
  displayName: string;
  ageBand: AgeBand;
  uiLocale: Locale;
  lessonLanguage: Locale;
  explanationLanguage: Locale;
  sessionMinutes: number;
  createdAt: Date;
}
export interface ChildAccess {
  child: Child;
  canManage: boolean;
  canViewProgress: boolean;
}

interface Row {
  id: string; display_name: string; age_band: AgeBand; ui_locale: Locale; lesson_language: Locale;
  explanation_language: Locale; session_minutes: number; created_at: Date; can_manage: boolean; can_view_progress: boolean;
}
const toChild = (r: Row): Child => ({
  id: r.id, displayName: r.display_name, ageBand: r.age_band, uiLocale: r.ui_locale, lessonLanguage: r.lesson_language,
  explanationLanguage: r.explanation_language, sessionMinutes: r.session_minutes, createdAt: r.created_at,
});

const SELECT = `SELECT c.*, g.can_manage, g.can_view_progress FROM child_profiles c
                JOIN child_guardians g ON g.child_id = c.id AND g.guardian_id = $1`;

export async function listChildren(guardianId: string): Promise<Child[]> {
  const r = await getPool().query<Row>(`${SELECT} ORDER BY c.created_at`, [guardianId]);
  return r.rows.map(toChild);
}

/** Returns null both for "does not exist" and "not yours" so ids can't be probed. */
export async function getChildAccess(guardianId: string, childId: string): Promise<ChildAccess | null> {
  if (!isUuid(childId)) return null;
  const r = await getPool().query<Row>(`${SELECT} WHERE c.id = $2`, [guardianId, childId]);
  const row = r.rows[0];
  return row ? { child: toChild(row), canManage: row.can_manage, canViewProgress: row.can_view_progress } : null;
}

export async function createChild(guardianId: string, input: ChildInput, consent: ConsentInput): Promise<Child> {
  return withTx(async (c) => {
    const ins = await c.query<{ id: string }>(
      `INSERT INTO child_profiles (display_name, age_band, ui_locale, lesson_language, explanation_language, session_minutes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [input.displayName, input.ageBand, input.uiLocale, input.lessonLanguage, input.explanationLanguage, input.sessionMinutes],
    );
    const id = ins.rows[0]!.id;
    await c.query("INSERT INTO child_guardians (child_id, guardian_id) VALUES ($1,$2)", [id, guardianId]);
    for (const [type, granted] of [
      ["learning_data", consent.learningData],
      ["ai_teacher_disclosure", consent.aiDisclosure],
      ["microphone", consent.microphone],
    ] as const) {
      await c.query(
        "INSERT INTO consent_records (child_id, guardian_id, consent_type, granted, policy_version) VALUES ($1,$2,$3,$4,$5)",
        [id, guardianId, type, granted, POLICY_VERSION],
      );
    }
    await c.query("INSERT INTO audit_events (actor_id, child_id, action) VALUES ($1,$2,'child.created')", [guardianId, id]);
    const r = await c.query<Row>(`${SELECT} WHERE c.id = $2`, [guardianId, id]);
    return toChild(r.rows[0]!);
  });
}

export async function updateChild(guardianId: string, childId: string, input: ChildInput): Promise<boolean> {
  const access = await getChildAccess(guardianId, childId);
  if (!access?.canManage) return false;
  await withTx(async (c) => {
    await c.query(
      `UPDATE child_profiles SET display_name=$2, age_band=$3, ui_locale=$4, lesson_language=$5, explanation_language=$6,
       session_minutes=$7, updated_at=now() WHERE id=$1`,
      [childId, input.displayName, input.ageBand, input.uiLocale, input.lessonLanguage, input.explanationLanguage, input.sessionMinutes],
    );
    await c.query("INSERT INTO audit_events (actor_id, child_id, action) VALUES ($1,$2,'child.updated')", [guardianId, childId]);
  });
  return true;
}

export async function setMicrophoneConsent(guardianId: string, childId: string, granted: boolean): Promise<boolean> {
  const access = await getChildAccess(guardianId, childId);
  if (!access?.canManage) return false;
  await getPool().query(
    "INSERT INTO consent_records (child_id, guardian_id, consent_type, granted, policy_version) VALUES ($1,$2,'microphone',$3,$4)",
    [childId, guardianId, granted, POLICY_VERSION],
  );
  return true;
}

export async function hasMicrophoneConsent(childId: string): Promise<boolean> {
  const r = await getPool().query<{ granted: boolean }>(
    "SELECT granted FROM consent_records WHERE child_id=$1 AND consent_type='microphone' ORDER BY recorded_at DESC, id DESC LIMIT 1",
    [childId],
  );
  return r.rows[0]?.granted ?? false;
}

/** Deletes ALL data for the child (profile, sessions, attempts, evidence, consents) via cascade. */
export async function deleteChild(guardianId: string, childId: string): Promise<boolean> {
  const access = await getChildAccess(guardianId, childId);
  if (!access?.canManage) return false;
  await withTx(async (c) => {
    await c.query("DELETE FROM child_profiles WHERE id=$1", [childId]);
    await c.query("INSERT INTO deletion_requests (guardian_id, child_id, status, completed_at) VALUES ($1,$2,'completed',now())", [guardianId, childId]);
    await c.query("INSERT INTO audit_events (actor_id, child_id, action) VALUES ($1,$2,'child.deleted')", [guardianId, childId]);
  });
  return true;
}

/** Deletes learning history but keeps the profile and consents. */
export async function deleteLearningData(guardianId: string, childId: string): Promise<boolean> {
  const access = await getChildAccess(guardianId, childId);
  if (!access?.canManage) return false;
  await withTx(async (c) => {
    await c.query("DELETE FROM learning_sessions WHERE child_id=$1", [childId]); // cascades events, attempts, evidence
    await c.query("DELETE FROM skill_evidence WHERE child_id=$1", [childId]);
    await c.query("DELETE FROM mastery_estimates WHERE child_id=$1", [childId]);
    await c.query("DELETE FROM dictation_attempts WHERE child_id=$1", [childId]);
    await c.query("DELETE FROM reading_attempts WHERE child_id=$1", [childId]);
    await c.query("INSERT INTO audit_events (actor_id, child_id, action) VALUES ($1,$2,'child.learning_data_deleted')", [guardianId, childId]);
  });
  return true;
}

/** Parent correction: remove one skill's evidence and estimate when the record is inaccurate. */
export async function resetSkill(guardianId: string, childId: string, skillId: string): Promise<boolean> {
  const access = await getChildAccess(guardianId, childId);
  if (!access?.canManage) return false;
  await withTx(async (c) => {
    await c.query("DELETE FROM skill_evidence WHERE child_id=$1 AND skill_id=$2", [childId, skillId]);
    await c.query("DELETE FROM mastery_estimates WHERE child_id=$1 AND skill_id=$2", [childId, skillId]);
    await c.query("INSERT INTO audit_events (actor_id, child_id, action, metadata) VALUES ($1,$2,'skill.reset',$3)", [guardianId, childId, JSON.stringify({ skillId })]);
  });
  return true;
}

export async function exportChildData(guardianId: string, childId: string) {
  const access = await getChildAccess(guardianId, childId);
  if (!access?.canViewProgress) return null;
  const q = (sql: string) => getPool().query(sql, [childId]).then((r) => r.rows);
  return {
    exportedAt: new Date().toISOString(),
    profile: access.child,
    consents: await q("SELECT consent_type, granted, policy_version, recorded_at FROM consent_records WHERE child_id=$1 ORDER BY recorded_at"),
    sessions: await q("SELECT id, lesson_version_id, state, teacher_mode, started_at, ended_at FROM learning_sessions WHERE child_id=$1 ORDER BY started_at"),
    attempts: await q("SELECT id, session_id, activity_id, answer, is_correct, hints_used, phase, created_at FROM attempts WHERE child_id=$1 ORDER BY created_at"),
    skillEvidence: await q("SELECT skill_id, success, independent, created_at FROM skill_evidence WHERE child_id=$1 ORDER BY created_at"),
    masteryEstimates: await q("SELECT skill_id, estimate, evidence_count, updated_at FROM mastery_estimates WHERE child_id=$1"),
    dictationAttempts: await q("SELECT text_id, family_text_id, typed_text, accuracy, result, created_at FROM dictation_attempts WHERE child_id=$1 ORDER BY created_at"),
    readingAttempts: await q("SELECT text_id, family_text_id, word_marks, assessed_by, created_at FROM reading_attempts WHERE child_id=$1 ORDER BY created_at"),
    agendaItems: await q("SELECT title, due_on, status, confirmed, source, created_at FROM agenda_items WHERE child_id=$1 ORDER BY created_at"),
    familyTexts: await q("SELECT id, title, body, language, created_at FROM family_texts WHERE child_id=$1 ORDER BY created_at"),
  };
}

/**
 * Deletes the parent's whole account: every child profile they alone guardian (with all learning data), their uploads,
 * agenda, subscription and sign-in records. Requires the exact account email. Children shared with another guardian
 * are kept for that guardian. The audit event holds no personal data.
 */
export async function deleteAccount(userId: string, confirmEmail: string): Promise<boolean> {
  const u = await getPool().query<{ email: string }>(`SELECT email FROM "user" WHERE id=$1`, [userId]);
  const email = u.rows[0]?.email;
  if (!email || email.toLowerCase() !== confirmEmail.trim().toLowerCase()) return false;
  await withTx(async (c) => {
    const sole = await c.query<{ child_id: string }>(
      `SELECT g.child_id FROM child_guardians g WHERE g.guardian_id=$1
         AND NOT EXISTS (SELECT 1 FROM child_guardians o WHERE o.child_id=g.child_id AND o.guardian_id<>$1)`, [userId]);
    for (const { child_id } of sole.rows) await c.query("DELETE FROM child_profiles WHERE id=$1", [child_id]);
    await c.query(`DELETE FROM "user" WHERE id=$1`, [userId]);
    await c.query(`INSERT INTO audit_events (actor_id, action, metadata) VALUES (NULL,'account.deleted',$1)`, [JSON.stringify({ children: sole.rows.length })]);
  });
  return true;
}
