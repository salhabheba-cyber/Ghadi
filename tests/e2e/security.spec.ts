import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const FIXTURES = path.join(__dirname, "..", "fixtures");
const TEXT_FIXTURE = path.join(FIXTURES, "photosynthesis.txt");
const OCR_FIXTURE = path.join(FIXTURES, "ocr-sample.png");

/** Collects every CSP violation and uncaught error the page produces. */
async function watch(page: Page) {
  const problems: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(`CSPVIOLATION ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on("console", (m) => {
    if (/CSPVIOLATION|Content Security Policy|Refused to/.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

test.describe("response headers", () => {
  test("every page carries the hardening headers and a fresh nonce-based CSP", async ({
    request,
  }) => {
    const first = await request.get("/dashboard");
    const second = await request.get("/dashboard");
    const h = first.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["cross-origin-resource-policy"]).toBe("same-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["x-powered-by"]).toBeUndefined();

    const csp = h["content-security-policy"]!;
    const script = csp.split(";").find((d) => d.trim().startsWith("script-src"))!;
    expect(script).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");

    const nonceOf = (c: string) => /'nonce-([^']+)'/.exec(c)![1];
    expect(nonceOf(second.headers()["content-security-policy"]!)).not.toBe(nonceOf(csp));

    // The nonce in the header is the one Next.js stamped on its scripts, and no script is un-nonced inline code.
    const html = await first.text();
    const nonce = nonceOf(csp)!;
    expect(html).toContain(`nonce="${nonce}"`);
    const inlineWithoutNonce = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*\bnonce=)[^>]*>/g)];
    expect(inlineWithoutNonce).toHaveLength(0);
  });

  test("API responses are never cached and carry the same hardening", async ({ request }) => {
    const res = await request.get("/api/ai/status");
    expect(res.headers()["cache-control"]).toBe("no-store");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(await res.json()).toEqual({ configured: false });
  });
});

test.describe("script safety in the real browser", () => {
  test("the whole app runs with zero CSP violations or script errors", async ({ page }) => {
    const problems = await watch(page);
    await page.goto("/");
    await page.goto("/documents");
    await page.getByTestId("file-input").setInputFiles(TEXT_FIXTURE);
    await expect(page.getByRole("heading", { level: 1, name: "photosynthesis" })).toBeVisible();
    await page.getByRole("button", { name: "Generate notes" }).click();
    await page.waitForURL(/\/notes\//);
    await page.goto("/documents");
    await page
      .getByRole("link", { name: /photosynthesis/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Generate quiz" }).click();
    await page.waitForURL(/\/quizzes\//);
    await page.getByLabel("After each question").check();
    await page.getByRole("button", { name: "Take Exam in Ghadi" }).click();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await page.goto("/documents");
    await page
      .getByRole("link", { name: /photosynthesis/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Generate deck" }).click();
    await page.waitForURL(/\/flashcards\//);
    await page.getByRole("button", { name: /Study due/ }).click();
    await page.getByRole("button", { name: "Show answer" }).click();
    for (const route of ["/dashboard", "/library", "/settings", "/review"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
    }
    await page.getByRole("button", { name: /dark theme/ }).click();
    expect(problems).toEqual([]);
  });

  test("hostile imported text is displayed as text and never executes", async ({ page }) => {
    const problems = await watch(page);
    const payload = [
      "Cells are the basic unit of life, and every organism is made of cells that carry out many functions.",
      '<img src=x onerror="window.__pwned=1"> <script>window.__pwned=2</script> <svg onload="window.__pwned=3">',
      '<a href="javascript:window.__pwned=4">click</a> [x](javascript:window.__pwned=5)',
      "Mitosis is the process by which a cell divides into two identical cells during growth and repair.",
    ].join("\n\n");
    await page.goto("/documents");
    await page.getByRole("tab", { name: "Paste text" }).click();
    await page.getByLabel("Title (optional)").fill('<img src=x onerror="window.__pwned=6">');
    await page.getByLabel("Text").fill(payload);
    await page.getByRole("button", { name: "Save text" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const check = async () => {
      expect(
        await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
      ).toBeUndefined();
      expect(
        await page
          .locator("main img, main svg[onload], main script, main a[href^='javascript']")
          .count(),
      ).toBe(0);
    };
    await expect(page.getByText("window.__pwned=1", { exact: false }).first()).toBeVisible();
    await check();
    await page.getByRole("button", { name: "Generate notes" }).click();
    await page.waitForURL(/\/notes\//);
    await check();
    await page.goto("/library");
    await check();
    expect(problems).toEqual([]);
  });
});

test.describe("API request hardening", () => {
  const url = { url: "https://example.com" };
  test("refuses non-JSON bodies, cross-site requests and private targets", async ({ request }) => {
    const form = await request.post("/api/import/url", {
      headers: { "content-type": "text/plain" },
      data: JSON.stringify(url),
    });
    expect(form.status()).toBe(415);
    const cross = await request.post("/api/import/url", {
      headers: { "sec-fetch-site": "cross-site" },
      data: url,
    });
    expect(cross.status()).toBe(403);
    const evilOrigin = await request.post("/api/import/url", {
      headers: { origin: "https://evil.example" },
      data: url,
    });
    expect(evilOrigin.status()).toBe(403);
    for (const target of [
      "http://127.0.0.1:3100/api/ai/status",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://localhost/",
    ]) {
      const res = await request.post("/api/import/url", { data: { url: target } });
      expect(res.status(), target).toBe(422);
    }
  });

  test("hosted AI is off by default and cannot be reached without configuration", async ({
    request,
  }) => {
    const res = await request.post("/api/ai/generate", {
      data: { task: "summary", consent: true, payload: { text: "x" } },
    });
    expect(res.status()).toBe(501);
  });
});

test.describe("OCR runs fully on-device", () => {
  test("reads text from an image with no request leaving localhost", async ({ page }) => {
    test.setTimeout(120_000);
    const problems = await watch(page);
    const external: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (!["localhost", "127.0.0.1"].includes(u.hostname) && u.protocol.startsWith("http"))
        external.push(r.url());
    });

    await page.goto("/documents");
    await page.getByTestId("file-input").setInputFiles(OCR_FIXTURE);
    await expect(page.getByTestId("ocr-notice")).toContainText("entirely on this device");
    await page.getByRole("button", { name: "Read file with OCR" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 90_000 });
    const text = await page.getByRole("region", { name: "Extracted text" }).innerText();
    expect(text.toLowerCase()).toContain("photosynthesis");
    expect(text.toLowerCase()).toContain("chlorophyll");
    await expect(page.getByText("may contain OCR errors")).toBeVisible();
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
  });
});
