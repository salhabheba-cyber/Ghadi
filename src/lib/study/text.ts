/**
 * Plain-text analysis used by the offline (heuristic) study generators.
 * Everything here is deterministic and explainable: no model is involved.
 */

import { analyzeTextQuality, isUsableForGeneration } from "./quality";
import {
  isCompleteDefinition,
  isCompleteFact,
  isMeaningfulTerm,
  isSensibleHeading,
  looksLikeWorksheet,
  splitWorksheetQuestions,
} from "./grounding";

const EN_STOPWORDS = `a about above after again against all also am an and any are as at be because been before being below
between both but by can could did do does doing down during each few for from further had has have having he her here hers
him his how i if in into is it its just may me might more most must my no nor not now of off on once only or other our out over
own same she should so some such than that the their them then there these they this those through to too under until up very
was we were what when where which while who whom why will with would you your thus however therefore example`;

const AR_STOPWORDS = `في من على إلى عن هذا هذه ذلك تلك التي الذي الذين هو هي هم أن إن كان كانت يكون ما لا مع كل أو أي بعد قبل
بين عند حتى لكن ثم قد كما أيضا هناك`;

export const STOPWORDS: ReadonlySet<string> = new Set(
  `${EN_STOPWORDS} ${AR_STOPWORDS}`.split(/\s+/).filter(Boolean),
);

const TOKEN_RE = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) ?? []).slice();
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ABBREVIATIONS = /\b(e\.g|i\.e|etc|vs|Dr|Mr|Mrs|Ms|Prof|Fig|No|approx|cf|al|St)\./gi;

/** Splits text into sentences. Bullet markers are stripped. Very short fragments are dropped. */
export function splitSentences(text: string): string[] {
  const protectedText = text
    .replace(ABBREVIATIONS, (m) => m.replace(/\./g, "§"))
    .replace(/(\d)\.(\d)/g, "$1§$2");
  const out: string[] = [];
  for (const line of protectedText.split(/\n+/)) {
    const cleaned = line.replace(/^\s*(?:[-*•▪‣]|\d+[.)])\s+/, "").trim();
    if (!cleaned) continue;
    for (const part of cleaned.split(/(?<=[.!?؟])\s+/)) {
      const s = part.replace(/§/g, ".").trim();
      if (s.length >= 3) out.push(s);
    }
  }
  return out;
}

/** Sentences long enough to be useful as study material. */
export function candidateSentences(text: string): string[] {
  return splitSentences(text).filter((s) => {
    const words = tokenize(s).length;
    return s.length >= 30 && s.length <= 400 && words >= 5;
  });
}

export interface Section {
  heading: string;
  body: string;
}

function isUpper(line: string): boolean {
  return line === line.toUpperCase() && line !== line.toLowerCase();
}

function isTitleCase(line: string): boolean {
  const words = line.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return false;
  const small = new Set([
    "of",
    "and",
    "the",
    "in",
    "on",
    "to",
    "for",
    "a",
    "an",
    "vs",
    "or",
    "with",
  ]);
  return words.every((w, i) => (i > 0 && small.has(w.toLowerCase())) || /^[\p{Lu}\p{N}]/u.test(w));
}

function looksLikeHeading(line: string, prevBlank: boolean, hasNext: boolean): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const md = /^#{1,6}\s+(\S.*)$/.exec(trimmed);
  if (md?.[1]) return md[1].replace(/#+\s*$/, "").trim();
  if (!hasNext || trimmed.length > 90) return null;
  const words = trimmed.split(/\s+/).length;
  if (/[.!?,;]$/.test(trimmed) || words > 10) return null;
  // A heading is never a numbered question/instruction ("27 What…"), a web address or an unclear line.
  if (!isSensibleHeading(trimmed)) return null;
  // Section numbering looks like "1.2 Title" or "IV. Title"; a plain "27 What…" is a worksheet item.
  const numbered = /^(?:\d+(?:\.\d+)+[.)]?|\d+[.)]|[IVX]+\.)\s+\p{Lu}/u.test(trimmed);
  if (numbered && words >= 2) return trimmed;
  if (!prevBlank) return null;
  if (trimmed.endsWith(":") && words <= 7) return trimmed.slice(0, -1);
  if (isUpper(trimmed) || isTitleCase(trimmed)) return trimmed;
  return null;
}

