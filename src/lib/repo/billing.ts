import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";
import { entitlementFor, type Entitlement, type RecordedStatus } from "@/lib/billing/entitlement";

export interface Plan { code: string; name: string; priceCents: number; currency: string; interval: "month" | "year"; trialDays: number }

export class EntitlementError extends Error {
  constructor(public entitlement: Entitlement) { super("subscription_required"); }
}

export async function getPlan(code = "monthly"): Promise<Plan> {
  const { rows } = await getPool().query(`SELECT code, name, price_cents, currency, interval, trial_days FROM plans WHERE code = $1 AND active`, [code]);
  const r = rows[0];
  if (!r) throw new Error("plan_missing");
  return { code: r.code, name: r.name, priceCents: r.price_cents, currency: r.currency, interval: r.interval, trialDays: r.trial_days };
}

/** Creates the trial the first time a parent is seen. ON CONFLICT keeps this idempotent: the trial can never be restarted. */
export async function ensureSubscription(userId: string, now = new Date()): Promise<void> {
  const plan = await getPlan();
  const ends = new Date(now.getTime() + plan.trialDays * 86_400_000);
  await getPool().query(
    `INSERT INTO subscriptions (id, user_id, plan_code, status, trial_started_at, trial_ends_at)
     VALUES ($1, $2, $3, 'trialing', $4, $5) ON CONFLICT (user_id) DO NOTHING`,
    [randomUUID(), userId, plan.code, now, ends],
  );
}

export async function getEntitlement(userId: string, now = new Date()): Promise<Entitlement & { recorded: RecordedStatus }> {
  await ensureSubscription(userId, now);
  const { rows } = await getPool().query(`SELECT status, trial_ends_at, current_period_end FROM subscriptions WHERE user_id = $1`, [userId]);
  const r = rows[0];
  const e = entitlementFor(r ? { status: r.status, trialEndsAt: r.trial_ends_at, currentPeriodEnd: r.current_period_end } : null, now);
  return { ...e, recorded: r?.status ?? "canceled" };
}

/** Server-side gate used before any lesson is started or continued. */
export async function requireEntitlement(userId: string): Promise<void> {
  const e = await getEntitlement(userId);
  if (!e.allowed) throw new EntitlementError(e);
}

/**
 * Records a paid period. Intended to be called ONLY from a verified payment-provider webhook (not built yet:
 * no provider is connected). It is never reachable from a browser request.
 */
export async function recordPayment(userId: string, periodEnd: Date, ref?: { provider: string; customer?: string; subscription?: string }): Promise<void> {
  await ensureSubscription(userId);
  await getPool().query(
    `UPDATE subscriptions SET status = 'active', current_period_end = $2, provider = COALESCE($3, provider),
       provider_customer_ref = COALESCE($4, provider_customer_ref), provider_subscription_ref = COALESCE($5, provider_subscription_ref), updated_at = now()
     WHERE user_id = $1`,
    [userId, periodEnd, ref?.provider ?? null, ref?.customer ?? null, ref?.subscription ?? null],
  );
}

export async function recordCancellation(userId: string): Promise<void> {
  await getPool().query(`UPDATE subscriptions SET status = 'canceled', updated_at = now() WHERE user_id = $1`, [userId]);
}
