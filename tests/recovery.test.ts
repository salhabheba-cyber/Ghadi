import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { devMailbox, getMailProvider, mailAvailable } from "@/lib/providers/mail";
import { makeParent, PASSWORD } from "./helpers";

const env = process.env as Record<string, string | undefined>;
const saved = { mail: env.MAIL_PROVIDER, node: env.NODE_ENV };
beforeEach(() => { devMailbox.length = 0; env.MAIL_PROVIDER = "console"; });
afterEach(() => { env.MAIL_PROVIDER = saved.mail; env.NODE_ENV = saved.node; });

describe("mail provider selection", () => {
  it("is off by default, refuses console in production, and needs credentials for resend", () => {
    env.MAIL_PROVIDER = undefined;
    expect(mailAvailable()).toBe(false);
    env.MAIL_PROVIDER = "console"; env.NODE_ENV = "production";
    expect(getMailProvider()).toBeNull();
    env.MAIL_PROVIDER = "resend";
    expect(getMailProvider()).toBeNull();
  });
});

describe("password reset", () => {
  it("emails a one-time link; the new password works, the old one does not, and the link cannot be reused", async () => {
    const u = await makeParent("reset");
    await auth.api.requestPasswordReset({ body: { email: u.email, redirectTo: "/en/reset-password" } });
    const mail = devMailbox.at(-1)!;
    expect(mail.to).toBe(u.email);
    const token = /reset-password\/([^?\s]+)/.exec(mail.text)?.[1];
    expect(token).toBeTruthy();

    const NEW = "a-brand-new-passphrase";
    await auth.api.resetPassword({ body: { newPassword: NEW, token: token! } });
    await expect(auth.api.signInEmail({ body: { email: u.email, password: PASSWORD } })).rejects.toBeDefined();
    await expect(auth.api.signInEmail({ body: { email: u.email, password: NEW } })).resolves.toBeDefined();
    await expect(auth.api.resetPassword({ body: { newPassword: "another-passphrase-1", token: token! } })).rejects.toBeDefined();
  });

  it("does not reveal whether an email has an account (unknown address: no error, no mail)", async () => {
    await expect(auth.api.requestPasswordReset({ body: { email: "nobody-here@example.test", redirectTo: "/en/reset-password" } })).resolves.toBeDefined();
    expect(devMailbox.length).toBe(0);
  });

  it("rejects a forged token", async () => {
    await expect(auth.api.resetPassword({ body: { newPassword: "whatever-long-enough", token: "forged-token-value" } })).rejects.toBeDefined();
  });
});