/** Splits text into headed sections. Falls back to fixed-size "Part N" chunks when no headings exist. */
export function splitSections(text: string, maxSections = 40): Section[] {
  // A worksheet is not a lesson: keep the questions, in order, in groups. Never invent topics.
  if (looksLikeWorksheet(text)) {
    const qs = splitWorksheetQuestions(text);
    const groups: Section[] = [];
    for (let i = 0; i < qs.length; i += 5) {
      const chunk = qs.slice(i, i + 5);
      groups.push({
        heading:
          chunk.length === 1
            ? `Question ${chunk[0]!.number}`
            : `Questions ${chunk[0]!.number}–${chunk.at(-1)!.number}`,
        body: chunk.map((q) => `${q.number}. ${q.text}`).join("\n"),
      });
    }
    return groups.slice(0, maxSections);
  }
  const lines = normalizeText(text).split("\n");
  const sections: Section[] = [];
  let current: Section | null = null;
  let prevBlank = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const nextNonEmpty = lines.slice(i + 1).find((l) => l.trim() !== "");
    const heading = looksLikeHeading(line, prevBlank, nextNonEmpty !== undefined);
    if (heading) {
      if (current) sections.push(current);
      current = { heading, body: "" };
    } else if (line.trim() !== "") {
      if (!current) current = { heading: "", body: "" };
      current.body += (current.body ? "\n" : "") + line.trim();
    }
    prevBlank = line.trim() === "";
  }
  if (current) sections.push(current);

  const meaningful = sections.filter((s) => s.body.trim() !== "");
  const headed = meaningful.filter((s) => s.heading !== "");
  if (headed.length >= 2) {
    return meaningful
      .map((s, i) => ({
        heading: s.heading || (i === 0 ? "Introduction" : `Section ${i + 1}`),
        body: s.body,
      }))
      .slice(0, maxSections);
  }
  return chunkParagraphs(text, 1500).slice(0, maxSections);
}

function chunkParagraphs(text: string, target: number): Section[] {
  const paragraphs = normalizeText(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if (buf && buf.length + p.length > target) {
      chunks.push(buf);
      buf = "";
    }
    buf += (buf ? "\n\n" : "") + p;
  }
  if (buf) chunks.push(buf);
  return chunks.map((body, i) => ({ heading: `Part ${i + 1}`, body }));
}

export interface ScoredTerm {
  term: string;
  score: number;
  count: number;
}

/**
 * Returns true when a token looks like meaningful text rather than extraction noise.
 *
 * Rejects:
 *  - Pure numbers (page numbers, years used as tokens)
 *  - Time/duration codes like "22h", "90d", "5s", "10min"
 *  - Very short tokens (< 3 chars) that are too ambiguous
 *  - Tokens where fewer than 60% of characters are alphabetic
 *    (catches things like "iol", "als", "ais" if they lack enough letters, but
 *     also catches "$8%", "=F", "UE" which are clearly extraction artifacts)
 *  - Common English stopwords
 *
 * Does NOT reject:
 *  - Legitimate abbreviations like "DNA", "RNA", "CPU"
 *  - Domain terms that happen to be short, like "ion", "LED"
 *  - Words with hyphens or apostrophes (handled by the tokenizer already)
 */
function isGoodKeywordToken(t: string): boolean {
  if (t.length < 3) return false;
  if (STOPWORDS.has(t)) return false;
  if (/^\d+$/.test(t)) return false;
  // Time/duration codes: e.g. "22h", "90d", "5s", "10min", "3hrs"
  if (/^\d+(?:s|m|h|d|w|ms|min|hrs?|days?|wks?|mths?|yrs?)$/i.test(t)) return false;
  // Tokens that are mostly non-alphabetic (extraction noise like "iol", "$8%", "=F")
  const letters = (t.match(/[a-zA-ZÀ-ɏ؀-ۿ]/g) ?? []).length;
  if (letters / t.length < 0.6) return false;
  // Very short tokens (3 chars) must be at least 2/3 alphabetic and not look like an abbreviation
  // This is already covered by the ratio check above (0.6 threshold), so just ensure minimum length.
  return true;
}

