import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isPrivateAddress,
  isPrivateIPv4,
  isPrivateIPv6,
  UrlRejectedError,
  validateImportUrl,
} from "@/lib/security/ssrf";
import { safeFetch } from "@/lib/security/safe-fetch";
import { __resetRateLimitForTests, rateLimit } from "@/lib/security/rate-limit";

describe("private address detection", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "192.0.2.5",
  ])("blocks private IPv4 %s", (ip) => expect(isPrivateIPv4(ip)).toBe(true));

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "172.15.255.255", "1.1.1.1"])(
    "allows public IPv4 %s",
    (ip) => expect(isPrivateIPv4(ip)).toBe(false),
  );

  it.each([
    "::",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "2001:db8::1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
  ])("blocks private IPv6 %s", (ip) => expect(isPrivateIPv6(ip)).toBe(true));

  it.each(["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"])(
    "allows public IPv6 %s",
    (ip) => expect(isPrivateIPv6(ip)).toBe(false),
  );

  it("treats unparseable addresses as unsafe", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
    expect(isPrivateIPv4("999.1.1.1")).toBe(true);
  });
});

describe("URL validation", () => {
  const rejected = [
    "ftp://example.com/file",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,hi",
    "http://localhost/",
    "http://LOCALHOST:80/",
    "http://foo.localhost/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/",
    "http://10.0.0.5/",
    "http://192.168.0.1/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://0177.0.0.1/",
    "http://[::ffff:127.0.0.1]/",
    "https://user:pass@example.com/",
    "https://example.com:8080/",
    "https://intranet/",
    "http://printer.local/",
    "http://service.internal/",
    "",
    "not a url",
  ];
  it.each(rejected)("rejects %s", (u) => {
    expect(() => validateImportUrl(u)).toThrow(UrlRejectedError);
  });

  it("accepts ordinary public web addresses", () => {
    expect(validateImportUrl("https://en.wikipedia.org/wiki/Photosynthesis").hostname).toBe(
      "en.wikipedia.org",
    );
    expect(validateImportUrl("http://example.com/a?b=c").protocol).toBe("http:");
  });

  it("enforces host allow-lists for site-specific imports", () => {
    expect(() => validateImportUrl("https://evil.com/", { allowedHosts: ["youtube.com"] })).toThrow(
      /not supported/,
    );
    expect(() =>
      validateImportUrl("https://notyoutube.com/", { allowedHosts: ["youtube.com"] }),
    ).toThrow();
    expect(
      validateImportUrl("https://www.youtube.com/watch?v=x", { allowedHosts: ["youtube.com"] })
        .hostname,
    ).toBe("www.youtube.com");
  });
});

describe("safeFetch", () => {
  let server: http.Server;
  let base = "";
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/ok") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<html><body><p>Hello world, this is a page.</p></body></html>");
      } else if (req.url === "/json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      } else if (req.url === "/big") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.write("x".repeat(5000));
        res.end("y".repeat(5000));
      } else if (req.url === "/meta") {
        res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      } else if (req.url === "/loop") {
        res.writeHead(302, { Location: "/loop" });
        res.end();
      } else if (req.url === "/slow") {
        /* never respond */
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("nope");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  const lax = { __unsafeAllowPrivateForTests: true };

  it("refuses loopback targets in normal operation", async () => {
    await expect(safeFetch(`${base}/ok`)).rejects.toThrow(UrlRejectedError);
  });

  it("refuses hosts that resolve to private addresses (including mixed public/private answers)", async () => {
    await expect(
      safeFetch("https://rebind.example.com/", { resolve: async () => ["10.0.0.7"] }),
    ).rejects.toThrow(/private or local/);
    await expect(
      safeFetch("https://rebind.example.com/", {
        resolve: async () => ["93.184.216.34", "127.0.0.1"],
      }),
    ).rejects.toThrow(/private or local/);
    await expect(
      safeFetch("https://rebind.example.com/", { resolve: async () => ["::ffff:169.254.169.254"] }),
    ).rejects.toThrow(/private or local/);
  });

  it("reports unknown hosts without leaking resolver details", async () => {
    await expect(
      safeFetch("https://nope.example.com/", {
        resolve: async () => {
          throw new Error("ENOTFOUND secret-internal-dns");
        },
      }),
    ).rejects.toThrow("That web address could not be found.");
  });

  it("fetches pages when the guard is relaxed for tests", async () => {
    const r = await safeFetch(`${base}/ok`, lax);
    expect(r.status).toBe(200);
    expect(r.contentType).toBe("text/html");
    expect(r.charset).toBe("utf-8");
    expect(r.body.toString()).toContain("Hello world");
  });

  it("rejects unsupported content types and oversized bodies", async () => {
    await expect(safeFetch(`${base}/json`, lax)).rejects.toThrow(/not a supported type/);
    await expect(safeFetch(`${base}/big`, { ...lax, maxBytes: 1000 })).rejects.toThrow(/too large/);
  });

  it("re-validates redirects and blocks hops to cloud metadata addresses", async () => {
    await expect(safeFetch(`${base}/meta`, lax)).rejects.toThrow(/Private and local network/);
  });

  it("stops redirect loops and non-2xx answers", async () => {
    await expect(safeFetch(`${base}/loop`, lax)).rejects.toThrow();
    await expect(safeFetch(`${base}/missing`, lax)).rejects.toThrow(/HTTP 404/);
  });

  it("times out slow servers", async () => {
    await expect(safeFetch(`${base}/slow`, { ...lax, timeoutMs: 300 })).rejects.toThrow(/too long/);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit then blocks until the window passes", () => {
    __resetRateLimitForTests();
    const t0 = 1_000_000;
    expect(rateLimit("k", 2, 1000, t0).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, t0 + 10).ok).toBe(true);
    const blocked = rateLimit("k", 2, 1000, t0 + 20);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(rateLimit("other", 2, 1000, t0 + 20).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, t0 + 1500).ok).toBe(true);
  });
});
