import { getPool, withTx } from "@/lib/db";
import { ensureSubscription, getPlan } from "@/lib/repo/billing";
import { ForbiddenError, staffRole } from "@/lib/repo/admin";

export const PERIOD_DAYS = 30;

/** Only a full administrator may confirm payments; editors may not. Role is read from the database. */
async function requireAdmin(actorId: string) {
  if ((await staffRole(actorId)) !== "admin") throw new ForbiddenError();
}

export type RecordResult = { ok: true; periodEnd: Date } | { ok: false; error: "no_such_user" | "invalid" };

/**
 * Confirms one paid month for the account with this email. The new period starts when the current paid period ends
 * (so paying early never loses days), or now if there is none. Idempotency is the admin's responsibility: each call adds a month.
 */
export async function recordManualPayment(adminId: string, email: string, reference: string, now = new Date()): Promise<RecordResult> {
  await requireAdmin(adminId);
  const ref = reference.trim();
  if (!email.includes("@") || ref.length > 200) return { ok: false, error: "invalid" };
  const plan = await getPlan();
  const u = await getPool().query<{ id: string }>(`SELECT id FROM "user" WHERE lower(email)=lower($1)`, [email.trim()]);
  const userId = u.rows[0]?.id;
  if (!userId) return { ok: false, error: "no_such_user" };
  await ensureSubscription(userId, now);
  return withTx(async (c) => {
    const s = await c.query<{ current_period_end: Date | null; status: string }>(`SELECT current_period_end, status FROM subscriptions WHERE user_id=$1 FOR UPDATE`, [userId]);
    const cur = s.rows[0]?.current_period_end;
    const start = cur && cur > now && s.rows[0]!.status !== "canceled" ? cur : now;
    const periodEnd = new Date(start.getTime() + PERIOD_DAYS * 86_400_000);
    await c.query(
      `UPDATE subscriptions SET status='active', current_period_end=$2, provider='manual', updated_at=now() WHERE user_id=$1`,
      [userId, periodEnd],
    );
    await c.query(`INSERT INTO payment_records (user_id, amount_cents, currency, method, reference, period_end, recorded_by) VALUES ($1,$2,$3,'manual',$4,$5,$6)`, [userId, plan.priceCents, plan.currency, ref, periodEnd, adminId]);
    await c.query(`INSERT INTO audit_events (actor_id, action, metadata) VALUES ($1,'payment.manual_recorded',$2)`, [adminId, JSON.stringify({ userId, periodEnd: periodEnd.toISOString() })]);
    return { ok: true as const, periodEnd };
  });
}

export async function listRecentPayments(adminId: string, limit = 30) {
  await requireAdmin(adminId);
  const r = await getPool().query(
    `SELECT p.id, u.email, p.amount_cents, p.currency, p.reference, p.period_end, p.created_at
       FROM payment_records p JOIN "user" u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT $1`, [limit]);
  return r.rows.map((x) => ({ id: x.id as string, email: x.email as string, amountCents: x.amount_cents as number, currency: x.currency as string, reference: x.reference as string, periodEnd: new Date(x.period_end), createdAt: new Date(x.created_at) }));
}
