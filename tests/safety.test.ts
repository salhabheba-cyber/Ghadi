import { describe, expect, it, afterEach } from "vitest";
import { PHRASES } from "@/lib/teaching/phrases";
import { SEED_LESSONS } from "@/lib/seed/data";
import { getMessages } from "@/lib/i18n/messages";
import { demoTeacher, resolveTeacher } from "@/lib/teaching/demo-teacher";
import { TeacherTurn, LOCALES, LessonContent, ActivitySpec } from "@/lib/schemas";
import { rateLimit, _resetRateLimits } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/session";

/** Child-safety guard: wording that shames, pressures, or asks a child to keep secrets must never appear in teacher-facing text. */
const BANNED = [
  /\bstupid\b/i, /\bdumb\b/i, /\bidiot/i, /\bbad (boy|girl|child)\b/i, /\bhurry up\b/i, /\bpunish/i, /\byou must\b/i,
  /don'?t tell (your )?(mum|mom|dad|parents?|anyone)/i, /\bour (little )?secret\b/i, /\bkeep (this|it) (a )?secret\b/i,
  /\bchoc?olate\b.*\bif you\b/i, /\bor else\b/i, /\bstreak\b/i, /\blast chance\b/i,
  /ne le dis (à personne|pas)/i, /\bstupide\b/i, /لا تخبر/, /\bسر بيننا/,
];

const allTeacherStrings = (): string[] => {
  const out: string[] = [];
  for (const p of Object.values(PHRASES)) {
    out.push(...p.correct, p.tryAgain, p.hintPrefix, p.goodbye, p.greeting("Nom", "Titre"), p.correction("Explication."), p.recap("Résumé.", 1, 2));
  }
  for (const l of SEED_LESSONS) {
    out.push(l.title, l.content.introduction, l.content.recap, ...l.content.explanation.map((e) => e.text));
    for (const a of l.activities) out.push(a.spec.prompt, a.spec.explanation, ...a.spec.hints);
  }
  return out;
};

describe("child-safety wording", () => {
  it("contains no shaming, pressure or secrecy language in teacher phrases or seed lessons", () => {
    const hits = allTeacherStrings().flatMap((s) => BANNED.filter((re) => re.test(s)).map((re) => `${re}: "${s}"`));
    expect(hits).toEqual([]);
  });

  it("has a phrase set for every supported locale, with a non-shaming retry line", () => {
    for (const l of LOCALES) {
      expect(PHRASES[l].tryAgain.length).toBeGreaterThan(5);
      expect(PHRASES[l].correct.length).toBeGreaterThan(0);
    }
  });

  it("discloses on screen that the teacher is software and that demo mode has no AI model, in every locale", () => {
    for (const l of LOCALES) {
      const m = getMessages(l);
      expect(m.session.ai.length).toBeGreaterThan(10);
      expect(m.session.demo.length).toBeGreaterThan(10);
      expect(m.childForm.consentAi.length).toBeGreaterThan(10);
    }
    expect(getMessages("en").session.demo).toMatch(/No AI model/);
  });

  it("every seed lesson validates against the content schemas and states its objective", () => {
    for (const l of SEED_LESSONS) {
      expect(() => LessonContent.parse(l.content)).not.toThrow();
      l.activities.forEach((a) => expect(() => ActivitySpec.parse(a.spec)).not.toThrow());
      expect(l.objectives.length).toBeGreaterThan(0);
      if (l.status === "approved") expect(l.language).toBe("en"); // only reviewed-language content ships as approved
    }
  });
});

describe("teacher output validation and provider honesty", () => {
  const base = { kind: "prompt", language: "en", activityId: null, provenance: { mode: "demo", lessonVersionId: "7b9f2f0e-5a0e-4b1c-9f10-0a0a0a0a0a0a" } };
  it("rejects malformed or oversized model output before it can reach a child", () => {
    expect(() => TeacherTurn.parse({ ...base, utterance: "ok" })).not.toThrow();
    expect(() => TeacherTurn.parse({ ...base, utterance: "" })).toThrow();
    expect(() => TeacherTurn.parse({ ...base, utterance: "x".repeat(501) })).toThrow();
    expect(() => TeacherTurn.parse({ ...base, utterance: "hi", kind: "run_shell" })).toThrow();
    expect(() => TeacherTurn.parse({ ...base, utterance: "hi", language: "xx" })).toThrow();
    expect(() => TeacherTurn.parse({ ...base, utterance: "hi", provenance: { mode: "gpt-magic", lessonVersionId: base.provenance.lessonVersionId } })).toThrow();
  });

  const original = process.env.LLM_PROVIDER;
  afterEach(() => { if (original === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = original; });

  it("falls back to the labelled demo teacher when an unimplemented provider is requested, and says so", () => {
    process.env.LLM_PROVIDER = "some-llm";
    const r = resolveTeacher();
    expect(r.provider.mode).toBe("demo");
    expect(r.note).toMatch(/no adapter implemented/);
    expect(demoTeacher.label).toMatch(/no AI model/i);
  });
});

describe("rate limiting and CSRF origin check", () => {
  it("allows up to the limit within a window, blocks beyond it, and recovers after the window", () => {
    _resetRateLimits();
    for (let i = 0; i < 5; i++) expect(rateLimit("k", 5, 1000, 0)).toBe(true);
    expect(rateLimit("k", 5, 1000, 10)).toBe(false);
    expect(rateLimit("other", 5, 1000, 10)).toBe(true);
    expect(rateLimit("k", 5, 1000, 1001)).toBe(true);
  });

  it("accepts only same-origin state-changing requests", () => {
    const mk = (origin: string | null, host = "ghadi.example") => new Request("https://ghadi.example/api/x", { method: "POST", headers: { ...(origin ? { origin } : {}), host } });
    expect(isSameOrigin(mk("https://ghadi.example"))).toBe(true);
    expect(isSameOrigin(mk("https://evil.example"))).toBe(false);
    expect(isSameOrigin(mk(null))).toBe(false);
    expect(isSameOrigin(mk("not a url"))).toBe(false);
  });
});
