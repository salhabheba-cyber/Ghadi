/**
 * Grounding checks: nothing becomes a key term, definition, fact, formula, heading or example unless
 * it is meaningful, complete, and supported by the source. These checks apply to every generator
 * (OpenAI and the offline rules) because both can produce junk: rules grab "27 What" or a website
 * name as a "term", and a model can paraphrase something the document never said.
 *
 * They are deliberately conservative about *accepting* and deliberately generous about *rejecting*:
 * an item that is dropped costs the learner nothing, an invented one costs trust.
 */

import { PAGE_MARKER_RE } from "@/lib/ai/vision";

export type Verdict = { ok: true } | { ok: false; reason: string };
const ok: Verdict = { ok: true };
const no = (reason: string): Verdict => ({ ok: false, reason });

const QUESTION_WORDS =
  /^(what|why|how|when|where|which|who|whom|whose|find|calculate|solve|simplify|evaluate|compute|work out|write|state|explain|describe|give|list|show|prove|determine|complete|circle|choose|match|name|identify|define|compare|draw|label)\b/i;

const STOP_START = new Set(
  (
    "a an the and or but nor of in on at to for with by from as that which this these those is are was were be been " +
    "it its it's if so then than also not no yes can could should would may might will shall do does did has have had"
  ).split(/\s+/),
);
const STOP_END = new Set(
  "a an the and or but nor of in on at to for with by from as that which is are was were be been it if so then than".split(
    /\s+/,
  ),
);

const UNCERTAIN_MARK = /\[(?:unclear|illegible|\?)\]/i;
const URL_LIKE =
  /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|net|edu|gov|io|co|uk|info|biz|app|dev|me|tv|ai)\b)/i;

