/**
 * Extracted-text reliability check: the gate every generator passes through.
 *
 * Photos and scans (and some PDFs) give text such as "SAREE ESS CX CK < < '", questions glued
 * together, decimal points that fell apart, or exponents that moved to another line. Explaining or
 * quizzing on that produces confident-looking nonsense, so it is detected here first.
 *
 * Design rules:
 *  - No dictionary: the check works for any language and for text that is mostly mathematics.
 *  - Legitimate mathematics (3x + 5 = 20, 2.5cm, x^2, a/b, √9, π r²), scientific notation, units and
 *    other scripts (Arabic, Cyrillic, Greek, CJK…) are never treated as noise.
 *  - Each finding is an explained issue with examples, so the learner can see what to fix.
 *  - "poor" blocks generation; "fair" asks the learner to review first.
 */

export type QualityLevel = "good" | "fair" | "poor";

export type IssueCode =
  | "empty"
  | "too-short"
  | "encoding"
  | "noise"
  | "symbols"
  | "repeated"
  | "merged-questions"
  | "missing-questions"
  | "broken-numbers"
  | "cut-expressions"
  | "fragments"
  | "uncertain";

export interface QualityIssue {
  code: IssueCode;
  /** "block" makes the text unusable until fixed; "warn" asks for a review. */
  severity: "warn" | "block";
  message: string;
  examples: string[];
}

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
  /** Everything that looks unreliable, most serious first. */
  issues: QualityIssue[];
}

