import type { MasteryLabel } from "@/lib/teaching/mastery";

/**
 * Rule-based next-step suggestions with the reason attached. No model decides anything here, and nothing implies a
 * diagnosis: a suggestion only says "more practice evidence would help" or "a review is due".
 */
export type RecReason =
  | { code: "few_answers"; evidenceCount: number }
  | { code: "needs_practice"; estimatePct: number; evidenceCount: number }
  | { code: "review_due"; daysSince: number; label: MasteryLabel }
  | { code: "prerequisite"; prerequisiteName: string }
  | { code: "continue_lesson"; lessonTitle: string };
export interface Recommendation { skillId: string | null; skillName: string; reason: RecReason }

export interface SkillInput { skillId: string; name: string; label: MasteryLabel; estimate: number; evidenceCount: number; lastPracticed: Date | null }

/** Days before a review is suggested, by current label. Short for weak, longer for steady skills (spaced review). */
export const REVIEW_AFTER_DAYS: Record<Exclude<MasteryLabel, "not_enough_evidence">, number> = { emerging: 1, developing: 3, consistent: 7 };

export function recommend(args: {
  skills: SkillInput[];
  prerequisites: { skillId: string; prerequisiteId: string }[];
  skillNames: Record<string, string>;
  resumeLesson?: string | null;
  now?: Date;
}): Recommendation[] {
  const now = args.now ?? new Date();
  const out: Recommendation[] = [];
  const byId = new Map(args.skills.map((s) => [s.skillId, s]));
  if (args.resumeLesson) out.push({ skillId: null, skillName: args.resumeLesson, reason: { code: "continue_lesson", lessonTitle: args.resumeLesson } });
  for (const s of args.skills) {
    if (s.label === "not_enough_evidence") { out.push({ skillId: s.skillId, skillName: s.name, reason: { code: "few_answers", evidenceCount: s.evidenceCount } }); continue; }
    const days = s.lastPracticed ? Math.floor((now.getTime() - s.lastPracticed.getTime()) / 86_400_000) : Infinity;
    if (s.label === "emerging") {
      out.push({ skillId: s.skillId, skillName: s.name, reason: { code: "needs_practice", estimatePct: Math.round(s.estimate * 100), evidenceCount: s.evidenceCount } });
      // A weak skill whose prerequisite has little or no evidence: suggest the prerequisite first.
      for (const p of args.prerequisites.filter((x) => x.skillId === s.skillId)) {
        const pre = byId.get(p.prerequisiteId);
        if (!pre || pre.label === "not_enough_evidence" || pre.label === "emerging") out.push({ skillId: p.prerequisiteId, skillName: args.skillNames[p.prerequisiteId] ?? p.prerequisiteId, reason: { code: "prerequisite", prerequisiteName: s.name } });
      }
    } else if (days >= REVIEW_AFTER_DAYS[s.label]) {
      out.push({ skillId: s.skillId, skillName: s.name, reason: { code: "review_due", daysSince: Number.isFinite(days) ? days : 0, label: s.label } });
    }
  }
  const seen = new Set<string>();
  return out.filter((r) => { const k = `${r.skillId}:${r.reason.code}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