/** Ranks candidate key terms by frequency (single words and repeated two-word phrases). */
export function keywordScores(text: string, limit = 30): ScoredTerm[] {
  const tokens = tokenize(text);
  const counts = new Map<string, number>();

  for (const t of tokens) if (isGoodKeywordToken(t)) counts.set(t, (counts.get(t) ?? 0) + 1);

  const bigrams = new Map<string, number>();
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i] as string;
    const b = tokens[i + 1] as string;
    if (isGoodKeywordToken(a) && isGoodKeywordToken(b)) {
      const key = `${a} ${b}`;
      bigrams.set(key, (bigrams.get(key) ?? 0) + 1);
    }
  }
  for (const [phrase, c] of bigrams) if (c >= 2) counts.set(phrase, c * 1.5);

  return [...counts.entries()]
    .map(([term, count]) => ({
      term,
      count: Math.round(count),
      score: count * (term.includes(" ") ? 1.4 : 1),
    }))
    .filter((k) => isMeaningfulTerm(k.term).ok)
    .sort((x, y) => y.score - x.score || x.term.localeCompare(y.term))
    .slice(0, limit);
}

/** Scores sentences by the keyword weight they carry. Returns indices ordered best-first. */
export function rankSentences(sentences: string[], keywords: ScoredTerm[]): number[] {
  const weight = new Map(keywords.map((k) => [k.term, k.score]));
  const scored = sentences.map((s, index) => {
    const toks = tokenize(s);
    let sum = 0;
    for (const t of toks) sum += weight.get(t) ?? 0;
    const lengthPenalty = Math.max(1, toks.length / 18);
    const positionBonus = index < 3 ? 1.15 : 1;
    return { index, score: (sum / lengthPenalty) * positionBonus };
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.index);
}

export interface ExtractedDefinition {
  term: string;
  definition: string;
  excerpt: string;
}

const NON_TERMS = new Set([
  "this",
  "that",
  "it",
  "these",
  "those",
  "there",
  "he",
  "she",
  "they",
  "we",
  "which",
  "what",
  "one",
  "who",
]);

function cleanTerm(raw: string): string | null {
  const term = raw
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/[“”"*_`]/g, "")
    .trim();
  const words = term.split(/\s+/);
  if (term.length < 2 || term.length > 60 || words.length > 6) return null;
  if (NON_TERMS.has(term.toLowerCase())) return null;
  if (words.some((w) => NON_TERMS.has(w.toLowerCase()) && words.length === 1)) return null;
  if (!/\p{L}/u.test(term)) return null;
  // Question numbers ("27 What"), website names and sentence fragments are not terms.
  if (!isMeaningfulTerm(term).ok) return null;
  return term;
}

const DEF_PATTERNS: RegExp[] = [
  /^(?<term>[^,;:.]{2,60}?)\s+(?:is|are)\s+(?:defined as|known as|called|termed|the term for)\s+(?<def>.{15,300})$/iu,
  /^(?<term>[^,;:.]{2,60}?)\s+(?:refers? to|means|stands? for|can be defined as|is defined as)\s+(?<def>.{15,300})$/iu,
  /^(?<term>[^,;:.]{2,60}?)\s+(?:is|are)\s+(?:a|an|the)\s+(?<def>.{15,300})$/iu,
  /^(?<term>[^:]{2,60}?)\s*[:–—]\s+(?<def>[^:]{20,300})$/u,
  // Appositive: "... through stomata, which are tiny pores on the leaf surface ..." (single-word term only)
  /(?:^|[\s(])(?<term>[\p{L}][\p{L}-]{3,30}),\s+which\s+(?:is|are)\s+(?<def>[^,;]{15,300})$/u,
];

/** Finds explicit definitions ("X is a …", "X refers to …", "Term: …"). Only returns what the text says. */
export function extractDefinitions(text: string, limit = 30): ExtractedDefinition[] {
  const found: ExtractedDefinition[] = [];
  const seen = new Set<string>();
  for (const sentence of splitSentences(text)) {
    if (sentence.length > 400) continue;
    for (const re of DEF_PATTERNS) {
      const m = re.exec(sentence);
      const rawTerm = m?.groups?.term;
      const rawDef = m?.groups?.def;
      if (!rawTerm || !rawDef) continue;
      const term = cleanTerm(rawTerm);
      if (!term) continue;
      // The "Term: definition" pattern is only trusted for short, capitalised terms.
      if (re === DEF_PATTERNS[3] && (term.split(/\s+/).length > 4 || !/^[\p{Lu}]/u.test(term)))
        continue;
      if (re === DEF_PATTERNS[4] && STOPWORDS.has(term.toLowerCase())) continue;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      const definition = rawDef.replace(/[.\s]+$/, "") + ".";
      // Only a complete definition that the source really contains is kept.
      if (!isCompleteDefinition(term, definition, text).ok) continue;
      seen.add(key);
      found.push({ term, definition, excerpt: sentence });
      break;
    }
    if (found.length >= limit) break;
  }
  return found;
}

export interface ExtractedFact {
  kind: "date" | "formula";
  value: string;
  context: string;
}

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(
  `\\b(?:(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*\\d{4})?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})(?:\\s+\\d{4})?|(?:${MONTHS})\\s+\\d{4}|\\b(?:1[0-9]{3}|20[0-9]{2})\\b)`,
  "g",
);
const FORMULA_RE = /(?:^|\s)([A-Za-z][\w₀-₉]{0,8}(?:\([^)]*\))?\s*=\s*[^=;,\n]{2,60})/g;

export function extractFacts(text: string, limit = 30): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const seen = new Set<string>();
  for (const sentence of splitSentences(text)) {
    const dates = sentence.match(DATE_RE);
    if (dates) {
      for (const d of dates) {
        const key = `date:${d}:${sentence.slice(0, 40)}`;
        if (seen.has(key)) continue;
        if (!isCompleteFact("date", d, sentence).ok) continue;
        seen.add(key);
        facts.push({ kind: "date", value: d, context: sentence.slice(0, 300) });
      }
    }
    for (const m of sentence.matchAll(FORMULA_RE)) {
      const value = (m[1] ?? "").trim();
      if (!value || seen.has(`formula:${value}`)) continue;
      if (!isCompleteFact("formula", value, sentence).ok) continue;
      seen.add(`formula:${value}`);
      facts.push({ kind: "formula", value, context: sentence.slice(0, 300) });
    }
    if (facts.length >= limit) break;
  }
  return facts.slice(0, limit);
}

export function extractExamples(text: string, limit = 12): string[] {
  return splitSentences(text)
    .filter((s) => /\b(?:for example|for instance|e\.g\.|such as)\b/i.test(s) && s.length <= 400)
    .slice(0, limit);
}

/** Pairs of key terms that appear together in at least two sentences (co-occurrence, not semantics). */
export function coOccurrences(text: string, keywords: ScoredTerm[], limit = 10): string[] {
  const top = keywords
    .filter((k) => !k.term.includes(" "))
    .slice(0, 12)
    .map((k) => k.term);
  const sentences = splitSentences(text).map((s) => new Set(tokenize(s)));
  const pairs: { a: string; b: string; n: number }[] = [];
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i] as string;
      const b = top[j] as string;
      const n = sentences.filter((s) => s.has(a) && s.has(b)).length;
      if (n >= 2) pairs.push({ a, b, n });
    }
  }
  return pairs
    .sort((x, y) => y.n - x.n)
    .slice(0, limit)
    .map(
      (p) =>
        `“${p.a}” and “${p.b}” appear together in ${p.n} sentences (co-occurrence, not a verified relationship).`,
    );
}

