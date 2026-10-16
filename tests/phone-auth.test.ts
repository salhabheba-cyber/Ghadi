import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { devOutbox, getSmsProvider, normalizePhone, phoneSignInAvailable } from "@/lib/providers/sms";
import { getEntitlement } from "@/lib/repo/billing";

const env = process.env as Record<string, string | undefined>;
const saved = { sms: env.SMS_PROVIDER, node: env.NODE_ENV };
beforeEach(() => { devOutbox.length = 0; env.SMS_PROVIDER = "console"; });
afterEach(() => { env.SMS_PROVIDER = saved.sms; env.NODE_ENV = saved.node; });

describe("phone number handling", () => {
  it("accepts E.164 and strips formatting; rejects everything else", () => {
    expect(normalizePhone("+961 70 123-456")).toBe("+96170123456");
    expect(normalizePhone("(+1) 202 555 0100")).toBe("+12025550100");
    for (const bad of ["70123456", "+0123456789", "+12", "abc", "+961 70 123 456 789 000 111", "", "+961'; DROP TABLE"]) expect(normalizePhone(bad)).toBeNull();
  });
  it("is unavailable by default and never active with the console provider in production", () => {
    env.SMS_PROVIDER = undefined;
    expect(phoneSignInAvailable()).toBe(false);
    env.SMS_PROVIDER = "console"; env.NODE_ENV = "production";
    expect(getSmsProvider()).toBeNull();
    env.SMS_PROVIDER = "twilio"; // no credentials
    expect(getSmsProvider()).toBeNull();
  });
});

describe("mobile sign-in with one-time code", () => {
  const phone = "+9617" + String(Math.floor(Math.random() * 9_000_000) + 1_000_000);

  it("creates a parent account on first verification, with a trial, and signs the same number in again", async () => {
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone } });
    const msg = devOutbox.at(-1)!;
    expect(msg.to).toBe(phone);
    const code = /(\d{6})/.exec(msg.body)![1]!;

    // wrong code is rejected and does not create anything
    await expect(auth.api.verifyPhoneNumber({ body: { phoneNumber: phone, code: code === "000000" ? "111111" : "000000" } })).rejects.toBeDefined();
    const none = await getPool().query(`SELECT 1 FROM "user" WHERE "phoneNumber" = $1`, [phone]);
    expect(none.rowCount).toBe(0);

    const ok = await auth.api.verifyPhoneNumber({ body: { phoneNumber: phone, code } });
    expect(ok.status).toBe(true);
    const row = (await getPool().query(`SELECT id, role, "phoneNumberVerified" AS v, email FROM "user" WHERE "phoneNumber" = $1`, [phone])).rows[0];
    expect(row).toMatchObject({ role: "parent", v: true });
    expect(row.email).toMatch(/@phone\.ghadi\.invalid$/);
    expect((await getEntitlement(row.id)).status).toBe("trialing");

    // a used code cannot be replayed
    await expect(auth.api.verifyPhoneNumber({ body: { phoneNumber: phone, code } })).rejects.toBeDefined();

    // second login with the same number reuses the account
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone } });
    const code2 = /(\d{6})/.exec(devOutbox.at(-1)!.body)![1]!;
    await auth.api.verifyPhoneNumber({ body: { phoneNumber: phone, code: code2 } });
    expect((await getPool().query(`SELECT 1 FROM "user" WHERE "phoneNumber" = $1`, [phone])).rowCount).toBe(1);
  });

  it("rejects a malformed number before any SMS is sent", async () => {
    await expect(auth.api.sendPhoneNumberOTP({ body: { phoneNumber: "not-a-number" } })).rejects.toBeDefined();
    expect(devOutbox.length).toBe(0);
  });
});
