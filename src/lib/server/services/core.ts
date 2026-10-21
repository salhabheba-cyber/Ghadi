import type { Db } from "../db/client";
import { hashToken, newToken } from "../auth/crypto";

export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface AuditInput {
  actorKind: "student" | "staff" | "system";
  actorId?: string | null;
  schoolId?: string | null;
  action: string;
  targetKind?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}

export async function audit(db: Db, e: AuditInput): Promise<void> {
  await db.query(
    `INSERT INTO audit_events (actor_kind, actor_id, school_id, action, target_kind, target_id, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      e.actorKind,
      e.actorId ?? null,
      e.schoolId ?? null,
      e.action,
      e.targetKind ?? null,
      e.targetId ?? null,
      JSON.stringify(e.detail ?? {}),
    ],
  );
}

/** Sliding-window limiter stored in Postgres so it holds across server instances and restarts. */
export async function rateLimitDb(
  db: Db,
  key: string,
  limit: number,
  windowSec: number,
): Promise<void> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM rate_events WHERE key = $1 AND at > now() - make_interval(secs => $2)`,
    [key, windowSec],
  );
  if ((r.rows[0]?.n ?? 0) >= limit) {
    throw new ServiceError(
      429,
      "rate-limited",
      "Too many tries. Please wait a little and try again.",
      { retryAfterSec: windowSec },
    );
  }
  await db.query("INSERT INTO rate_events (key) VALUES ($1)", [key]);
  if (Math.random() < 0.02)
    await db.query("DELETE FROM rate_events WHERE at < now() - interval '1 day'");
}

export type SessionKind = "student" | "staff";

export async function createSession(
  db: Db,
  kind: SessionKind,
  subjectId: string,
  ttlDays: number,
): Promise<string> {
  const token = newToken();
  await db.query(
    `INSERT INTO sessions (kind, subject_id, token_hash, expires_at) VALUES ($1,$2,$3, now() + make_interval(days => $4))`,
    [kind, subjectId, hashToken(token), ttlDays],
  );
  return token;
}

export async function resolveSession(
  db: Db,
  kind: SessionKind,
  token: string | undefined,
): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const r = await db.query<{ subject_id: string; stale: boolean }>(
    `SELECT subject_id, last_used_at < now() - interval '10 minutes' AS stale
       FROM sessions WHERE token_hash = $1 AND kind = $2 AND expires_at > now()`,
    [hashToken(token), kind],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.stale)
    await db.query("UPDATE sessions SET last_used_at = now() WHERE token_hash = $1", [
      hashToken(token),
    ]);
  return row.subject_id;
}

export async function destroySession(db: Db, token: string | undefined): Promise<void> {
  if (token) await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

export async function destroySubjectSessions(
  db: Db,
  kind: SessionKind,
  subjectId: string,
): Promise<void> {
  await db.query("DELETE FROM sessions WHERE kind = $1 AND subject_id = $2", [kind, subjectId]);
}

export function cleanText(input: unknown, min: number, max: number, label: string): string {
  if (typeof input !== "string") throw new ServiceError(400, "invalid", `${label} is required.`);
  const s = input
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < min || s.length > max) {
    throw new ServiceError(
      400,
      "invalid",
      min <= 1
        ? `${label} must be at most ${max} characters.`
        : `${label} must be ${min}–${max} characters.`,
    );
  }
  return s;
}

/** Lower-cased, accent-stripped, space-collapsed form used only to detect duplicate registrations. */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
