import { describe, expect, it } from "vitest";
import { getPool } from "@/lib/db";
import { ForbiddenError } from "@/lib/repo/admin";
import { recordManualPayment } from "@/lib/repo/manual-payments";
import { ContactInput, createSupportRequest, getStats, listSupportRequests, openSupportCount, resolveSupportRequest } from "@/lib/repo/support";
import { KB, findAnswer } from "@/lib/support/kb";
import { makeParent } from "./helpers";

const asRole = async (role: string) => { const u = await makeParent(role); await getPool().query(`UPDATE "user" SET role=$2 WHERE id=$1`, [u.id, role]); return u; };

describe("help bot knowledge base", () => {
  it("answers common questions in all three languages", () => {
    expect(findAnswer("How much does it cost after the free trial?")?.id).toMatch(/trial|price/);
    expect(findAnswer("how do I pay with whish")?.id).toBe("pay");
    expect(findAnswer("كيف ادفع")?.id).toBe("pay");
    expect(findAnswer("Comment ajouter un enfant ?")?.id).toBe("child");
    expect(findAnswer("is the teacher a real person?")?.id).toBe("teacher");
  });
  it("does not match short words inside other words, and says nothing for unknown questions", () => {
    expect(findAnswer("I am happy")).toBeNull();
    expect(findAnswer("my cat likes the moon")).toBeNull();
  });
  it("has an answer in every language for every entry and never promises features that do not exist", () => {
    for (const e of KB) for (const l of ["en", "fr", "ar"] as const) expect(e.answer[l].length).toBeGreaterThan(20);
    const all = KB.map((e) => e.answer.en).join(" ").toLowerCase();
    expect(all).not.toMatch(/records your child's voice|diagnos|guarantee/);
  });
});

describe("support requests and admin dashboard", () => {
  it("validates input", () => {
    expect(ContactInput.safeParse({ email: "nope", message: "hello there" }).success).toBe(false);
    expect(ContactInput.safeParse({ email: "a@b.co", message: "hi" }).success).toBe(false);
    expect(ContactInput.safeParse({ email: "a@b.co", message: "x".repeat(2001) }).success).toBe(false);
    expect(ContactInput.safeParse({ email: "a@b.co", message: "I need help" }).success).toBe(true);
  });
  it("only an admin can read, count or resolve messages and see stats", async () => {
    for (const r of ["parent", "content_editor"]) {
      const u = await asRole(r);
      await expect(listSupportRequests(u.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(openSupportCount(u.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getStats(u.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(resolveSupportRequest(u.id, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
  it("a visitor message reaches the admin inbox and can be resolved", async () => {
    const admin = await asRole("admin");
    const before = await openSupportCount(admin.id);
    const id = await createSupportRequest({ email: "visitor@example.test", message: "My payment is not confirmed", locale: "en" }, null);
    expect(await openSupportCount(admin.id)).toBe(before + 1);
    expect((await listSupportRequests(admin.id)).find((r) => r.id === id)?.signedIn).toBe(false);
    expect(await resolveSupportRequest(admin.id, id)).toBe(true);
    expect(await resolveSupportRequest(admin.id, id)).toBe(false);
    expect(await openSupportCount(admin.id)).toBe(before);
  });
  it("stats count sign-ups, trials and confirmed payments", async () => {
    const admin = await asRole("admin");
    const a = await getStats(admin.id);
    const p = await makeParent("stat");
    await getPool().query(`INSERT INTO subscriptions (id, user_id, plan_code, status, trial_started_at, trial_ends_at) VALUES (gen_random_uuid()::text,$1,'monthly','trialing',now(),now()+interval '7 days')`, [p.id]);
    await recordManualPayment(admin.id, p.email, "stats-test");
    const b = await getStats(admin.id);
    expect(b.signupsTotal).toBe(a.signupsTotal + 1);
    expect(b.payments30d).toBe(a.payments30d + 1);
    expect(b.revenue30dCents).toBe(a.revenue30dCents + 500);
    expect(b.paying).toBe(a.paying + 1);
  });
});
