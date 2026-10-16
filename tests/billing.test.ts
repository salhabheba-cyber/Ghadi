import { describe, expect, it } from "vitest";
import { entitlementFor, PAST_DUE_GRACE_DAYS } from "@/lib/billing/entitlement";
import { EntitlementError, ensureSubscription, getEntitlement, getPlan, recordCancellation, recordPayment, requireEntitlement } from "@/lib/repo/billing";
import { getPool } from "@/lib/db";
import { ensureSeed, lessonBySlug, makeChild, makeParent } from "./helpers";
import { startSession } from "@/lib/repo/sessions";

const DAY = 86_400_000;
const d = (iso: string) => new Date(iso);

describe("entitlementFor (pure)", () => {
  const now = d("2026-10-15T12:00:00Z");
  it("allows during the trial and counts days (rounded up)", () => {
    const e = entitlementFor({ status: "trialing", trialEndsAt: new Date(now.getTime() + 2.2 * DAY), currentPeriodEnd: null }, now);
    expect(e).toMatchObject({ allowed: true, status: "trialing", trialDaysLeft: 3 });
  });
  it("blocks once the trial has ended, even though the stored status is still 'trialing'", () => {
    const e = entitlementFor({ status: "trialing", trialEndsAt: new Date(now.getTime() - 1000), currentPeriodEnd: null }, now);
    expect(e).toMatchObject({ allowed: false, status: "trial_expired" });
  });
  it("active access ends at the paid period end", () => {
    expect(entitlementFor({ status: "active", trialEndsAt: null, currentPeriodEnd: new Date(now.getTime() + DAY) }, now).allowed).toBe(true);
    expect(entitlementFor({ status: "active", trialEndsAt: null, currentPeriodEnd: new Date(now.getTime() - 1) }, now).allowed).toBe(false);
  });
  it("canceled keeps access to the end of the paid period only", () => {
    expect(entitlementFor({ status: "canceled", trialEndsAt: null, currentPeriodEnd: new Date(now.getTime() + DAY) }, now)).toMatchObject({ allowed: true, status: "canceled" });
    expect(entitlementFor({ status: "canceled", trialEndsAt: null, currentPeriodEnd: new Date(now.getTime() - DAY) }, now).allowed).toBe(false);
  });
  it("past_due has a short grace window then blocks", () => {
    const end = new Date(now.getTime() - 1 * DAY);
    expect(entitlementFor({ status: "past_due", trialEndsAt: null, currentPeriodEnd: end }, now).allowed).toBe(true);
    expect(entitlementFor({ status: "past_due", trialEndsAt: null, currentPeriodEnd: new Date(now.getTime() - (PAST_DUE_GRACE_DAYS + 1) * DAY) }, now).allowed).toBe(false);
  });
  it("a missing subscription never grants access", () => expect(entitlementFor(null, now).allowed).toBe(false));
});

describe("subscription records", () => {
  it("plan is 7-day trial then US$5 per month", async () => {
    expect(await getPlan()).toMatchObject({ priceCents: 500, currency: "USD", interval: "month", trialDays: 7 });
  });

  it("starts a 7-day trial on first sight and never restarts it", async () => {
    const u = await makeParent("trial");
    const t0 = d("2026-10-01T10:00:00Z");
    await ensureSubscription(u.id, t0);
    const first = await getEntitlement(u.id, t0);
    expect(first).toMatchObject({ allowed: true, status: "trialing", trialDaysLeft: 7 });
    await ensureSubscription(u.id, d("2026-10-05T10:00:00Z")); // would extend the trial if it were not idempotent
    expect((await getEntitlement(u.id, d("2026-10-05T10:00:00Z"))).trialDaysLeft).toBe(3);
    expect((await getEntitlement(u.id, d("2026-10-08T10:00:01Z"))).allowed).toBe(false);
  });

  it("subscription activation, cancellation and gate", async () => {
    const u = await makeParent("pay");
    await ensureSubscription(u.id, d("2026-01-01T00:00:00Z")); // trial long over
    await expect(requireEntitlement(u.id)).rejects.toBeInstanceOf(EntitlementError);
    await recordPayment(u.id, new Date(Date.now() + 30 * DAY), { provider: "test" });
    await expect(requireEntitlement(u.id)).resolves.toBeUndefined();
    await recordCancellation(u.id);
    expect((await getEntitlement(u.id)).status).toBe("canceled"); // still inside the paid period
    await getPool().query(`UPDATE subscriptions SET current_period_end = now() - interval '1 day' WHERE user_id = $1`, [u.id]);
    await expect(requireEntitlement(u.id)).rejects.toBeInstanceOf(EntitlementError);
  });
});

describe("server-side lesson gate", () => {
  it("a lapsed trial cannot start a lesson; a payment re-enables it; the trial window allows it", async () => {
    await ensureSeed();
    const p = await makeParent("gate");
    const child = await makeChild(p.id);
    const lessonId = await lessonBySlug(child.id, "counting-to-five");
    expect(await startSession(p.id, child.id, lessonId)).not.toBeNull(); // inside the trial
    await getPool().query(`UPDATE subscriptions SET trial_ends_at = now() - interval '1 minute' WHERE user_id = $1`, [p.id]);
    await expect(startSession(p.id, child.id, lessonId)).rejects.toBeInstanceOf(EntitlementError);
    await recordPayment(p.id, new Date(Date.now() + 30 * DAY));
    expect(await startSession(p.id, child.id, lessonId)).not.toBeNull();
  });
});
