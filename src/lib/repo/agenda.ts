import { z } from "zod";
import { getPool } from "@/lib/db";
import { parseAgenda } from "@/lib/agenda/parse";
import { getChildAccess } from "@/lib/repo/children";

export interface AgendaItem { id: string; childId: string; title: string; dueOn: string | null; notes: string | null; status: "planned" | "done" | "skipped"; confirmed: boolean; source: "manual" | "extracted"; sourceLine: string | null; dateAmbiguous: boolean }
const map = (r: Record<string, unknown>): AgendaItem => ({
  id: r.id as string, childId: r.child_id as string, title: r.title as string, dueOn: r.due_on as string | null, notes: r.notes as string | null,
  status: r.status as AgendaItem["status"], confirmed: r.confirmed as boolean, source: r.source as AgendaItem["source"], sourceLine: r.source_line as string | null, dateAmbiguous: r.date_ambiguous as boolean,
});
const SELECT = `SELECT id, child_id, title, to_char(due_on,'YYYY-MM-DD') AS due_on, notes, status, confirmed, source, source_line, date_ambiguous FROM agenda_items`;
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().startsWith(s));
const ItemInput = z.object({ title: z.string().trim().min(1).max(160), dueOn: DateStr.nullable().optional(), notes: z.string().trim().max(500).nullable().optional() });

const canManage = async (ownerId: string, childId: string) => Boolean((await getChildAccess(ownerId, childId))?.canManage);

export async function addItem(ownerId: string, childId: string, input: unknown): Promise<boolean> {
  const p = ItemInput.safeParse(input);
  if (!p.success || !(await canManage(ownerId, childId))) return false;
  await getPool().query(`INSERT INTO agenda_items (owner_id, child_id, title, due_on, notes, confirmed) VALUES ($1,$2,$3,$4,$5,true)`, [ownerId, childId, p.data.title, p.data.dueOn ?? null, p.data.notes ?? null]);
  return true;
}

/** Extracted items are stored UNCONFIRMED. They are not shown as tasks and nothing is scheduled until a parent confirms each one. */
export async function proposeFromText(ownerId: string, childId: string, text: unknown): Promise<number | null> {
  const t = z.string().max(8000).safeParse(text);
  if (!t.success || !(await canManage(ownerId, childId))) return null;
  const items = parseAgenda(t.data);
  for (const it of items) {
    await getPool().query(
      `INSERT INTO agenda_items (owner_id, child_id, title, due_on, confirmed, source, source_line, date_ambiguous) VALUES ($1,$2,$3,$4,false,'extracted',$5,$6)`,
      [ownerId, childId, it.title, it.dueOn, it.sourceLine, it.ambiguous],
    );
  }
  return items.length;
}

export async function listItems(ownerId: string, childId: string): Promise<AgendaItem[] | null> {
  if (!(await canManage(ownerId, childId))) return null;
  const { rows } = await getPool().query(`${SELECT} WHERE owner_id=$1 AND child_id=$2 ORDER BY confirmed, due_on NULLS LAST, created_at`, [ownerId, childId]);
  return rows.map(map);
}

export async function confirmItem(ownerId: string, id: string, input: unknown): Promise<boolean> {
  const p = ItemInput.safeParse(input);
  if (!p.success || !z.string().uuid().safeParse(id).success) return false;
  const r = await getPool().query(`UPDATE agenda_items SET title=$3, due_on=$4, confirmed=true, date_ambiguous=false WHERE id=$1 AND owner_id=$2 RETURNING id`, [id, ownerId, p.data.title, p.data.dueOn ?? null]);
  return Boolean(r.rowCount);
}

export async function setStatus(ownerId: string, id: string, status: string): Promise<boolean> {
  const s = z.enum(["planned", "done", "skipped"]).safeParse(status);
  if (!s.success || !z.string().uuid().safeParse(id).success) return false;
  const r = await getPool().query(`UPDATE agenda_items SET status=$3, completed_at = CASE WHEN $3='done' THEN now() ELSE NULL END WHERE id=$1 AND owner_id=$2 AND confirmed RETURNING id`, [id, ownerId, s.data]);
  return Boolean(r.rowCount);
}

export async function removeItem(ownerId: string, id: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(id).success) return false;
  return Boolean((await getPool().query(`DELETE FROM agenda_items WHERE id=$1 AND owner_id=$2 RETURNING id`, [id, ownerId])).rowCount);
}