/** Lower-cases and normalises quotes, dashes, minus signs, spaces and zero-width characters. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[​-‏⁠﻿]/g, "")
    .replace(/[“”„‟"]/g, '"')
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same text, but also ignoring all spaces: tolerant of line-break and spacing differences in a quote. */
const squash = (s: string) => normalizeForMatch(s).replace(/[\s"'.,;:!?()[\]{}-]/g, "");

export function appearsInSource(excerpt: string, source: string): boolean {
  const e = normalizeForMatch(excerpt).replace(/…$/, "").trim();
  if (e.length < 6) return false;
  return normalizeForMatch(source).includes(e) || squash(source).includes(squash(e));
}

/** Words (3+ letters) that carry meaning, for support checks. */
function contentWords(s: string): string[] {
  return (normalizeForMatch(s).match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(
    (w) => !STOP_START.has(w) && !STOP_END.has(w),
  );
}

/** Share of the claim's content words that occur in the source (0..1). */
export function sourceSupport(claim: string, source: string): number {
  const words = contentWords(claim);
  if (words.length === 0) return 0;
  const haystack = new Set(contentWords(source));
  let hit = 0;
  for (const w of words) if (haystack.has(w)) hit++;
  return hit / words.length;
}

/* -------------------------------- Key terms -------------------------------- */

export function isMeaningfulTerm(raw: string): Verdict {
  const term = raw.trim().replace(/^["“”'‘’*_`]+|["“”'‘’*_`]+$/g, "");
  if (term.length < 2) return no("too short");
  if (term.length > 80) return no("too long to be a term");
  const letters = (term.match(/\p{L}/gu) ?? []).length;
  const symbolLike = letters >= 2 && /\d/.test(term) && !/\s/.test(term); // H2O, CO2, B12
  if (!/\p{L}{2,}/u.test(term) && !symbolLike && !/^[\p{Lu}][\p{Ll}]$/u.test(term))
    return no("not a word");
  if (UNCERTAIN_MARK.test(term)) return no("contains unreadable text");
  if (URL_LIKE.test(term)) return no("website name or address");
  if (/^\d+\s/.test(term) || /^\d+[.)]/.test(term)) return no("starts with a question/item number");
  if (
    /^(?:q|qu|question|ex|exercise|problem|fig|figure|table|page|part|section|slide)\.?\s*\d+/i.test(
      term,
    )
  )
    return no("a label such as “Question 3”");
  if (/\?$/.test(term) || /[,;:]$/.test(term)) return no("a sentence fragment");
  if (/[.!?]\s+\S/.test(term)) return no("more than one sentence");
  const words = term.split(/\s+/);
  if (words.length > 6) return no("too long to be a term");
  if (QUESTION_WORDS.test(term)) return no("a question or instruction, not a term");
  const bare = words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, ""));
  if (bare.every((w) => STOP_START.has(w) || STOP_END.has(w))) return no("only function words");
  const first = bare[0] ?? "";
  // "The Calvin cycle" is fine; "and the cell", "that is" are fragments.
  if (STOP_START.has(first) && !["a", "an", "the"].includes(first))
    return no("a sentence fragment");
  if (bare.at(-1) && STOP_END.has(bare.at(-1)!)) return no("a sentence fragment");
  const digits = words.filter((w) => /^\d+([.,]\d+)?$/.test(w)).length;
  if (digits === words.length) return no("only numbers");
  if (digits > 0 && words.length - digits < 2 && !/\d[A-Za-z]|[A-Za-z]\d/.test(term))
    return no("a number with a stray word");
  return ok;
}

/* ------------------------------- Definitions ------------------------------- */

export function isCompleteDefinition(term: string, definition: string, source?: string): Verdict {
  const t = isMeaningfulTerm(term);
  if (!t.ok) return no(`term rejected: ${t.reason}`);
  const d = definition.trim();
  if (UNCERTAIN_MARK.test(d)) return no("contains unreadable text");
  if (URL_LIKE.test(d)) return no("contains a web address");
  if (d.length < 15) return no("too short to define anything");
  const words = d.split(/\s+/);
  if (words.length < 4) return no("too short to define anything");
  if (/[,;:(\-–—]$/.test(d)) return no("ends in the middle of a sentence");
  if (STOP_END.has((words.at(-1) ?? "").toLowerCase().replace(/[^\p{L}]/gu, "")))
    return no("ends in the middle of a sentence");
  if (!/\p{L}{3,}/u.test(d)) return no("has no words");
  const open = (d.match(/[([{]/g) ?? []).length;
  const close = (d.match(/[)\]}]/g) ?? []).length;
  if (open !== close) return no("has unmatched brackets");
  if (normalizeForMatch(d) === normalizeForMatch(term)) return no("repeats the term");
  if (source !== undefined && source.length > 0 && sourceSupport(d, source) < 0.6)
    return no("not supported by the source text");
  return ok;
}

/* ---------------------------------- Facts ---------------------------------- */

/** A date fact needs a real subject: a bare year or day with no sentence around it says nothing. */
export function isCompleteFact(kind: "date" | "formula", value: string, context: string): Verdict {
  if (UNCERTAIN_MARK.test(value) || UNCERTAIN_MARK.test(context))
    return no("contains unreadable text");
  if (kind === "date") {
    const rest = context.replace(value, " ");
    const words = contentWords(rest);
    if (words.length < 4) return no("a date without enough context to mean anything");
    if (!/[.!?؟]$/.test(context.trim()) && context.trim().split(/\s+/).length < 6)
      return no("a cut-off sentence");
    return ok;
  }
  return isCompleteFormula(value);
}

export function isCompleteFormula(expr: string): Verdict {
  const e = expr.trim();
  if (e.length < 3 || e.length > 200) return no("not a formula");
  if (UNCERTAIN_MARK.test(e)) return no("contains unreadable text");
  const parts = e.split("=");
  if (parts.length < 2 || parts.some((p) => p.trim() === ""))
    return no("one side of the equation is empty");
  if (/[+\-−×÷*/^]\s*$/.test(e) || /^\s*[×÷*/^]/.test(e))
    return no("ends or starts with an operator");
  const bal = (open: string, close: string) =>
    e.split(open).length - 1 === e.split(close).length - 1;
  if (!bal("(", ")") || !bal("[", "]") || !bal("{", "}")) return no("unmatched brackets");
  if (!/[\p{L}]|\d/u.test(e)) return no("no symbols or numbers");
  return ok;
}

/* ----------------------------- Headings & misc ----------------------------- */

/** Whether a line is a plausible section heading (not a numbered question, URL or sentence). */
export function isSensibleHeading(raw: string): boolean {
  const h = raw.trim().replace(/^#+\s*/, "");
  if (h.length < 3 || h.length > 90) return false;
  if (/\?$/.test(h) || URL_LIKE.test(h) || UNCERTAIN_MARK.test(h)) return false;
  // "27 What is…", "3. Find x" — a numbered question or instruction, not a heading.
  if (/^\d+\s*[.)]?\s+/.test(h) && QUESTION_WORDS.test(h.replace(/^\d+\s*[.)]?\s+/, "")))
    return false;
  if (
    /^\d+\s+\p{Lu}\p{Ll}+\b/u.test(h) &&
    !/^\d+(?:\.\d+)+\s/.test(h) &&
    h.split(/\s+/).length <= 3
  )
    return false;
  if (/[,;]$/.test(h) || /\s{3,}/.test(h)) return false;
  return true;
}

/** True when most of the text is numbered questions/exercises: a worksheet, not a lesson. */
export function looksLikeWorksheet(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^--- Page \d+ ---$/.test(l));
  if (lines.length < 4) return false;
  const numbered = lines.filter((l) => /^(?:q(?:uestion)?\.?\s*)?\d{1,3}\s*[.)]\s+\S/i.test(l));
  if (numbered.length < 3) return false;
  const askLike = numbered.filter(
    (l) =>
      /\?\s*$/.test(l) ||
      QUESTION_WORDS.test(l.replace(/^(?:q(?:uestion)?\.?\s*)?\d{1,3}\s*[.)]\s+/i, "")),
  );
  return numbered.length / lines.length >= 0.3 && askLike.length / numbered.length >= 0.5;
}