const VOWELS = /[aeiouyàâäéèêëîïôöùûüœæáíóúãõ]/i;
const LATIN = /^[A-Za-zÀ-ÖØ-öø-ÿŒœ'’-]+$/;
const ARABIC = /[؀-ۿ]/;
const OTHER_SCRIPT_WORD = /^[\p{L}\p{M}'’-]+$/u;
const HAS_LATIN_LETTER = /\p{Script=Latin}/u;
const LOGOGRAPHIC = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Short words that are normal in mathematics and science text (units, functions). */
const MATH_WORDS = new Set(
  (
    "sin cos tan cot sec csc log ln exp lim max min sqrt abs mod gcd lcm mol hz kg mg cm mm km ml dl " +
    "pa kpa mpa kj cal kcal ev joule watt volt amp ohm atm rpm mph kph cos sinh cosh tanh arcsin arccos arctan"
  ).split(/\s+/),
);

const GREEK_SINGLE = /^[α-ωΑ-Ω]$/u;
const NUMBER_TOKEN = /^[(\[]?[-−+]?\d[\d.,]*[)\]]?[%°]?[.,:;?)]*$/;
const OPERATOR_TOKEN = /^[+\-−–×÷*/=<>≤≥≠≈^()[\]{}|%:;,.±√∑∏∫πΔ∞·∙→⇒↔∈∉⊂∪∩!?_]+$/;

function strip(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Tokens that are clearly mathematical notation: neutral, neither word nor noise. */
function isMathNotation(raw: string): boolean {
  const t = raw.replace(/^[(\[]+|[)\].,;:?!]+$/g, "");
  if (t === "") return false;
  if (/[√∑∏∫πΔ∞±≤≥≠≈²³⁴⁵⁶⁷⁸⁹⁰¹½¼¾°]/u.test(t)) return true;
  if (/^[1-9]\d*([.,]\d+)?[a-z]{1,3}$/.test(t)) return true; // 3x, 2.5cm, 10kg
  if (/^[A-Za-z0-9]+[\^_][-+−]?[A-Za-z0-9(]+\)?$/.test(t)) return true; // x^2, H_2, a_n
  if (/^[A-Za-z0-9.]+\/[A-Za-z0-9.]+$/.test(t)) return true; // a/b, m/s, 3/4
  if (/^(sqrt|root)\(.*\)?$/i.test(t)) return true;
  if (/^[0-9.,]+[eE][-+]?\d+$/.test(t)) return true; // 6.02e23
  if (/^[A-Za-z]\(.+\)$/.test(t)) return true; // f(x)
  return false;
}

/** True for a token that looks like a real word. Numbers and clear math notation return null (neutral). */
export function wordLike(raw: string): boolean | null {
  const t = strip(raw);
  if (t === "") return isMathNotation(raw) ? null : false; // pure punctuation / symbols
  if (/^[\d.,:/%-]+$/.test(t)) return null;
  if (isMathNotation(raw)) return null;
  if (ARABIC.test(t)) return t.replace(/[^؀-ۿ]/g, "").length >= 2;
  if (GREEK_SINGLE.test(t)) return null;
  if (!LATIN.test(t)) {
    // Other scripts (Cyrillic, Greek, Hebrew, Devanagari, CJK…): letters only is a word.
    if (OTHER_SCRIPT_WORD.test(t) && !HAS_LATIN_LETTER.test(t))
      return LOGOGRAPHIC.test(t) ? true : t.length >= 2;
    return false; // letters mixed with digits/symbols: "X5", "04S"
  }
  if (t.length === 1) return /^[aAiIyYàÀ]$/.test(t);
  if (MATH_WORDS.has(t.toLowerCase())) return true;
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

/**
 * A line of mathematics ("Find x if 3x + 5 = 20.", "2.5 + 4 = 6.5 cm") is clean even though it has
 * few dictionary-style words: it has numbers and operators and almost nothing that fits neither.
 */
function isMathLine(line: string): boolean {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || !/\d/.test(line)) return false;
  let foreign = 0;
  let operators = 0;
  for (const tok of tokens) {
    const bare = tok.replace(/^[(\[]+|[)\].,;:?!]+$/g, "");
    if (OPERATOR_TOKEN.test(tok) && /[+\-−×÷*/=<>≤≥≠≈^]/.test(tok)) {
      operators++;
      continue;
    }
    if (NUMBER_TOKEN.test(tok) || OPERATOR_TOKEN.test(tok)) continue;
    if (/^[A-Za-z]$/.test(bare) || GREEK_SINGLE.test(bare)) continue; // a variable
    if (isMathNotation(tok)) {
      operators++;
      continue;
    }
    if (MATH_WORDS.has(bare.toLowerCase())) continue;
    if (wordLike(tok) === true) continue;
    foreign++;
  }
  return operators > 0 && foreign / tokens.length <= 0.2;
}

/** A line is kept when most of its tokens are word-like and it has at least two real words (or is short but clean). */
function lineIsClean(line: string): boolean {
  if (isMathLine(line)) return true;
  const { good, total } = lineScore(line);
  if (total === 0) return /\d/.test(line); // numbers-only lines (page numbers, tables) are harmless
  if (total === 1) return good === 1;
  return good / total >= 0.65 && good >= 2;
}

/* ------------------------------- Detectors ------------------------------- */

const MARKER_LINE = /^--- Page \d+ ---$/;
const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function detectEncoding(text: string): QualityIssue | null {
  const replacement = (text.match(/�/g) ?? []).length;
  const mojibake = (text.match(/Ã[\u0080-¿]|â€[\u0090-¿™˜œ]|Â[ -¿]/g) ?? []).length;
  const size = Math.max(text.length, 1);
  const bad = replacement + mojibake * 2;
  if (bad === 0) return null;
  return {
    code: "encoding",
    severity: bad / size > 0.01 || bad >= 12 ? "block" : "warn",
    message:
      "The text contains broken characters (an encoding problem, e.g. “Ã©” instead of “é”). Letters and symbols may be wrong.",
    examples: [],
  };
}

function detectSymbols(lines: string[]): QualityIssue | null {
  const SAFE = new Set(["->", "=>", "<=", ">=", "!=", "==", "...", "--", "---", "<->", "|", "||"]);
  let symbolTokens = 0;
  let total = 0;
  const examples: string[] = [];
  for (const line of lines) {
    const hasTable = / \| /.test(line);
    const tokens = line.split(/\s+/).filter(Boolean);
    tokens.forEach((tok, i) => {
      total++;
      if (tok.length < 2 || SAFE.has(tok) || (hasTable && tok === "|")) return;
      // Markdown structure, not scanning marks: "## Heading", "**bold**" markers, "> quote".
      if (i === 0 && /^(?:#{1,6}|>{1,3})$/.test(tok)) return;
      if (/^(?:\*\*|__)$/.test(tok)) return;
      if (/^[~`^|\\<>{}_*#@¬¦§¤¢£¥]{2,}$/.test(tok) || /[~`|\\{}_#@¬¦§¤¢]{3,}/.test(tok)) {
        symbolTokens++;
        if (examples.length < 3) examples.push(short(line));
      }
    });
  }
  if (total === 0 || symbolTokens === 0) return null;
  const ratio = symbolTokens / total;
  if (symbolTokens < 3 && ratio < 0.03) return null;
  return {
    code: "symbols",
    severity: ratio > 0.1 ? "block" : "warn",
    message: "There are runs of stray symbols that look like scanning marks, not content.",
    examples,
  };
}

function detectRepeats(lines: string[]): QualityIssue | null {
  const norm = lines
    .map((l) => l.toLowerCase().replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 8 && !MARKER_LINE.test(l));
  if (norm.length < 6) return null;
  const counts = new Map<string, number>();
  for (const l of norm) counts.set(l, (counts.get(l) ?? 0) + 1);
  let dupes = 0;
  const examples: string[] = [];
  for (const [l, n] of counts)
    if (n > 1) {
      dupes += n - 1;
      if (examples.length < 3) examples.push(short(l));
    }
  const ratio = dupes / norm.length;
  if (dupes < 3 || ratio < 0.25) return null;
  return {
    code: "repeated",
    severity: ratio > 0.5 ? "block" : "warn",
    message: `${Math.round(ratio * 100)}% of the lines repeat earlier lines. The scan may have read the same area more than once.`,
    examples,
  };
}

interface Item {
  n: number;
  line: string;
  lineIndex: number;
}

/** Numbered items ("1.", "2)", "Q3") found at the start of a line. */
function numberedItems(lines: string[]): Item[] {
  const items: Item[] = [];
  lines.forEach((line, lineIndex) => {
    const m = /^(?:q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.)]\s+\S/i.exec(line);
    if (m) items.push({ n: Number(m[1]), line, lineIndex });
  });
  return items;
}

function detectQuestions(lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const items = numberedItems(lines);
  if (items.length < 3) return issues;

  // 1. Two numbered items on one line: "…? 4. Find …" means a line break was lost.
  const merged: string[] = [];
  for (const it of items) {
    const rest = it.line.slice(it.line.search(/\S\s+\S/) + 1);
    const inner = /[?.:;)!\]]\s+(\d{1,3})\s*[.)]\s+(?=[A-ZÀ-Ý(\d])/g;
    for (const m of rest.matchAll(inner)) {
      const next = Number(m[1]);
      if (next === it.n + 1 || next === it.n + 2) {
        merged.push(short(it.line));
        break;
      }
    }
  }
  // 2. One item that is far too long and asks several things.
  for (const it of items)
    if (it.line.length > 500 && (it.line.match(/\?/g) ?? []).length >= 3)
      merged.push(short(it.line));
  const unique = Array.from(new Set(merged));
  if (unique.length > 0) {
    issues.push({
      code: "merged-questions",
      severity: unique.length >= 4 || unique.length / items.length >= 0.3 ? "block" : "warn",
      message: `${unique.length} question(s) appear to be run together with the next one, so their boundaries are unclear.`,
      examples: unique.slice(0, 3),
    });
  }

  // 3. Gaps or repeats in the question numbering.
  const seq = items.map((i) => i.n);
  const missing: number[] = [];
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1]!;
    const cur = seq[i]!;
    if (cur > prev + 1 && cur - prev <= 4) for (let k = prev + 1; k < cur; k++) missing.push(k);
  }
  const repeated = seq.filter((n, i) => i > 0 && n === seq[i - 1]).length;
  if (missing.length >= 1 && seq.length >= 5) {
    issues.push({
      code: "missing-questions",
      severity: "warn",
      message: `Question number${missing.length > 1 ? "s" : ""} ${missing.slice(0, 5).join(", ")} ${missing.length > 1 ? "are" : "is"} missing between the others. A question may have been lost or merged.`,
      examples: [],
    });
  } else if (repeated >= 2) {
    issues.push({
      code: "missing-questions",
      severity: "warn",
      message: "Some question numbers appear twice in a row, which usually means a misread number.",
      examples: [],
    });
  }
  return issues;
}

