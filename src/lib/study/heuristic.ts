import type { CardDraft, CardOptions, NoteDraft, QuestionDraft, QuizOptions } from "@/lib/ai/types";
import type { Difficulty, QuestionType } from "@/lib/validation/schemas";
import { countWords } from "@/lib/utils";
import { seededRandom, pickMany } from "./rng";
import {
  blankOut,
  candidateSentences,
  coOccurrences,
  extractDefinitions,
  extractExamples,
  extractFacts,
  findOriginalCase,
  keywordScores,
  rankSentences,
  splitSections,
  tokenize,
  type ScoredTerm,
} from "./text";

/**
 * Offline study generation. These are explainable text heuristics, NOT an AI model:
 *  - notes reuse sentences from the source verbatim (ranked by key-term frequency);
 *  - definitions are only reported when the text contains a definition pattern;
 *  - quiz questions are built from definitions, blanked sentences, and sentences with swapped key terms.
 * Everything produced here is labelled "heuristic" so it is never mistaken for model output.
 */

export const MAX_ANALYSIS_CHARS = 300_000;

export const HEURISTIC_NOTICE =
  "Generated offline by Ghadi's text heuristics. No AI model was used. Review this material before relying on it.";

function limitText(text: string, notices: string[]): string {
  if (text.length <= MAX_ANALYSIS_CHARS) return text;
  notices.push(
    `The source is very long, so only the first ${MAX_ANALYSIS_CHARS.toLocaleString()} characters were analysed.`,
  );
  return text.slice(0, MAX_ANALYSIS_CHARS);
}

function singleWordKeywords(keywords: ScoredTerm[]): ScoredTerm[] {
  return keywords.filter((k) => !k.term.includes(" "));
}

/* --------------------------------- Notes -------------------------------- */

export function generateNotesHeuristic(title: string, rawText: string): NoteDraft {
  const notices: string[] = [HEURISTIC_NOTICE];
  const text = limitText(rawText, notices);
  const words = countWords(text);
  const keywords = keywordScores(text, 30);
  const sentences = candidateSentences(text);
  const sections = splitSections(text);

  if (words < 80) {
    notices.push(
      "The source text is short, so these notes are thin. Import more material for richer notes.",
    );
  }

  const ranked = rankSentences(sentences, keywords);
  const summaryCount = Math.min(
    sentences.length,
    Math.max(3, Math.min(8, Math.round(sentences.length * 0.15))),
  );
  const summaryIdx = ranked.slice(0, summaryCount).sort((a, b) => a - b);
  const summary = summaryIdx.map((i) => sentences[i]).join(" ");
  if (!summary) notices.push("No full sentences were found to summarise.");

  const definitions = extractDefinitions(text).map((d) => ({
    term: d.term,
    definition: d.definition,
    sourceExcerpt: d.excerpt,
    provenance: "extracted" as const,
  }));
  if (definitions.length === 0) {
    notices.push(
      "No explicit definitions were detected in the source (patterns like “X is a …” or “X refers to …”).",
    );
  }

  const noteSections = sections.map((s) => {
    const sSentences = candidateSentences(s.body);
    const order = rankSentences(sSentences, keywords)
      .slice(0, 3)
      .sort((a, b) => a - b);
    const body =
      order.length > 0 ? order.map((i) => sSentences[i]).join(" ") : s.body.slice(0, 400);
    return {
      heading: s.heading,
      body,
      sourceExcerpt: sSentences[0] ?? s.body.slice(0, 200),
      provenance: "extracted" as const,
    };
  });

  const facts = extractFacts(text);
  const examples = extractExamples(text);
  const relationships = coOccurrences(text, keywords);
  const keyConcepts = keywords.slice(0, 12).map((k) => k.term);

  const checklist = [
    ...noteSections.slice(0, 10).map((s) => `Review: ${s.heading}`),
    ...definitions.slice(0, 10).map((d) => `Be able to define: ${d.term}`),
    ...facts.slice(0, 5).map((f) => `Remember the ${f.kind}: ${f.value}`),
  ];

  const overview =
    `${title} — ${words.toLocaleString()} words in ${sections.length} section${sections.length === 1 ? "" : "s"}.` +
    (keyConcepts.length > 0 ? ` Most frequent terms: ${keyConcepts.slice(0, 6).join(", ")}.` : "");

  return {
    overview,
    summary,
    keyConcepts,
    definitions,
    sections: noteSections,
    facts: facts.map((f) => ({ kind: f.kind, value: f.value, context: f.context })),
    examples,
    relationships,
    checklist,
    notices,
  };
}

/* -------------------------------- Questions ----------------------------- */

const TYPE_ORDER: Record<Difficulty, QuestionType[]> = {
  easy: ["mcq", "tf", "fill", "short"],
  medium: ["mcq", "fill", "tf", "short"],
  hard: ["short", "fill", "mcq", "tf"],
};

