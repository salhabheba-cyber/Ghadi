import { getPool, withTx } from "@/lib/db";
import { isUuid } from "./util";

export type ContentKind = "lesson" | "practice_text";
export type ContentStatus = "draft" | "in_review" | "approved" | "retired";
export const STAFF_ROLES = ["content_editor", "admin"] as const;

export class ForbiddenError extends Error {
  constructor() {
    super("forbidden");
  }
}

/** Role is always read from the database, never trusted from the caller or the client. */
export async function staffRole(userId: string): Promise<"content_editor" | "admin" | null> {
  const r = await getPool().query<{ role: string }>(`SELECT role FROM "user" WHERE id=$1`, [userId]);
  const role = r.rows[0]?.role;
  return role === "admin" || role === "content_editor" ? role : null;
}

export interface ContentRow {
  kind: ContentKind;
  id: string;
  title: string;
  language: string;
  ageMin: number;
  ageMax: number;
  status: ContentStatus;
  version: number | null;
  license: string;
  source: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

export async function listContent(actorId: string): Promise<ContentRow[]> {
  if (!(await staffRole(actorId))) throw new ForbiddenError();
  const pool = getPool();
  const lessons = await pool.query(
    `SELECT lv.id, lv.title, lv.language, lv.age_min, lv.age_max, lv.status, lv.version, l.name AS license, s.title AS source,
            lv.approved_by, lv.approved_at
       FROM lesson_versions lv JOIN licenses l ON l.id=lv.license_id JOIN content_sources s ON s.id=lv.source_id
      ORDER BY lv.title, lv.version`,
  );
  const texts = await pool.query(
    `SELECT t.id, t.title, t.language, t.age_min, t.age_max, t.status, l.name AS license, s.title AS source
       FROM practice_texts t JOIN licenses l ON l.id=t.license_id JOIN content_sources s ON s.id=t.source_id
      ORDER BY t.title`,
  );
  return [
    ...lessons.rows.map((r): ContentRow => ({ kind: "lesson", id: r.id, title: r.title, language: r.language, ageMin: r.age_min, ageMax: r.age_max, status: r.status, version: r.version, license: r.license, source: r.source, approvedBy: r.approved_by, approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null })),
    ...texts.rows.map((r): ContentRow => ({ kind: "practice_text", id: r.id, title: r.title, language: r.language, ageMin: r.age_min, ageMax: r.age_max, status: r.status, version: null, license: r.license, source: r.source, approvedBy: null, approvedAt: null })),
  ];
}

/** Allowed workflow edges. Approval is the only edge that makes content child-visible. */
const EDGES: Record<ContentStatus, ContentStatus[]> = {
  draft: ["in_review", "retired"],
  in_review: ["draft", "approved", "retired"],
  approved: ["retired"],
  retired: ["draft"],
};

export function canTransition(from: ContentStatus, to: ContentStatus) {
  return EDGES[from].includes(to);
}

export type TransitionResult = "ok" | "not_found" | "invalid_transition" | "needs_admin";

/** Editors may submit and send back; only an admin may approve or retire approved content. */
export async function transitionContent(actorId: string, kind: ContentKind, id: string, to: ContentStatus): Promise<TransitionResult> {
  const role = await staffRole(actorId);
  if (!role) throw new ForbiddenError();
  if (!isUuid(id)) return "not_found";
  if ((to === "approved" || to === "retired") && role !== "admin") return "needs_admin";
  const table = kind === "lesson" ? "lesson_versions" : "practice_texts";
  return withTx(async (c) => {
    const cur = await c.query<{ status: ContentStatus }>(`SELECT status FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
    const from = cur.rows[0]?.status;
    if (!from) return "not_found";
    if (!canTransition(from, to)) return "invalid_transition";
    if (kind === "lesson") {
      if (to === "approved") await c.query(`UPDATE lesson_versions SET status='approved', approved_by=$2, approved_at=now() WHERE id=$1`, [id, actorId]);
      else await c.query(`UPDATE lesson_versions SET status=$2 WHERE id=$1`, [id, to]);
    } else {
      await c.query(`UPDATE practice_texts SET status=$2 WHERE id=$1`, [id, to]);
    }
    await c.query(`INSERT INTO audit_events (actor_id, action, metadata) VALUES ($1,'content.transition',$2)`, [actorId, JSON.stringify({ kind, id, from, to })]);
    return "ok";
  });
}
