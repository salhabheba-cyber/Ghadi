import { describe, expect, it } from "vitest";
import { getPool } from "@/lib/db";
import { ForbiddenError } from "@/lib/repo/admin";
import { getEntitlement } from "@/lib/repo/billing";
import { listRecentPayments, recordManualPayment } from "@/lib/repo/manual-payments";
import { makeParent } from "./helpers";

const asRole = async (role: string) => { const u = await makeParent(role); await getPool().query(`UPDATE "user" SET role=$2 WHERE id=$1`, [u.id, role]); return u; };
const DAY = 86_400_000;

describe("manual (Whish) payments", () => {
  it("only an admin can confirm a payment; parents and editors cannot", async () => {
    const payer = await makeParent("payer");
    for (const r of ["parent", "content_editor"]) {
      const u = await asRole(r);
      await expect(recordManualPayment(u.id, payer.email, "x")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listRecentPayments(u.id)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
  it("a payer cannot confirm their own payment", async () => {
    const p = await makeParent("self");
    await expect(recordManualPayment(p.id, p.email, "me")).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("extends access by 30 days from now, then stacks on the paid period, and is audited", async () => {
    const admin = await asRole("admin"), payer = await makeParent("pay2");
    await getEntitlement(payer.id); // starts the trial today
    const before = await getEntitlement(payer.id, new Date(Date.now() + 10 * DAY)); // trial over
    expect(before.allowed).toBe(false);
    const t0 = new Date(Date.now() + 10 * DAY);
    const r1 = await recordManualPayment(admin.id, payer.email.toUpperCase(), "whish-1", t0);
    expect(r1.ok && Math.round((r1.periodEnd.getTime() - t0.getTime()) / DAY)).toBe(30);
    expect((await getEntitlement(payer.id, new Date(t0.getTime() + DAY))).allowed).toBe(true);
    const t1 = new Date(t0.getTime() + 5 * DAY);
    const r2 = await recordManualPayment(admin.id, payer.email, "whish-2", t1);
    expect(r2.ok && Math.round((r2.periodEnd.getTime() - t0.getTime()) / DAY)).toBe(60);
    expect((await getEntitlement(payer.id, new Date(t0.getTime() + 31 * DAY))).allowed).toBe(true);
    expect((await getEntitlement(payer.id, new Date(t0.getTime() + 61 * DAY))).allowed).toBe(false);
    const list = await listRecentPayments(admin.id);
    expect(list.filter((x) => x.email === payer.email)).toHaveLength(2);
    const a = await getPool().query(`SELECT count(*)::int n FROM audit_events WHERE action='payment.manual_recorded' AND actor_id=$1`, [admin.id]);
    expect(a.rows[0].n).toBe(2);
  });
  it("rejects unknown emails and bad input", async () => {
    const admin = await asRole("admin");
    expect(await recordManualPayment(admin.id, "nobody@example.test", "")).toEqual({ ok: false, error: "no_such_user" });
    expect(await recordManualPayment(admin.id, "not-an-email", "")).toEqual({ ok: false, error: "invalid" });
  });
});