export function generateQuestionsHeuristic(
  rawText: string,
  options: QuizOptions,
): { questions: QuestionDraft[]; notices: string[] } {
  const notices: string[] = [
    "Questions were generated offline by Ghadi's text heuristics (no AI model) and are not fact-checked. Review them before relying on them.",
  ];
  const text = limitText(rawText, notices);
  const rng = seededRandom(
    `${text.slice(0, 500)}|${text.length}|${options.count}|${options.difficulty}|${options.types.join()}`,
  );
  const sentences = candidateSentences(text);
  const keywords = keywordScores(text, 40);
  const singles = singleWordKeywords(keywords);
  // Easy questions use the most frequent terms; hard questions reach for less common ones first.
  const termPool =
    options.difficulty === "hard" ? [...singles.slice(4), ...singles.slice(0, 4)] : singles;
  const defs = extractDefinitions(text);
  const ranked = rankSentences(sentences, keywords);

  if (countWords(text) < 80)
    notices.push("The source is short, so fewer distinct questions are possible.");
  if (options.language !== "same as source" && !/^english$/i.test(options.language)) {
    notices.push(
      `Offline generation cannot translate: questions are in the source's language, not ${options.language}. Use a local or hosted AI model for translated output.`,
    );
  }

  const used = new Set<string>();
  const make = (type: QuestionType): QuestionDraft[] => {
    const out: QuestionDraft[] = [];
    const d = options.difficulty;

    if (type === "mcq") {
      for (const def of defs) {
        if (def.definition.toLowerCase().includes(def.term.toLowerCase())) continue;
        const keep = (t: string) =>
          t.toLowerCase() !== def.term.toLowerCase() &&
          !def.term.toLowerCase().includes(t.toLowerCase());
        // Other defined terms make the best distractors; plain keywords only fill the gaps.
        const definedTerms = Array.from(new Set(defs.map((x) => x.term).filter(keep)));
        const keywordTerms = Array.from(new Set(termPool.map((k) => k.term).filter(keep))).filter(
          (t) => !definedTerms.some((x) => x.toLowerCase() === t.toLowerCase()),
        );
        const first = pickMany(definedTerms, 3, rng);
        const distractors = [...first, ...pickMany(keywordTerms, 3 - first.length, rng)];
        if (distractors.length < 2) continue;
        const choices = pickMany([def.term, ...distractors], 4, rng);
        out.push({
          type: "mcq",
          prompt: `Which term matches this description from the source: “${def.definition.replace(/\.$/, "")}”?`,
          options: choices,
          correct: [def.term],
          explanation: `The source defines “${def.term}” this way: ${def.excerpt}`,
          difficulty: d,
          sourceExcerpt: def.excerpt,
        });
      }
      for (const idx of ranked) {
        const s = sentences[idx] as string;
        const target = termPool.find((k) => blankOut(s, k.term) !== null);
        if (!target) continue;
        const blanked = blankOut(s, target.term) as string;
        const answer = findOriginalCase(s, target.term);
        const distractors = pickMany(
          termPool
            .map((k) => k.term)
            .filter(
              (t) =>
                t.toLowerCase() !== target.term.toLowerCase() &&
                !s.toLowerCase().includes(t.toLowerCase()),
            ),
          3,
          rng,
        );
        if (distractors.length < 2) continue;
        out.push({
          type: "mcq",
          prompt: `Which word best completes this sentence from the source? “${blanked}”`,
          options: pickMany([answer, ...distractors], 4, rng),
          correct: [answer],
          explanation: `The original sentence reads: ${s}`,
          difficulty: d,
          sourceExcerpt: s,
        });
      }
    }

    if (type === "tf") {
      let flip = false;
      for (const idx of ranked) {
        const s = sentences[idx] as string;
        flip = !flip;
        if (!flip) {
          out.push({
            type: "tf",
            prompt: `True or false: ${s}`,
            options: ["True", "False"],
            correct: ["True"],
            explanation: "This statement is taken directly from the source text.",
            difficulty: d,
            sourceExcerpt: s,
          });
          continue;
        }
        const inSentence = termPool.find((k) => blankOut(s, k.term) !== null);
        const replacement = inSentence
          ? termPool.find(
              (k) => k.term !== inSentence.term && !s.toLowerCase().includes(k.term.toLowerCase()),
            )
          : undefined;
        if (!inSentence || !replacement) continue;
        const altered = s.replace(
          new RegExp(
            `(?<![\\p{L}\\p{N}])${inSentence.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
            "iu",
          ),
          replacement.term,
        );
        out.push({
          type: "tf",
          prompt: `True or false: ${altered}`,
          options: ["True", "False"],
          correct: ["False"],
          explanation: `A key term was swapped by the generator. The source actually says: ${s}`,
          difficulty: d,
          sourceExcerpt: s,
        });
      }
    }

    if (type === "fill") {
      for (const idx of ranked) {
        const s = sentences[idx] as string;
        if (s.length > 260) continue;
        const target = termPool.find((k) => blankOut(s, k.term) !== null);
        if (!target) continue;
        out.push({
          type: "fill",
          prompt: `Fill in the blank: ${blankOut(s, target.term) as string}`,
          correct: [findOriginalCase(s, target.term)],
          explanation: `The original sentence reads: ${s}`,
          difficulty: d,
          sourceExcerpt: s,
        });
      }
    }

    if (type === "short") {
      for (const def of defs) {
        out.push({
          type: "short",
          prompt: `In your own words, what is “${def.term}”?`,
          correct: [def.definition],
          explanation: `The source says: ${def.excerpt}`,
          difficulty: d,
          sourceExcerpt: def.excerpt,
        });
      }
      for (const k of singles.slice(0, 12)) {
        const s = ranked
          .map((i) => sentences[i] as string)
          .find((x) => tokenize(x).includes(k.term));
        if (!s) continue;
        out.push({
          type: "short",
          prompt: `What does the source say about “${k.term}”?`,
          correct: [s],
          explanation: `A relevant sentence from the source: ${s}`,
          difficulty: d,
          sourceExcerpt: s,
        });
      }
    }
    return out;
  };

  const order = TYPE_ORDER[options.difficulty].filter((t) => options.types.includes(t));
  const pools = new Map<QuestionType, QuestionDraft[]>(order.map((t) => [t, make(t)]));
  const picked: QuestionDraft[] = [];

  let progressed = true;
  while (picked.length < options.count && progressed) {
    progressed = false;
    for (const type of order) {
      if (picked.length >= options.count) break;
      const pool = pools.get(type) ?? [];
      while (pool.length > 0) {
        const q = pool.shift() as QuestionDraft;
        const key = `${q.type}|${q.sourceExcerpt ?? q.prompt}`;
        if (used.has(key)) continue;
        used.add(key);
        picked.push(q);
        progressed = true;
        break;
      }
    }
  }

  if (picked.length < options.count) {
    notices.push(
      `Only ${picked.length} question${picked.length === 1 ? "" : "s"} could be generated from this source (you asked for ${options.count}).`,
    );
  }
  if (picked.length === 0) {
    notices.push(
      "Not enough usable text was found to build questions. Try adding more material or create questions manually.",
    );
  }
  return { questions: picked, notices };
}

/* -------------------------------- Flashcards ---------------------------- */

export function generateCardsHeuristic(
  rawText: string,
  options: CardOptions,
): { cards: CardDraft[]; notices: string[] } {
  const notices: string[] = [
    "Flashcards were generated offline by Ghadi's text heuristics (no AI model). Review them before studying.",
  ];
  const text = limitText(rawText, notices);
  const sentences = candidateSentences(text);
  const keywords = keywordScores(text, 40);
  const singles = singleWordKeywords(keywords);
  const ranked = rankSentences(sentences, keywords);
  const cards: CardDraft[] = [];
  const used = new Set<string>();

  for (const d of extractDefinitions(text)) {
    if (cards.length >= options.count) break;
    cards.push({ front: d.term, back: d.definition, explanation: undefined, sourceRef: d.excerpt });
    used.add(d.excerpt);
  }

  for (const idx of ranked) {
    if (cards.length >= options.count) break;
    const s = sentences[idx] as string;
    if (used.has(s) || s.length > 260) continue;
    const target = singles.find((k) => blankOut(s, k.term) !== null);
    if (!target) continue;
    used.add(s);
    cards.push({
      front: `Fill in the blank: ${blankOut(s, target.term) as string}`,
      back: findOriginalCase(s, target.term),
      explanation: s,
      sourceRef: s,
    });
  }

  if (options.language !== "same as source" && !/^english$/i.test(options.language)) {
    notices.push(
      `Offline generation cannot translate: cards are in the source's language, not ${options.language}.`,
    );
  }
  if (cards.length < options.count) {
    notices.push(
      `Only ${cards.length} card${cards.length === 1 ? "" : "s"} could be generated from this source (you asked for ${options.count}).`,
    );
  }
  return { cards, notices };
}

/** A short extractive summary: the highest-ranked sentences, in their original order. */
export function summarizeHeuristic(rawText: string, maxSentences = 5): string {
  const text = rawText.slice(0, MAX_ANALYSIS_CHARS);
  const sentences = candidateSentences(text);
  const ranked = rankSentences(sentences, keywordScores(text, 30))
    .slice(0, maxSentences)
    .sort((a, b) => a - b);
  return ranked.map((i) => sentences[i]).join(" ");
}
