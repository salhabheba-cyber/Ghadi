import { getPool } from "@/lib/db";
import { computeMastery, type MasteryLabel } from "@/lib/teaching/mastery";

export interface SkillProgress {
  skillId: string;
  name: string;
  domain: string;
  estimate: number;
  evidenceCount: number;
  independentSuccesses: number;
  label: MasteryLabel;
  lastPracticed: Date | null;
}
export interface ProgressSummary {
  sessionsCompleted: number;
  sessionsInProgress: number;
  totalAttempts: number;
  skills: SkillProgress[];
  recent: { lessonTitle: string; correct: boolean; phase: string; at: Date }[];
  teacherModes: string[];
}

/** Everything here is derived from stored attempts. Nothing is inferred beyond the evidence. */
export async function getProgress(childId: string): Promise<ProgressSummary> {
  const p = getPool();
  const sess = (await p.query<{ done: number; open: number }>(
    `SELECT count(*) FILTER (WHERE ended_at IS NOT NULL)::int AS done, count(*) FILTER (WHERE ended_at IS NULL)::int AS open
       FROM learning_sessions WHERE child_id=$1`, [childId])).rows[0]!;
  const total = (await p.query<{ n: number }>("SELECT count(*)::int AS n FROM attempts WHERE child_id=$1", [childId])).rows[0]!.n;
  const ev = (await p.query<{ skill_id: string; name_en: string; domain: string; success: boolean; independent: boolean; created_at: Date }>(
    `SELECT e.skill_id, s.name_en, s.domain, e.success, e.independent, e.created_at
       FROM skill_evidence e JOIN skills s ON s.id = e.skill_id WHERE e.child_id=$1 ORDER BY e.created_at`, [childId])).rows;
  const by = new Map<string, typeof ev>();
  for (const e of ev) by.set(e.skill_id, [...(by.get(e.skill_id) ?? []), e]);
  const skills: SkillProgress[] = [...by.entries()].map(([skillId, rows]) => {
    const m = computeMastery(rows);
    return {
      skillId, name: rows[0]!.name_en, domain: rows[0]!.domain, estimate: m.estimate, evidenceCount: m.evidenceCount,
      independentSuccesses: m.independentSuccesses, label: m.label, lastPracticed: rows[rows.length - 1]!.created_at,
    };
  }).sort((a, b) => a.domain.localeCompare(b.domain));
  const recent = (await p.query<{ title: string; is_correct: boolean; phase: string; created_at: Date }>(
    `SELECT v.title, a.is_correct, a.phase, a.created_at FROM attempts a
       JOIN learning_sessions s ON s.id = a.session_id JOIN lesson_versions v ON v.id = s.lesson_version_id
      WHERE a.child_id=$1 ORDER BY a.created_at DESC LIMIT 8`, [childId])).rows
    .map((r) => ({ lessonTitle: r.title, correct: r.is_correct, phase: r.phase, at: r.created_at }));
  const modes = (await p.query<{ teacher_mode: string }>("SELECT DISTINCT teacher_mode FROM learning_sessions WHERE child_id=$1", [childId])).rows;
  return { sessionsCompleted: sess.done, sessionsInProgress: sess.open, totalAttempts: total, skills, recent, teacherModes: modes.map((m) => m.teacher_mode) };
}

export interface ReportData {
  progress: ProgressSummary;
  lessonsCompleted: { title: string; endedAt: Date }[];
  prerequisites: { skillId: string; prerequisiteId: string }[];
  skillNames: Record<string, string>;
}

/** Inputs for the printable parent report. Everything comes from stored records; nothing is estimated beyond the mastery rules. */
export async function getReportData(childId: string): Promise<ReportData> {
  const p = getPool();
  const progress = await getProgress(childId);
  const done = (await p.query<{ title: string; ended_at: Date }>(
    `SELECT v.title, s.ended_at FROM learning_sessions s JOIN lesson_versions v ON v.id=s.lesson_version_id
      WHERE s.child_id=$1 AND s.ended_at IS NOT NULL ORDER BY s.ended_at DESC LIMIT 20`, [childId])).rows;
  const prereq = (await p.query<{ skill_id: string; prerequisite_id: string }>("SELECT skill_id, prerequisite_id FROM skill_prerequisites")).rows;
  const names = (await p.query<{ id: string; name_en: string }>("SELECT id, name_en FROM skills")).rows;
  return {
    progress,
    lessonsCompleted: done.map((d) => ({ title: d.title, endedAt: d.ended_at })),
    prerequisites: prereq.map((r) => ({ skillId: r.skill_id, prerequisiteId: r.prerequisite_id })),
    skillNames: Object.fromEntries(names.map((n) => [n.id, n.name_en])),
  };
}
