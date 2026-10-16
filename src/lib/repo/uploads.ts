import { createHash } from "node:crypto";
import { z } from "zod";
import { getPool, withTx } from "@/lib/db";
import { getOcrProvider, UNCERTAIN_BELOW } from "@/lib/providers/ocr";
import { requireEntitlement } from "@/lib/repo/billing";
import { getChildAccess } from "@/lib/repo/children";
import { safeDisplayName, validateUpload, type UploadRejection } from "@/lib/uploads/validate";

export const MAX_UPLOADS_PER_USER = 40;
export const MAX_BYTES_PER_USER = 50 * 1024 * 1024;

export interface UploadRow { id: string; originalName: string; mime: string; sizeBytes: number; language: "en" | "fr" | "ar"; status: "processing" | "needs_review" | "failed" | "confirmed"; childId: string | null; errorCode: string | null; createdAt: Date }
const map = (r: Record<string, unknown>): UploadRow => ({
  id: r.id as string, originalName: r.original_name as string, mime: r.mime as string, sizeBytes: r.size_bytes as number, language: r.language as UploadRow["language"],
  status: r.status as UploadRow["status"], childId: r.child_id as string | null, errorCode: r.error_code as string | null, createdAt: r.created_at as Date,
});

export type CreateUploadResult = { ok: true; id: string } | { ok: false; reason: UploadRejection | "quota" | "child_not_found" | "bad_language" };

