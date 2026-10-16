import { TeacherTurn } from "@/lib/schemas";
import type { TeacherContext, TeacherProvider } from "@/lib/providers/types";
import { PHRASES } from "@/lib/teaching/phrases";
import { createLlmTeacher } from "@/lib/teaching/llm-teacher";

/**
 * Deterministic, scripted teacher. It uses ONLY stored approved lesson content plus fixed phrases.
 * It is NOT an AI model and must always be labelled as demo mode in the UI.
 */
export const demoTeacher: TeacherProvider = {
  id: "demo-scripted",
  mode: "demo",
  label: "Demo teacher (fixed script, no AI model connected)",
  async nextTurn(ctx: TeacherContext) {
    const p = PHRASES[ctx.explanationLanguage];
    const base = { language: ctx.explanationLanguage, provenance: { mode: "demo" as const, lessonVersionId: ctx.lessonVersionId } };
    const e = ctx.event;
    switch (e.type) {
      case "greeting":
        return TeacherTurn.parse({ ...base, kind: "greeting", activityId: null, utterance: p.greeting(ctx.childName, e.lessonTitle) });
      case "explain":
        return TeacherTurn.parse({ ...base, kind: "explain", activityId: null, language: ctx.lessonLanguage, utterance: e.text });
      case "prompt":
        return TeacherTurn.parse({ ...base, kind: "prompt", activityId: e.activityId, language: ctx.lessonLanguage, utterance: e.prompt });
      case "feedback": {
        const line = e.correct ? p.correct[(e.attemptNumber - 1) % p.correct.length]! : p.tryAgain;
        return TeacherTurn.parse({ ...base, kind: "feedback", activityId: e.activityId, utterance: line });
      }
      case "hint":
        return TeacherTurn.parse({ ...base, kind: "hint", activityId: e.activityId, utterance: p.hintPrefix + e.hint });
      case "correction":
        return TeacherTurn.parse({ ...base, kind: "correction", activityId: e.activityId, utterance: p.correction(e.explanation) });
      case "recap":
        return TeacherTurn.parse({ ...base, kind: "recap", activityId: null, utterance: p.recap(e.text, e.correct, e.total) });
      case "goodbye":
        return TeacherTurn.parse({ ...base, kind: "goodbye", activityId: null, utterance: p.goodbye });
    }
  },
};

/** Registry: unknown/unconfigured providers fall back to demo and say so; they never pretend to be real. */
export function resolveTeacher(): { provider: TeacherProvider; note?: string } {
  const wanted = process.env.LLM_PROVIDER ?? "demo";
  if (wanted === "demo") return { provider: demoTeacher };
  if (wanted === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.ANTHROPIC_MODEL;
    if (!apiKey || !model) return { provider: demoTeacher, note: "LLM_PROVIDER=anthropic needs ANTHROPIC_API_KEY and ANTHROPIC_MODEL; using the demo teacher." };
    return { provider: createLlmTeacher({ apiKey, model }) };
  }
  return { provider: demoTeacher, note: `LLM_PROVIDER="${wanted}" has no adapter implemented; using the demo teacher.` };
}
