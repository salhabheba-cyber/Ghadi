/**
 * Builds a short comprehension check straight from the book's own text (no AI, no network): "which word is
 * missing from this sentence?". It rewards having actually read the book, and it always works offline.
 */
export interface BookContent {
  lang: string;
  dir: string;
  chapters: { id: string; title: string; blocks: { t: string; x?: string; src?: string }[] }[];
}
export interface ChoiceQuestion {
  /** cloze: fill in the missing word; sentence: pick the line that is in this story; question: free-form question text. */
  kind: "cloze" | "sentence" | "question";
  prompt: string;
  options: string[];
  answer: number;
}

/** Books this short are checked with "which line is from this story?" instead of a missing word. */
export const SHORT_BOOK_WORDS = 600;

const STOP: Record<string, Set<string>> = {
  en: new Set(
    "that this with have from they were their there which would about could other these then them than what when your said into some very only over also just like been will more much".split(
      " ",
    ),
  ),
  fr: new Set(
    "dans pour avec cette sont leur leurs être avait elle elles nous vous mais comme tout tous plus bien sans sous fait faire alors encore aussi était étaient cela ceux celle ainsi après avant où dont quand".split(
      " ",
    ),
  ),
  ar: new Set(
    "التي الذي هذا هذه ذلك على إلى عن في من مع كان كانت هناك ولكن لكن حتى بعد قبل عند أن إن".split(
      " ",
    ),
  ),
};

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?؟…»”])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 180);
}
const WORD = /^[\p{L}]{5,13}$/u;
function tokens(s: string): string[] {
  return s.split(/[\s,;:.!?؟()«»“”"…—–-]+/u).filter(Boolean);
}

/** Deterministic given `rand` (injectable for tests). */
export function buildClozeQuestions(
  content: BookContent,
  count = 3,
  rand: () => number = Math.random,
): ChoiceQuestion[] {
  const stop = STOP[content.lang] ?? new Set<string>();
  const paragraphs: string[] = [];
  const all = content.chapters
    .flatMap((c) => c.blocks)
    .filter((b) => b.t === "p" && b.x)
    .map((b) => b.x!);
  const startAt = all.length > 40 ? Math.floor(all.length * 0.35) : 0; // quiz on later parts: you cannot answer without reading on
  paragraphs.push(...all.slice(startAt));
  const sentences = paragraphs.flatMap(sentencesOf);
  const pool = new Map<string, number>();
  for (const w of all.flatMap((p) => tokens(p))) {
    const k = w.toLocaleLowerCase();
    if (WORD.test(w) && !stop.has(k)) pool.set(k, (pool.get(k) ?? 0) + 1);
  }
  const vocab = [...pool.keys()];
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };
  const out: ChoiceQuestion[] = [];
  const used = new Set<string>();
  for (const s of shuffle(sentences)) {
    if (out.length >= count) break;
    const cands = tokens(s).filter(
      (w) =>
        WORD.test(w) &&
        !stop.has(w.toLocaleLowerCase()) &&
        (pool.get(w.toLocaleLowerCase()) ?? 0) <= 6,
    );
    const target = cands[0] && shuffle(cands)[0];
    if (!target || used.has(target.toLocaleLowerCase())) continue;
    const tl = target.toLocaleLowerCase();
    const distractors = shuffle(
      vocab.filter(
        (w) =>
          w !== tl && Math.abs(w.length - tl.length) <= 2 && !s.toLocaleLowerCase().includes(w),
      ),
    ).slice(0, 3);
    if (distractors.length < 3) continue;
    const opts = shuffle([tl, ...distractors]);
    used.add(tl);
    const blanked = s.replace(
      new RegExp(`(?<![\\p{L}])${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u"),
      "_____",
    );
    if (blanked === s) continue;
    out.push({ kind: "cloze", prompt: blanked, options: opts, answer: opts.indexOf(tl) });
  }
  return out;
}

/** For very short (picture) books: which of these lines is from the story you just read? Distractors come from other stories. */
export function buildStoryQuestions(
  content: BookContent,
  otherBooks: BookContent[],
  count = 3,
  rand: () => number = Math.random,
): ChoiceQuestion[] {
  const own = content.chapters
    .flatMap((c) => c.blocks)
    .filter((b) => b.t === "p" && b.x && b.x.length >= 12)
    .map((b) => b.x!);
  const foreign = otherBooks
    .flatMap((o) => o.chapters.flatMap((c) => c.blocks))
    .filter((b) => b.t === "p" && b.x && b.x.length >= 12 && b.x.length <= 140)
    .map((b) => b.x!);
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };
  const ownSet = new Set(own);
  const wrongPool = shuffle([...new Set(foreign)].filter((x) => !ownSet.has(x)));
  const out: ChoiceQuestion[] = [];
  const picked = shuffle(own).slice(0, count);
  let w = 0;
  for (const line of picked) {
    const wrong = wrongPool.slice(w, w + 3);
    w += 3;
    if (wrong.length < 3) break;
    const opts = shuffle([line, ...wrong]);
    out.push({ kind: "sentence", prompt: "", options: opts, answer: opts.indexOf(line) });
  }
  return out;
}
