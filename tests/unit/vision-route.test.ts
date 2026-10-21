// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as visionPost } from "@/app/api/ai/vision/route";
import { __resetRateLimitForTests } from "@/lib/security/rate-limit";

const KEY = "sk-test-NEVER-LEAK-THIS";
const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const completion = (content: string, model = "gpt-6.1-sol") =>
  json({
    id: "c1",
    object: "chat.completion",
    created: 1,
    model,
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
  });
const req = (body: unknown) =>
  new Request("http://ghadi.test/api/ai/vision", {
    method: "POST",
    headers: { "content-type": "application/json", host: "ghadi.test" },
    body: JSON.stringify(body),
  });
const good = (page = 1) =>
  JSON.stringify({
    pages: [
      {
        page,
        blocks: [{ kind: "question", number: "1", text: "Simplify 3/4 + 2/3.", uncertain: false }],
      },
    ],
    issues: [],
  });
const body = (extra: Record<string, unknown> = {}) => ({
  images: [{ dataUrl: IMG, page: 1 }],
  consent: true,
  ...extra,
});

beforeEach(() => {
  __resetRateLimitForTests();
  vi.stubEnv("OPENAI_API_KEY", KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/ai/vision", () => {
  it("answers 501 and never calls OpenAI when no key is configured", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await visionPost(req(body()));
    expect(res.status).toBe(501);
    expect((await res.json()).error.code).toBe("not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires explicit consent and sends nothing without it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await visionPost(req({ images: [{ dataUrl: IMG, page: 1 }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("consent-required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only accepts image data URLs from the device (no remote URLs, no other types)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const dataUrl of [
      "https://evil.test/a.png",
      "data:text/html;base64,AAAA",
      "javascript:1",
    ]) {
      const res = await visionPost(req(body({ images: [{ dataUrl, page: 1 }] })));
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects more than four images per request", async () => {
    const images = Array.from({ length: 5 }, (_, i) => ({ dataUrl: IMG, page: i + 1 }));
    expect((await visionPost(req(body({ images })))).status).toBe(400);
  });

  it("sends the image to the vision model with the key as a bearer header and returns a validated transcription", async () => {
    const fetchMock = vi.fn(async () => completion(good()));
    vi.stubGlobal("fetch", fetchMock);
    const res = await visionPost(req(body()));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.transcription.pages[0].blocks[0].text).toBe("Simplify 3/4 + 2/3.");
    expect(JSON.stringify(out)).not.toContain(KEY);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toMatch(/\/chat\/completions$/);
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe("gpt-6.1-sol");
    expect(JSON.stringify(sent.messages)).toContain("image_url");
  });

  it("does not trust a reading that reports the wrong page", async () => {
    vi.stubGlobal("fetch", async () => completion(good(7)));
    const res = await visionPost(req(body()));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("invalid-output");
  });

  it("reports malformed model output as an error, never as a transcription", async () => {
    for (const content of ["not json at all", JSON.stringify({ pages: "nope" })]) {
      vi.stubGlobal("fetch", async () => completion(content));
      const res = await visionPost(req(body()));
      expect(res.status).toBe(502);
      expect((await res.json()).transcription).toBeUndefined();
    }
  });

  it.each([
    [401, "invalid_api_key", "invalid-key"],
    [429, "rate_limit_exceeded", "rate-limited"],
    [429, "insufficient_quota", "insufficient-credits"],
  ])("maps an OpenAI %i (%s) to %s with a safe message", async (status, code, expected) => {
    vi.stubGlobal("fetch", async () =>
      json({ error: { message: `problem with ${KEY}`, code, type: code } }, status),
    );
    const res = await visionPost(req(body()));
    const out = await res.json();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(out.error.code).toBe(expected);
    expect(JSON.stringify(out)).not.toContain(KEY);
  });

  it("reports a network failure as an error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const res = await visionPost(req(body()));
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
