/** Pure access decision for a subscription row. No I/O, so it is easy to test and cannot drift from the database. */
export type RecordedStatus = "trialing" | "active" | "past_due" | "canceled";
export type EffectiveStatus = "trialing" | "active" | "past_due" | "canceled" | "trial_expired" | "expired";

export interface SubscriptionRow {
  status: RecordedStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

export interface Entitlement {
  allowed: boolean;
  status: EffectiveStatus;
  /** Whole days left in the trial (rounded up), only while trialing. */
  trialDaysLeft: number | null;
  /** When paid access ends (active/canceled/past_due). */
  accessUntil: Date | null;
}

/** After a failed renewal the family keeps access for a short grace window while the payment provider retries. */
export const PAST_DUE_GRACE_DAYS = 3;
const DAY = 86_400_000;

export function entitlementFor(sub: SubscriptionRow | null, now = new Date()): Entitlement {
  if (!sub) return { allowed: false, status: "expired", trialDaysLeft: null, accessUntil: null };
  const t = now.getTime();
  const trialEnd = sub.trialEndsAt?.getTime() ?? null;
  const periodEnd = sub.currentPeriodEnd?.getTime() ?? null;

  if (sub.status === "trialing") {
    if (trialEnd !== null && t < trialEnd) {
      return { allowed: true, status: "trialing", trialDaysLeft: Math.max(1, Math.ceil((trialEnd - t) / DAY)), accessUntil: sub.trialEndsAt };
    }
    return { allowed: false, status: "trial_expired", trialDaysLeft: 0, accessUntil: sub.trialEndsAt };
  }
  if (sub.status === "active") {
    if (periodEnd !== null && t < periodEnd) return { allowed: true, status: "active", trialDaysLeft: null, accessUntil: sub.currentPeriodEnd };
    return { allowed: false, status: "expired", trialDaysLeft: null, accessUntil: sub.currentPeriodEnd };
  }
  if (sub.status === "past_due") {
    const graceEnd = periodEnd === null ? null : periodEnd + PAST_DUE_GRACE_DAYS * DAY;
    if (graceEnd !== null && t < graceEnd) return { allowed: true, status: "past_due", trialDaysLeft: null, accessUntil: new Date(graceEnd) };
    return { allowed: false, status: "expired", trialDaysLeft: null, accessUntil: sub.currentPeriodEnd };
  }
  // canceled: access continues until the end of the period that was already paid for.
  if (periodEnd !== null && t < periodEnd) return { allowed: true, status: "canceled", trialDaysLeft: null, accessUntil: sub.currentPeriodEnd };
  return { allowed: false, status: "expired", trialDaysLeft: null, accessUntil: sub.currentPeriodEnd };
}
