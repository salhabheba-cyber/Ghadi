import { z } from "zod";
import { getPool } from "@/lib/db";
import { compareDictation, type DictationResult } from "@/lib/practice/dictation";
import { requireEntitlement } from "@/lib/repo/billing";
import { getChildAccess } from "@/lib/repo/children";

export interface PracticeText { id: string; slug: string; kind: "dictation" | "reading"; language: "en" | "fr" | "ar"; title: string; body: string; origin: "library" | "family" }

/** Approved library texts in the child's language/age band, plus the family's own confirmed texts for this child. */
export async function listTexts(guardianId: string, childId: string, kind: "dictation" | "reading"): Promise<PracticeText[] | null> {
  const a = await getChildAccess(guardianId, childId);
  if (!a) return null;
  const lib = await getPool().query(
    `SELECT id, slug, kind, language, title, body, 'library' AS origin FROM practice_texts
     WHERE kind=$1 AND status='approved' AND language=$2 AND age_min <= $3 AND age_max >= $3 ORDER BY slug`,
    [kind, a.child.lessonLanguage, ageOf(a.child.ageBand)],
  );
  const fam = await getPool().query(
    `SELECT id, 'family-' || id AS slug, $1::text AS kind, language, title, body, 'family' AS origin FROM family_texts WHERE child_id=$2 ORDER BY created_at DESC`,
    [kind, childId],
  );
  return [...fam.rows, ...lib.rows];
}
const ageOf = (band: string) => parseInt(band.split("-")[0]!, 10);

export async function getText(guardianId: string, childId: string, textId: string, kind: "dictation" | "reading"): Promise<PracticeText | null> {
  const list = await listTexts(guardianId, childId, kind);
  return list?.find((t) => t.id === textId) ?? null;
}

export async function submitDictation(guardianId: string, childId: string, textId: string, typed: unknown): Promise<DictationResult | null> {
  const text = z.string().max(1000).safeParse(typed);
  if (!text.success) return null;
  await requireEntitlement(guardianId);
  const t = await getText(guardianId, childId, textId, "dictation");
  if (!t) return null;
  const result = compareDictation(t.body, text.data, t.language);
  await getPool().query(
    `INSERT INTO dictation_attempts (child_id, text_id, family_text_id, typed_text, accuracy, result) VALUES ($1,$2,$3,$4,$5,$6)`,
    [childId, t.origin === "library" ? t.id : null, t.origin === "family" ? t.id : null, text.data, result.accuracy.toFixed(3), JSON.stringify(result)],
  );
  return result;
}

const Marks = z.array(z.object({ i: z.number().int().min(0).max(200), status: z.enum(["ok", "help", "skipped"]) })).max(200);

/** The grown-up listens and marks words. No speech recognition is involved, and nothing here claims pronunciation accuracy. */
export async function submitReading(guardianId: string, childId: string, textId: string, marks: unknown): Promise<boolean> {
  const parsed = Marks.safeParse(marks);
  if (!parsed.success) return false;
  await requireEntitlement(guardianId);
  const t = await getText(guardianId, childId, textId, "reading");
  if (!t) return false;
  const wordCount = t.body.trim().split(/\s+/).length;
  if (parsed.data.some((m) => m.i >= wordCount)) return false;
  await getPool().query(`INSERT INTO reading_attempts (child_id, text_id, family_text_id, word_marks) VALUES ($1,$2,$3,$4)`,
    [childId, t.origin === "library" ? t.id : null, t.origin === "family" ? t.id : null, JSON.stringify(parsed.data)]);
  return true;
}

export async function practiceSummary(guardianId: string, childId: string) {
  const a = await getChildAccess(guardianId, childId);
  if (!a?.canViewProgress) return null;
  const d = await getPool().query(
    `SELECT COALESCE(t.title, f.title, '(deleted text)') AS title, d.accuracy::float AS accuracy, d.created_at FROM dictation_attempts d
     LEFT JOIN practice_texts t ON t.id=d.text_id LEFT JOIN family_texts f ON f.id=d.family_text_id WHERE d.child_id=$1 ORDER BY d.created_at DESC LIMIT 10`, [childId]);
  const r = await getPool().query(
    `SELECT COALESCE(t.title, f.title, '(deleted text)') AS title, r.word_marks, r.created_at FROM reading_attempts r
     LEFT JOIN practice_texts t ON t.id=r.text_id LEFT JOIN family_texts f ON f.id=r.family_text_id WHERE r.child_id=$1 ORDER BY r.created_at DESC LIMIT 10`, [childId]);
  return { dictation: d.rows as { title: string; accuracy: number; created_at: Date }[], reading: r.rows as { title: string; word_marks: { i: number; status: string }[]; created_at: Date }[] };
}