export async function createUpload(ownerId: string, file: { name: string; bytes: Buffer }, opts: { language: string; childId?: string | null }): Promise<CreateUploadResult> {
  const lang = z.enum(["en", "fr", "ar"]).safeParse(opts.language);
  if (!lang.success) return { ok: false, reason: "bad_language" };
  await requireEntitlement(ownerId);
  const v = validateUpload(file.bytes);
  if (!v.ok) return v;
  if (opts.childId && !(await getChildAccess(ownerId, opts.childId))?.canManage) return { ok: false, reason: "child_not_found" };
  const q = await getPool().query(`SELECT count(*)::int AS n, coalesce(sum(size_bytes),0)::bigint AS bytes FROM uploads WHERE owner_id=$1`, [ownerId]);
  if (q.rows[0].n >= MAX_UPLOADS_PER_USER || Number(q.rows[0].bytes) + file.bytes.length > MAX_BYTES_PER_USER) return { ok: false, reason: "quota" };
  const sha = createHash("sha256").update(file.bytes).digest("hex");
  const id = await withTx(async (c) => {
    const r = await c.query(
      `INSERT INTO uploads (owner_id, child_id, original_name, mime, size_bytes, sha256, language) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ownerId, opts.childId ?? null, safeDisplayName(file.name), v.mime, file.bytes.length, sha, lang.data],
    );
    await c.query(`INSERT INTO upload_blobs (upload_id, data) VALUES ($1,$2)`, [r.rows[0].id, file.bytes]);
    await c.query(`INSERT INTO audit_events (actor_id, child_id, action, metadata) VALUES ($1,$2,'upload.created',$3)`, [ownerId, opts.childId ?? null, JSON.stringify({ mime: v.mime, size: file.bytes.length })]);
    return r.rows[0].id as string;
  });
  return { ok: true, id };
}

/** OCR runs outside the request. No queue is deployed yet, so it is a plain async task; stale 'processing' rows are reported as failed and can be retried. */
export async function processUpload(uploadId: string): Promise<void> {
  const pool = getPool();
  const row = (await pool.query(`SELECT u.mime, u.language, b.data FROM uploads u JOIN upload_blobs b ON b.upload_id=u.id WHERE u.id=$1`, [uploadId])).rows[0];
  if (!row) return;
  const ocr = getOcrProvider();
  const fail = (code: string) => pool.query(`UPDATE uploads SET status='failed', error_code=$2, updated_at=now() WHERE id=$1`, [uploadId, code]);
  if (!ocr) { await pool.query(`UPDATE uploads SET status='needs_review', ocr_provider=NULL, updated_at=now() WHERE id=$1`, [uploadId]); return; } // manual transcription
  try {
    if (!(await ocr.supports(row.language))) { await pool.query(`UPDATE uploads SET status='needs_review', ocr_provider=NULL, error_code='ocr_language_unsupported', updated_at=now() WHERE id=$1`, [uploadId]); return; }
    const r = await ocr.recognize(row.data as Buffer, row.mime, row.language);
    const uncertain = r.words.filter((w) => w.conf < UNCERTAIN_BELOW).map((w) => w.text);
    await withTx(async (c) => {
      await c.query(
        `INSERT INTO extracted_documents (upload_id, provider, text_original, uncertain_words, mean_confidence) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (upload_id) DO UPDATE SET provider=$2, text_original=$3, uncertain_words=$4, mean_confidence=$5`,
        [uploadId, r.provider, r.text, JSON.stringify([...new Set(uncertain)]), r.meanConfidence === null ? null : r.meanConfidence.toFixed(2)],
      );
      await c.query(`UPDATE uploads SET status='needs_review', ocr_provider=$2, error_code=NULL, updated_at=now() WHERE id=$1`, [uploadId, r.provider]);
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "ocr failed", name: (e as Error)?.name }));
    await fail("ocr_failed");
  }
}

export async function listUploads(ownerId: string): Promise<UploadRow[]> {
  const { rows } = await getPool().query(`SELECT * FROM uploads WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50`, [ownerId]);
  return rows.map(map);
}

export interface UploadDetail extends UploadRow { text: string; uncertainWords: string[]; meanConfidence: number | null; provider: string | null }
export async function getUpload(ownerId: string, id: string): Promise<UploadDetail | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const { rows } = await getPool().query(
    `SELECT u.*, e.text_original, e.uncertain_words, e.mean_confidence::float AS mean_confidence, e.provider
     FROM uploads u LEFT JOIN extracted_documents e ON e.upload_id=u.id WHERE u.id=$1 AND u.owner_id=$2`, [id, ownerId]);
  const r = rows[0];
  if (!r) return null;
  // A row stuck in 'processing' for over 3 minutes means the worker was lost (e.g. a restart): surface that honestly.
  const stale = r.status === "processing" && Date.now() - new Date(r.updated_at).getTime() > 3 * 60_000;
  return { ...map(r), status: stale ? "failed" : r.status, errorCode: stale ? "stalled" : r.error_code, text: r.text_original ?? "", uncertainWords: r.uncertain_words ?? [], meanConfidence: r.mean_confidence, provider: r.provider };
}

export async function getUploadBytes(ownerId: string, id: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const { rows } = await getPool().query(`SELECT u.mime, b.data FROM uploads u JOIN upload_blobs b ON b.upload_id=u.id WHERE u.id=$1 AND u.owner_id=$2`, [id, ownerId]);
  return rows[0] ?? null;
}

export async function retryUpload(ownerId: string, id: string): Promise<boolean> {
  const r = await getPool().query(`UPDATE uploads SET status='processing', error_code=NULL, updated_at=now() WHERE id=$1 AND owner_id=$2 AND status IN ('failed','processing') RETURNING id`, [id, ownerId]);
  if (r.rowCount) void processUpload(id);
  return Boolean(r.rowCount);
}

export async function deleteUpload(ownerId: string, id: string): Promise<boolean> {
  const r = await getPool().query(`DELETE FROM uploads WHERE id=$1 AND owner_id=$2 RETURNING id`, [id, ownerId]);
  if (r.rowCount) await getPool().query(`INSERT INTO audit_events (actor_id, action) VALUES ($1,'upload.deleted')`, [ownerId]);
  return Boolean(r.rowCount);
}

const Confirm = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(600),
  childId: z.string().uuid(),
  rightsConfirmed: z.literal(true),
});

/** Turns the parent-reviewed text into a private practice text for one child. The OCR output is never used unreviewed. */
export async function confirmUpload(ownerId: string, id: string, input: unknown): Promise<{ ok: true; textId: string } | { ok: false; reason: "invalid" | "not_found" | "child_not_found" | "not_ready" }> {
  const p = Confirm.safeParse(input);
  if (!p.success) return { ok: false, reason: "invalid" };
  const up = await getUpload(ownerId, id);
  if (!up) return { ok: false, reason: "not_found" };
  if (up.status !== "needs_review") return { ok: false, reason: "not_ready" };
  if (!(await getChildAccess(ownerId, p.data.childId))?.canManage) return { ok: false, reason: "child_not_found" };
  const textId = await withTx(async (c) => {
    const r = await c.query(
      `INSERT INTO family_texts (owner_id, child_id, upload_id, title, body, language, rights_confirmed) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
      [ownerId, p.data.childId, id, p.data.title, p.data.body, up.language],
    );
    await c.query(`UPDATE uploads SET status='confirmed', child_id=$2, updated_at=now() WHERE id=$1`, [id, p.data.childId]);
    await c.query(`INSERT INTO audit_events (actor_id, child_id, action) VALUES ($1,$2,'upload.confirmed')`, [ownerId, p.data.childId]);
    return r.rows[0].id as string;
  });
  return { ok: true, textId };
}

export async function deleteFamilyText(ownerId: string, childId: string, textId: string): Promise<boolean> {
  const r = await getPool().query(`DELETE FROM family_texts WHERE id=$1 AND child_id=$2 AND owner_id=$3 RETURNING id`, [textId, childId, ownerId]);
  return Boolean(r.rowCount);
}
