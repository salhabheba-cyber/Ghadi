/**
 * Extracted-text quality check. OCR on photos (handwriting, columns, glare) often yields noise such as
 * "SAREE ESS CX CK < < '", which must never be turned into a "comprehensive explanation" or a quiz.
 * The check is language-light on purpose: it looks at how word-like the tokens are, not at a dictionary.
 */

export type QualityLevel = "good" | "fair" | "poor";

export interface TextQuality {
  /** Share of word-like tokens among non-numeric tokens, 0..1. */
  score: number;
  level: QualityLevel;
  tokens: number;
  lines: number;
  noisyLines: number;
  /** Up to three examples of lines that look like noise, for the review screen. */
  examples: string[];
  /** The text with noisy lines removed (may be empty). */
  cleaned: string;
  /** Human explanation, in English. */
  message: string;
}

const VOWELS = /[aeiouyàâäéèêëîïôöùûüœæáíóúãõ]/i;
const LATIN = /^[A-Za-zÀ-ÖØ-öø-ÿŒœ'’-]+$/;
const ARABIC = /[؀-ۿ]/;

function strip(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** True for a token that looks like a real word. Numbers return null (they are neutral). */
export function wordLike(raw: string): boolean | null {
  const t = strip(raw);
  if (t === "") return false; // pure punctuation / symbols
  if (/^[\d.,:/%-]+$/.test(t)) return null;
  if (ARABIC.test(t)) return t.replace(/[^؀-ۿ]/g, "").length >= 2;
  if (!LATIN.test(t)) return false; // letters mixed with digits/symbols: "X5", "04S"
  if (t.length === 1) return /^[aAiIyYàÀ]$/.test(t);
  if (!VOWELS.test(t)) return false;
  if (/[^aeiouyàâäéèêëîïôöùûüœæáíóúãõ'’-]{5,}/i.test(t)) return false;
  // Inner capital after a lowercase letter ("aFl", "hhFava") is typical OCR noise; camelCase brands are rare in study text.
  if (/[a-zà-ÿ][A-ZÀ-Ý]/.test(t) && t.length <= 8) return false;
  return true;
}

function lineScore(line: string): { good: number; total: number } {
  let good = 0;
  let total = 0;
  for (const tok of line.split(/\s+/).filter(Boolean)) {
    const w = wordLike(tok);
    if (w === null) continue;
    total++;
    if (w) good++;
  }
  return { good, total };
}

/** A line is kept when most of its tokens are word-like and it has at least two real words (or is short but clean). */
function lineIsClean(line: string): boolean {
  const { good, total } = lineScore(line);
  if (total === 0) return /\d/.test(line); // numbers-only lines (page numbers, tables) are harmless
  if (total === 1) return good === 1;
  return good / total >= 0.65 && good >= 2;
}

export function analyzeTextQuality(text: string): TextQuality {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let good = 0;
  let total = 0;
  const kept: string[] = [];
  const bad: string[] = [];
  for (const line of lines) {
    const s = lineScore(line);
    good += s.good;
    total += s.total;
    if (lineIsClean(line)) kept.push(line);
    else bad.push(line);
  }
  const score = total === 0 ? 0 : good / total;
  const level: QualityLevel =
    total < 5 ? "poor" : score >= 0.85 ? "good" : score >= 0.65 ? "fair" : "poor";
  const message =
    level === "good"
      ? "The text looks readable."
      : level === "fair"
        ? "Some of the text looks garbled. Check it before generating study material."
        : "Most of this text is unreadable (random characters or broken words). Ghadi will not explain or quiz you on it.";
  return {
    score,
    level,
    tokens: total,
    lines: lines.length,
    noisyLines: bad.length,
    examples: bad.filter((l) => l.length > 3).slice(0, 3),
    cleaned: kept.join("\n"),
    message,
  };
}

/** Whether Ghadi may generate a study guide or quiz from this text. */
export function isUsableForGeneration(q: TextQuality): boolean {
  return q.level !== "poor";
}
