import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "@/lib/security/csp";
import { clientKey } from "@/lib/security/rate-limit";

const directive = (csp: string, name: string) =>
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `));

describe("Content-Security-Policy", () => {
  const csp = buildCsp("NONCE123");

  it("allows scripts only from this origin and the per-request nonce", () => {
    const script = directive(csp, "script-src")!;
    expect(script).toContain("'self'");
    expect(script).toContain("'nonce-NONCE123'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).not.toMatch(/https?:/);
    expect(script).not.toContain("*");
  });

  it("does not allow <style> elements inline, only style attributes", () => {
    expect(directive(csp, "style-src")).not.toContain("'unsafe-inline'");
    expect(directive(csp, "style-src-attr")).toBe("style-src-attr 'unsafe-inline'");
  });

  it("locks down plugins, framing, base and form targets", () => {
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
  });

  it("limits network access to this origin, localhost (Ollama) and OCR language data", () => {
    expect(directive(csp, "connect-src")).toBe(
      "connect-src 'self' http://localhost:* http://127.0.0.1:* https://cdn.jsdelivr.net",
    );
    expect(directive(csp, "worker-src")).toBe("worker-src 'self' blob:");
  });

  it("only relaxes eval in development", () => {
    expect(buildCsp("n", { isDev: true })).toContain("'unsafe-eval'");
    expect(buildCsp("n")).not.toContain("'unsafe-eval'");
  });

  it("creates unpredictable, unique, base64 nonces", () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("clientKey (rate-limit identity)", () => {
  const withHeaders = (h: Record<string, string>) => new Request("http://x.test", { headers: h });

  it("ignores forwarded headers unless a proxy is trusted", () => {
    expect(clientKey(withHeaders({ "x-forwarded-for": "203.0.113.5" }), {})).toBe("shared");
    expect(
      clientKey(withHeaders({ "x-real-ip": "203.0.113.5" }), { GHADI_TRUST_PROXY: "yes" }),
    ).toBe("shared");
  });

  it("uses the address added by the trusted proxy, not what the client prepended", () => {
    const env = { GHADI_TRUST_PROXY: "true" };
    expect(clientKey(withHeaders({ "x-forwarded-for": "6.6.6.6, 203.0.113.5" }), env)).toBe(
      "203.0.113.5",
    );
    expect(clientKey(withHeaders({ "x-forwarded-for": "203.0.113.5" }), env)).toBe("203.0.113.5");
  });

  it("supports several trusted proxy hops", () => {
    const env = { GHADI_TRUST_PROXY: "true", GHADI_TRUSTED_PROXY_HOPS: "2" };
    expect(
      clientKey(withHeaders({ "x-forwarded-for": "6.6.6.6, 203.0.113.5, 10.0.0.1" }), env),
    ).toBe("203.0.113.5");
  });

  it("falls back safely for malformed values", () => {
    const env = { GHADI_TRUST_PROXY: "true" };
    expect(clientKey(withHeaders({ "x-forwarded-for": "not-an-ip" }), env)).toBe("shared");
    expect(clientKey(withHeaders({}), env)).toBe("shared");
    expect(
      clientKey(withHeaders({ "x-forwarded-for": "1.2.3.4" }), {
        ...env,
        GHADI_TRUSTED_PROXY_HOPS: "9",
      }),
    ).toBe("shared");
    expect(clientKey(withHeaders({ "x-real-ip": "203.0.113.7" }), env)).toBe("203.0.113.7");
  });
});
