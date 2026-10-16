import { z } from "zod";
import { getPool } from "@/lib/db";
import { ForbiddenError, staffRole } from "@/lib/repo/admin";
import { isUuid } from "@/lib/repo/util";

export const ContactInput = z.object({
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(5).max(2000),
  locale: z.enum(["en", "fr", "ar"]).default("en"),
});

export async function createSupportRequest(input: z.infer<typeof ContactInput>, userId: string | null): Promise<string> {
  const r = await getPool().query<{ id: string }>(
    `INSERT INTO support_requests (user_id, email, message, locale) VALUES ($1,$2,$3,$4) RETURNING id`,
    [userId, input.email, input.message, input.locale],
  );
  return r.rows[0]!.id;
}

async function requireAdmin(id: string) {
  if ((await staffRole(id)) !== "admin") throw new ForbiddenError();
}

export interface SupportRow { id: string; email: string; message: string; status: "open" | "resolved"; createdAt: Date; signedIn: boolean }

export async function listSupportRequests(adminId: string, limit = 50): Promise<SupportRow[]> {
  await requireAdmin(adminId);
  const r = await getPool().query(`SELECT id, email, message, status, created_at, user_id FROM support_requests ORDER BY (status='open') DESC, created_at DESC LIMIT $1`, [limit]);
  return r.rows.map((x) => ({ id: x.id, email: x.email, message: x.message, status: x.status, createdAt: new Date(x.created_at), signedIn: !!x.user_id }));
}

export async function openSupportCount(adminId: string): Promise<number> {
  await requireAdmin(adminId);
  return (await getPool().query(`SELECT count(*)::int n FROM support_requests WHERE status='open'`)).rows[0].n;
}

export async function resolveSupportRequest(adminId: string, id: string): Promise<boolean> {
  await requireAdmin(adminId);
  if (!isUuid(id)) return false;
  const r = await getPool().query(`UPDATE support_requests SET status='resolved', resolved_at=now(), resolved_by=$2 WHERE id=$1 AND status='open'`, [id, adminId]);
  return (r.rowCount ?? 0) > 0;
}

export interface Stats {
  signupsTotal: number; signups7d: number; signups30d: number;
  onTrial: number; trialEndedUnpaid: number; paying: number; lapsed: number;
  children: number; payments30d: number; revenue30dCents: number; revenueAllCents: number;
  perDay: { day: string; n: number }[];
}

/** Aggregate counts only: no child data and no message content. Admin only. */
export async function getStats(adminId: string, now = new Date()): Promise<Stats> {
  await requireAdmin(adminId);
  const q = (sql: string, p: unknown[] = []) => getPool().query(sql, p);
  const [u, s, c, p, d] = await Promise.all([
    q(`SELECT count(*)::int total, count(*) FILTER (WHERE "createdAt" > $1::timestamptz - interval '7 days')::int d7, count(*) FILTER (WHERE "createdAt" > $1::timestamptz - interval '30 days')::int d30 FROM "user" WHERE role='parent'`, [now]),
    q(`SELECT count(*) FILTER (WHERE status='trialing' AND trial_ends_at > $1)::int trial,
              count(*) FILTER (WHERE status='trialing' AND trial_ends_at <= $1)::int ended,
              count(*) FILTER (WHERE status IN ('active','past_due') AND current_period_end > $1)::int paying,
              count(*) FILTER (WHERE status IN ('active','past_due','canceled') AND current_period_end <= $1)::int lapsed FROM subscriptions`, [now]),
    q(`SELECT count(*)::int n FROM child_profiles`),
    q(`SELECT count(*) FILTER (WHERE created_at > $1::timestamptz - interval '30 days')::int n30, coalesce(sum(amount_cents) FILTER (WHERE created_at > $1::timestamptz - interval '30 days'),0)::int r30, coalesce(sum(amount_cents),0)::int rall FROM payment_records`, [now]),
    q(`SELECT to_char(date_trunc('day',"createdAt"),'YYYY-MM-DD') AS day, count(*)::int n FROM "user" WHERE role='parent' AND "createdAt" > $1::timestamptz - interval '14 days' GROUP BY 1 ORDER BY 1 DESC`, [now]),
  ]);
  return {
    signupsTotal: u.rows[0].total, signups7d: u.rows[0].d7, signups30d: u.rows[0].d30,
    onTrial: s.rows[0].trial, trialEndedUnpaid: s.rows[0].ended, paying: s.rows[0].paying, lapsed: s.rows[0].lapsed,
    children: c.rows[0].n, payments30d: p.rows[0].n30, revenue30dCents: p.rows[0].r30, revenueAllCents: p.rows[0].rall,
    perDay: d.rows,
  };
}
