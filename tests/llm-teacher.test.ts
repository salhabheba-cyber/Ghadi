import { afterEach, describe, expect, it, vi } from "vitest";
import { createLlmTeacher } from "@/lib/teaching/llm-teacher";
import { resolveTeacher } from "@/lib/teaching/demo-teacher";
import type { TeacherContext } from "@/lib/providers/types";

const V = "11111111-1111-4111-8111-111111111111", A = "22222222-2222-4222-8222-222222222222";
const base = { lessonVersionId: V, lessonLanguage: "en", explanationLanguage: "en", childName: "Sami" } as const;
const feedback: TeacherContext = { ...base, event: { type: "feedback", activityId: A, correct: true, attemptNumber: 1 } };
const ok = (text: string) => new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 });
const mk = (f: typeof fetch) => createLlmTeacher({ apiKey: "k", model: "m", fetchImpl: f, timeoutMs: 500 });
afterEach(() => vi.restoreAllMocks());

describe("LLM teacher adapter (mocked fetch; not a live-API test)", () => {
  it("uses the model wording for warm turns and marks provenance llm", async () => {
    const f = vi.fn(async () => ok('{"utterance":"Great counting, Sami!"}'));
    const t = await mk(f as unknown as typeof fetch).nextTurn(feedback);
    expect(t.utterance).toBe("Great counting, Sami!");
    expect(t.provenance.mode).toBe("llm");
    expect(t.activityId).toBe(A);
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.messages[0].content).toContain('"answerWasCorrect":true');
  });
  it("never sends lesson explanation, questions or hints to the model; they stay verbatim", async () => {
    const f = vi.fn();
    const t = await mk(f as unknown as typeof fetch).nextTurn({ ...base, event: { type: "explain", text: "Two apples and one apple make three." } });
    expect(f).not.toHaveBeenCalled();
    expect(t.utterance).toBe("Two apples and one apple make three.");
    expect(t.provenance.mode).toBe("demo");
  });
  it.each([
    ["http error", () => new Response("no", { status: 500 })],
    ["not json", () => ok("Sure! Here you go")],
    ["wrong shape", () => ok('{"text":"hi"}')],
    ["too long", () => ok(JSON.stringify({ utterance: "a".repeat(301) }))],
    ["contains a link", () => ok('{"utterance":"Visit https://evil.example now"}')],
  ])("falls back to the scripted turn on %s", async (_n, resp) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = await mk((async () => resp()) as unknown as typeof fetch).nextTurn(feedback);
    expect(t.provenance.mode).toBe("demo");
    expect(t.utterance.length).toBeGreaterThan(0);
  });
  it("falls back when the request throws or times out", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = await mk((async () => { throw new Error("network"); }) as unknown as typeof fetch).nextTurn(feedback);
    expect(t.provenance.mode).toBe("demo");
  });
  it("is only selected when fully configured, otherwise the demo teacher says why", () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_MODEL", "");
    const r = resolveTeacher();
    expect(r.provider.mode).toBe("demo");
    expect(r.note).toMatch(/ANTHROPIC_API_KEY/);
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("ANTHROPIC_MODEL", "some-model");
    expect(resolveTeacher().provider.mode).toBe("llm");
    vi.unstubAllEnvs();
  });
});
