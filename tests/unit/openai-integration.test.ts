// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as chatPost } from "@/app/api/ai/chat/route";
import { POST as testPost } from "@/app/api/ai/test/route";
import { POST as checkPost } from "@/app/api/quiz/check/route";
import { POST as generatePost } from "@/app/api/ai/generate/route";
import { buildChatParams, completeText, isReasoningModel, toAiError } from "@/lib/ai/openai-server";
import { __resetRateLimitForTests } from "@/lib/security/rate-limit";

const KEY = "sk-test-NEVER-LEAK-THIS";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const completion = (content: string) =>
  json({
    id: "c1",
    object: "chat.completion",
    created: 1,
    model: "gpt-4.1-mini",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
  });
const req = (path: string, body: unknown) =>
  new Request(`http://ghadi.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "ghadi.test" },
    body: JSON.stringify(body),
  });

beforeEach(() => __resetRateLimitForTests());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("request parameters", () => {
  it("uses max_tokens + temperature for classic models", () => {
    const p = buildChatParams("gpt-4.1-mini", { system: "s", user: "u", json: true });
    expect(p).toMatchObject({
      max_tokens: 4096,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    expect(p).not.toHaveProperty("max_completion_tokens");
  });
  it("uses max_completion_tokens and no temperature for reasoning models", () => {
    for (const m of ["gpt-5-mini", "o3-mini"]) {
      expect(isReasoningModel(m)).toBe(true);
      const p = buildChatParams(m, { system: "s", user: "u" });
      expect(p).toHaveProperty("max_completion_tokens");
      expect(p).not.toHaveProperty("temperature");
      expect(p).not.toHaveProperty("max_tokens");
    }
  });
});

describe("OpenAI server calls", () => {
  const cfg = {
    provider: "openai" as const,
    baseUrl: "https://api.openai.test/v1",
    apiKey: KEY,
    model: "gpt-4.1-mini",
    visionModel: "gpt-4.1",
  };

  it("sends the key as a bearer header to the configured base URL and returns the text", async () => {
    const fetchMock = vi.fn(async () => completion("OK"));
    vi.stubGlobal("fetch", fetchMock);
    const out = await completeText({ system: "s", user: "u" }, { cfg });
    expect(out.text).toBe("OK");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://api.openai.test/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
  });

  it.each([
    [
      401,
      { error: { message: `Incorrect API key ${KEY}`, code: "invalid_api_key" } },
      "invalid-key",
    ],
    [
      429,
      { error: { message: "You exceeded your current quota", code: "insufficient_quota" } },
      "insufficient-credits",
    ],
    [
      429,
      { error: { message: "Rate limit reached", code: "rate_limit_exceeded" } },
      "rate-limited",
    ],
    [
      404,
      { error: { message: "The model does not exist", code: "model_not_found" } },
      "model-not-found",
    ],
  ])("maps HTTP %i to %s without leaking the key", async (status, body, code) => {
    vi.stubGlobal("fetch", async () => json(body, status));
    const err = await completeText({ system: "s", user: "u" }, { cfg }).catch((e) => e);
    expect(toAiError(err).code).toBe(code);
    expect(toAiError(err).message).not.toContain(KEY);
  });

  it("reports an empty completion as a bad response", async () => {
    vi.stubGlobal("fetch", async () => completion(""));
    const err = await completeText({ system: "s", user: "u" }, { cfg }).catch((e) => e);
    expect(toAiError(err).code).toBe("bad-response");
  });

  it("reports network failure as unreachable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const err = await completeText({ system: "s", user: "u" }, { cfg }).catch((e) => e);
    expect(toAiError(err).code).toBe("unreachable");
  });
});

describe("POST /api/ai/test", () => {
  it("says so plainly when no key is configured", async () => {
    const res = await testPost(req("/api/ai/test", {}));
    expect(res.status).toBe(501);
    expect((await res.json()).error.code).toBe("not-configured");
  });
  it("makes a real request and reports provider, model and latency on success", async () => {
    vi.stubEnv("OPENAI_API_KEY", KEY);
    vi.stubEnv("OPENAI_MODEL", "gpt-4.1-mini");
    let n = 0;
    const fetchMock = vi.fn(async () => completion(n++ === 0 ? "OK" : "42"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await testPost(req("/api/ai/test", {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, provider: "openai", model: "gpt-4.1-mini" });
    expect(JSON.stringify(body)).not.toContain(KEY);
    // One text request and one image request (the vision self-test).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.vision).toMatchObject({ ok: true });
  });
  it("does not claim image reading works when the vision model misreads the test image", async () => {
    vi.stubEnv("OPENAI_API_KEY", KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => completion("OK")),
    );
    const body = await (await testPost(req("/api/ai/test", {}))).json();
    expect(body.ok).toBe(true);
    expect(body.vision.ok).toBe(false);
  });
  it("never reports success when the provider rejects the key", async () => {
    vi.stubEnv("OPENAI_API_KEY", KEY);
    vi.stubGlobal("fetch", async () =>
      json({ error: { message: "bad key", code: "invalid_api_key" } }, 401),
    );
    const res = await testPost(req("/api/ai/test", {}));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
    expect(body.error.code).toBe("invalid-key");
    expect(JSON.stringify(body)).not.toContain(KEY);
  });
});

describe("consent is enforced server-side", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", KEY));

  it("/api/ai/chat refuses without consent and never calls OpenAI", async () => {
    const fetchMock = vi.fn(async () => completion("hi"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await chatPost(
      req("/api/ai/chat", { messages: [{ role: "user", content: "hello" }] }) as never,
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("/api/quiz/check refuses without consent and never calls OpenAI", async () => {
    const fetchMock = vi.fn(async () => completion("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await checkPost(
      req("/api/quiz/check", { question: "q", correctAnswer: "a", userAnswer: "b" }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("/api/ai/generate refuses without consent and never calls OpenAI", async () => {
    const fetchMock = vi.fn(async () => completion("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await generatePost(
      req("/api/ai/generate", {
        task: "summary",
        payload: { title: "T", text: "Some text here." },
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("/api/quiz/check with consent calls OpenAI through the server and returns its verdict", async () => {
    vi.stubGlobal("fetch", async () =>
      completion(JSON.stringify({ correct: true, feedback: "Good.", correctAnswer: "a" })),
    );
    const res = await checkPost(
      req("/api/quiz/check", { question: "q", correctAnswer: "a", userAnswer: "A", consent: true }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ correct: true });
  });
});