function detectBrokenNumbers(lines: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const spaced: string[] = [];
  const orphans: string[] = [];
  const unbalanced: string[] = [];
  let mathLines = 0;
  for (const line of lines) {
    if (MARKER_LINE.test(line)) continue;
    // "3 . 5" / "0 , 25": a decimal point or comma detached from its digits.
    if (/\d\s+[.,]\s*\d|\d\s*[.,]\s+\d/.test(line) && !/^\d+[.)]\s/.test(line)) {
      // "5. 6" can be a list; only count when digits on both sides are short and the line is not a numbered item.
      spaced.push(short(line));
    }
    // An equation fragment with an operator but nothing on one side: "= 5", "12 +", "× 3".
    if (/^\s*[=+×÷*/^]\s*\S/.test(line) || /[=+×÷*/^]\s*$/.test(line)) orphans.push(short(line));
    if (/\d/.test(line) && /[=+×÷*/^()]/.test(line)) {
      mathLines++;
      const open = (line.match(/[([{]/g) ?? []).length;
      const close = (line.match(/[)\]}]/g) ?? []).length;
      if (open !== close && !/^\d+[.)]\s/.test(line.replace(/\d+\)/, "")))
        unbalanced.push(short(line));
    }
  }
  if (spaced.length >= 3)
    issues.push({
      code: "broken-numbers",
      severity: spaced.length >= 8 ? "block" : "warn",
      message:
        "Decimal points or commas are separated from their digits (like “3 . 5”), so numbers may be misread.",
      examples: spaced.slice(0, 3),
    });
  if (orphans.length >= 3)
    issues.push({
      code: "cut-expressions",
      severity: "warn",
      message:
        "Several expressions start or end with an operator and nothing beside it, so part of a formula may be missing.",
      examples: orphans.slice(0, 3),
    });
  if (unbalanced.length >= 3 && unbalanced.length / Math.max(mathLines, 1) >= 0.2)
    issues.push({
      code: "cut-expressions",
      severity: "warn",
      message: "Brackets do not match in several expressions, so they may be cut off or misread.",
      examples: unbalanced.slice(0, 3),
    });
  return issues;
}

