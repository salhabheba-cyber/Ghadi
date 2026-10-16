/**
 * Deterministic dictation comparison (typed text only — this is NOT handwriting recognition).
 * Word-level alignment: matches, near-misses (likely misspellings), wrong words, missing words and extra words,
 * plus separate notes for capital letters and punctuation so spelling errors are not mixed up with them.
 */
export type DiffKind = "correct" | "misspelled" | "wrong" | "missing" | "extra";
export interface DiffItem {
  kind: DiffKind;
  expected?: string;
  typed?: string;
  /** Right word, but capital letter differs. */
  capitalDiff?: boolean;
  /** Right word, but the punctuation attached to it differs. */
  punctDiff?: boolean;
}
export interface DictationResult {
  items: DiffItem[];
  expectedWords: number;
  /** Words spelled correctly (ignoring capitals and punctuation, which are reported separately). */
  correctWords: number;
  accuracy: number; // correctWords / expectedWords, 0..1
  capitalNotes: number;
  punctuationNotes: number;
}

const PUNCT = /[\p{P}\p{S}]/gu;
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // harakat, tatweel

function core(word: string, lang: string): string {
  let w = word.normalize("NFC").replace(PUNCT, "");
  if (lang === "ar") w = w.replace(ARABIC_MARKS, "").replace(/[إأآٱ]/g, "ا");
  return w.toLocaleLowerCase(lang);
}
const fold = (w: string) => w.normalize("NFD").replace(/\p{M}/gu, "");
const punctOf = (word: string) => (word.match(PUNCT) ?? []).join("");
const tokenize = (t: string) => t.trim().split(/\s+/).filter(Boolean);

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n]!;
}

export function compareDictation(expectedText: string, typedText: string, lang: "en" | "fr" | "ar" = "en"): DictationResult {
  const exp = tokenize(expectedText), typ = tokenize(typedText);
  const ec = exp.map((w) => core(w, lang)), tc = typ.map((w) => core(w, lang));
  const n = exp.length, m = typ.length;
  // Needleman–Wunsch: gaps cost 1; a substitution is allowed only for similar words (<= half the letters differ).
  const subCost = (i: number, j: number) => {
    if (ec[i] === tc[j]) return 0;
    if (fold(ec[i]!) === fold(tc[j]!)) return 0.2; // same letters, accent differs: a spelling slip, not a different word
    const d = lev(ec[i]!, tc[j]!), r = d / Math.max(ec[i]!.length, tc[j]!.length, 1);
    return r <= 0.5 ? r : 2;
  };
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) D[i]![0] = i;
  for (let j = 1; j <= m; j++) D[0]![j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i]![j] = Math.min(D[i - 1]![j]! + 1, D[i]![j - 1]! + 1, D[i - 1]![j - 1]! + subCost(i - 1, j - 1));
  const items: DiffItem[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i]![j]! === D[i - 1]![j - 1]! + subCost(i - 1, j - 1) && subCost(i - 1, j - 1) < 2) {
      const same = ec[i - 1] === tc[j - 1];
      const item: DiffItem = { kind: same ? "correct" : "misspelled", expected: exp[i - 1], typed: typ[j - 1] };
      if (same) {
        const e = exp[i - 1]!.replace(PUNCT, ""), t = typ[j - 1]!.replace(PUNCT, "");
        if (e !== t && e.toLocaleLowerCase(lang) === t.toLocaleLowerCase(lang)) item.capitalDiff = true;
        if (punctOf(exp[i - 1]!) !== punctOf(typ[j - 1]!)) item.punctDiff = true;
      }
      items.push(item); i--; j--;
    } else if (i > 0 && D[i]![j]! === D[i - 1]![j]! + 1) { items.push({ kind: "missing", expected: exp[i - 1] }); i--; }
    else { items.push({ kind: "extra", typed: typ[j - 1] }); j--; }
  }
  items.reverse();
  // A missing word next to an extra word (a replaced word that was too different to count as a misspelling) is reported as "wrong".
  const merged: DiffItem[] = [];
  for (const it of items) {
    const prev = merged[merged.length - 1];
    if (prev && ((prev.kind === "missing" && it.kind === "extra") || (prev.kind === "extra" && it.kind === "missing"))) {
      merged[merged.length - 1] = { kind: "wrong", expected: prev.expected ?? it.expected, typed: prev.typed ?? it.typed };
    } else merged.push(it);
  }
  const correctWords = merged.filter((x) => x.kind === "correct").length;
  return {
    items: merged,
    expectedWords: n,
    correctWords,
    accuracy: n === 0 ? 0 : correctWords / n,
    capitalNotes: merged.filter((x) => x.capitalDiff).length,
    punctuationNotes: merged.filter((x) => x.punctDiff).length,
  };
}