/* ─────────────────────────── Source quality validation ─────────────────────────── */

export interface SourceQualityResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validates extracted text quality before generating study material.
 *
 * Returns { ok: true } when the text is good enough to analyse.
 * Returns { ok: false, reason } when the text is garbled, empty, or mostly noise.
 *
 * This is intentionally conservative: legitimate mathematical notation, code,
 * chemical formulas, abbreviations, and multilingual content are NOT rejected.
 */
export function validateSourceQuality(text: string): SourceQualityResult {
  if (text.trim().length === 0) {
    return { ok: false, reason: "The document appears to be empty." };
  }
  const q = analyzeTextQuality(text);
  if (isUsableForGeneration(q)) return { ok: true };
  return {
    ok: false,
    reason: `${q.issues[0]?.message ?? "The text is not readable."} Try a text-based file, a clearer scan, or correct the text first.`,
  };
}

/** Replaces the first whole-word occurrence of `term` in `sentence` with a blank. Returns null if absent. */
export function blankOut(sentence: string, term: string): string | null {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
  if (!re.test(sentence)) return null;
  return sentence.replace(re, "_____");
}

/** Matches the case of the first occurrence of `term` in `sentence`, for use as the blank's answer. */
export function findOriginalCase(sentence: string, term: string): string {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").exec(sentence);
  return m?.[0] ?? term;
}