function detectFragments(lines: string[]): QualityIssue | null {
  const content = lines.filter((l) => !MARKER_LINE.test(l));
  if (content.length < 12) return null;
  const tiny = content.filter(
    (l) => l.length <= 3 && !/^\d+[.)]?$/.test(l) && !/^[A-Da-d][.)]$/.test(l),
  );
  const ratio = tiny.length / content.length;
  if (tiny.length < 6 || ratio < 0.25) return null;
  return {
    code: "fragments",
    severity: ratio > 0.5 ? "block" : "warn",
    message:
      "Many lines are only one or two characters long. Text was probably split into pieces (columns or a tilted photo).",
    examples: tiny.slice(0, 3),
  };
}

function detectUncertain(text: string, lines: number): QualityIssue | null {
  const marks = text.match(/\[(?:unclear|illegible|\?)\]/g) ?? [];
  if (marks.length === 0) return null;
  const ratio = marks.length / Math.max(lines, 1);
  return {
    code: "uncertain",
    severity: ratio > 0.25 ? "block" : "warn",
    message: `${marks.length} part(s) of the text were marked unclear when it was read. Check or correct them.`,
    examples: [],
  };
}

/* -------------------------------- Analysis -------------------------------- */

export function analyzeTextQuality(text: string): TextQuality {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !MARKER_LINE.test(l));
  let good = 0;
  let total = 0;
  const kept: string[] = [];
  const bad: string[] = [];
  for (const line of lines) {
    const mathy = isMathLine(line);
    const s = lineScore(line);
    // A mathematical line counts as readable even though it has few "words".
    good += mathy ? Math.max(s.good, s.total) : s.good;
    total += s.total;
    if (lineIsClean(line)) kept.push(line);
    else bad.push(line);
  }
  const score = total === 0 ? 0 : good / total;
  const wordLevel: QualityLevel =
    total < 5 &&
    !(lines.length >= 3 && lines.every((l) => lineIsClean(l)) && lines.some((l) => /\d/.test(l)))
      ? "poor"
      : score >= 0.85
        ? "good"
        : score >= 0.65
          ? "fair"
          : "poor";

  const issues: QualityIssue[] = [];
  if (lines.length === 0) {
    issues.push({
      code: "empty",
      severity: "block",
      message: "No text was found.",
      examples: [],
    });
  } else if (total < 5 && wordLevel === "poor") {
    issues.push({
      code: "too-short",
      severity: "block",
      message: "There is too little text to study from.",
      examples: [],
    });
  }
  const enc = detectEncoding(text);
  if (enc) issues.push(enc);
  if (wordLevel !== "good" && lines.length > 0 && total >= 5) {
    issues.push({
      code: "noise",
      severity: wordLevel === "poor" ? "block" : "warn",
      message:
        wordLevel === "poor"
          ? "Most of this text is unreadable (random characters or broken words)."
          : "Some of the text looks garbled (random characters or broken words).",
      examples: bad.filter((l) => l.length > 3).slice(0, 3),
    });
  }
  const symbols = detectSymbols(lines);
  if (symbols) issues.push(symbols);
  const repeats = detectRepeats(lines);
  if (repeats) issues.push(repeats);
  issues.push(...detectQuestions(lines));
  issues.push(...detectBrokenNumbers(lines));
  const fragments = detectFragments(lines);
  if (fragments) issues.push(fragments);
  const uncertain = detectUncertain(text, lines.length);
  if (uncertain) issues.push(uncertain);

  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "block" ? -1 : 1));
  const blocked = issues.some((i) => i.severity === "block");
  const level: QualityLevel = blocked
    ? "poor"
    : issues.length > 0 || wordLevel === "fair"
      ? "fair"
      : "good";

  const message =
    level === "good"
      ? "The text looks readable."
      : level === "fair"
        ? `Check the text before generating study material: ${issues[0]?.message ?? "some of it looks garbled."}`
        : `This text is not reliable enough to study from. ${issues[0]?.message ?? ""} Ghadi will not explain or quiz you on it until it is corrected.`.trim();

  return {
    score,
    level,
    tokens: total,
    lines: lines.length,
    noisyLines: bad.length,
    examples: bad.filter((l) => l.length > 3).slice(0, 3),
    cleaned: kept.join("\n"),
    message,
    issues,
  };
}

/** Whether Ghadi may generate a study guide or quiz from this text. */
export function isUsableForGeneration(q: TextQuality): boolean {
  return q.level !== "poor";
}
