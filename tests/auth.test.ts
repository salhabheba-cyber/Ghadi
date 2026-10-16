import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { PASSWORD, makeParent } from "./helpers";

describe("authentication", () => {
  it("signs up, signs in, and rejects a wrong password", async () => {
    const p = await makeParent("auth");
    const ok = await auth.api.signInEmail({ body: { email: p.email, password: PASSWORD } });
    expect(ok.user.id).toBe(p.id);
    await expect(auth.api.signInEmail({ body: { email: p.email, password: "wrong-password-123" } })).rejects.toThrow();
  });

  it("enforces a minimum password length", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: `short-${randomUUID().slice(0, 6)}@example.test`, password: "short", name: "x" } }),
    ).rejects.toThrow();
  });

  it("does not store the password in plain text", async () => {
    const p = await makeParent("hash");
    const r = await getPool().query<{ password: string }>('SELECT password FROM account WHERE "userId"=$1', [p.id]);
    expect(r.rows[0]!.password).toBeTruthy();
    expect(r.rows[0]!.password).not.toContain(PASSWORD);
  });

  it("never lets a client choose its own role", async () => {
    const email = `role-${randomUUID().slice(0, 6)}@example.test`;
    const body = { email, password: PASSWORD, name: "Mallory", role: "admin" } as unknown as { email: string; password: string; name: string };
    let userId: string | undefined;
    try {
      userId = (await auth.api.signUpEmail({ body })).user.id;
    } catch {
      return; // rejecting the request outright is also acceptable
    }
    const r = await getPool().query<{ role: string }>('SELECT role FROM "user" WHERE id=$1', [userId]);
    expect(r.rows[0]!.role).toBe("parent");
  });

  it("requires a session for protected calls", async () => {
    const s = await auth.api.getSession({ headers: new Headers() });
    expect(s).toBeNull();
  });
});
