import type { Locale } from "@/lib/schemas";
import { PHRASES } from "@/lib/teaching/phrases";

/**
 * Pre-rendered, lip-synced teacher clips, one per FIXED sentence.
 * A clip is looked up by a hash of (language + exact text), so a clip can only ever play for the exact words it was made from.
 * Sentences that change per child or per answer (greeting with the child's name, recap with scores, LLM wording, uploaded texts)
 * have no clip and use the photo + browser voice instead. Nothing here is real-time lip-sync.
 */

/** cyrb53: tiny deterministic hash that runs identically on server and browser (no crypto API needed). */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export const normalizeLine = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();
export const lineKey = (lang: Locale, text: string) => cyrb53(`${lang}\n${normalizeLine(text)}`);
export const lineClipUrl = (key: string) => `/teacher/lines/${key}.mp4`;
export const MANIFEST_URL = "/teacher/lines/manifest.json";

export interface LineSpec { key: string; language: Locale; kind: "explain" | "prompt" | "hint" | "correction" | "feedback" | "goodbye"; text: string }

export interface LessonForLines {
  language: Locale;
  content: { explanation: { text: string }[] };
  activities: { prompt: string; explanation: string; hints: string[] }[];
}

/**
 * Every sentence the demo teacher says that does not depend on the child: lesson explanations, questions, hints,
 * corrections, the encouragement phrases and the goodbye. Mirrors src/lib/teaching/demo-teacher.ts.
 */
export function collectFixedLines(lessons: LessonForLines[], explanationLang: Locale = "en"): LineSpec[] {
  const out = new Map<string, LineSpec>();
  const add = (language: Locale, kind: LineSpec["kind"], text: string) => {
    const t = normalizeLine(text);
    out.set(lineKey(language, t), { key: lineKey(language, t), language, kind, text: t });
  };
  const p = PHRASES[explanationLang];
  for (const l of lessons) {
    for (const s of l.content.explanation) add(l.language, "explain", s.text);
    for (const a of l.activities) {
      add(l.language, "prompt", a.prompt);
      for (const h of a.hints) add(explanationLang, "hint", p.hintPrefix + h);
      add(explanationLang, "correction", p.correction(a.explanation));
    }
  }
  for (const c of p.correct) add(explanationLang, "feedback", c);
  add(explanationLang, "feedback", p.tryAgain);
  add(explanationLang, "goodbye", p.goodbye);
  return [...out.values()];
}