/** Splits a worksheet into its numbered questions, in order, keeping wrapped lines with their question. */
export function splitWorksheetQuestions(
  text: string,
): { number: string; text: string; page?: number }[] {
  const out: { number: string; text: string; page?: number }[] = [];
  let page: number | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const marker = /^--- Page (\d+) ---$/.exec(line);
    if (marker) {
      page = Number(marker[1]);
      continue;
    }
    if (!line) continue;
    const m = /^(?:q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.)]\s+(\S.*)$/i.exec(line);
    if (m) out.push({ number: m[1]!, text: m[2]!, page });
    else if (out.length > 0 && !/^## /.test(line)) out.at(-1)!.text += ` ${line}`;
  }
  return out;
}

/** True when the summary is mostly the source repeated back (long verbatim runs), not a summary. */
export function summaryLooksCopied(summary: string, source: string): boolean {
  const words = normalizeForMatch(summary).split(" ").filter(Boolean);
  if (words.length < 12) return false;
  const src = normalizeForMatch(source);
  const n = 8;
  let hit = 0;
  let total = 0;
  for (let i = 0; i + n <= words.length; i++) {
    total++;
    if (src.includes(words.slice(i, i + n).join(" "))) hit++;
  }
  return total > 0 && hit / total > 0.6;
}

/** The page a passage is on, using the page markers in the stored text; undefined if unknown. */
export function pageOf(source: string, excerpt: string): number | undefined {
  const idx = normalizeForMatch(source).indexOf(normalizeForMatch(excerpt).slice(0, 60));
  if (idx < 0) return undefined;
  const norm = normalizeForMatch(source);
  let page: number | undefined;
  for (const m of norm.matchAll(new RegExp(PAGE_MARKER_RE.source.replace(/\^|\$/g, ""), "gi"))) {
    if ((m.index ?? 0) <= idx) page = Number(m[1]);
    else break;
  }
  return page;
}
