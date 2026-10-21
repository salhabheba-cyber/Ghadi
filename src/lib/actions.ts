import { createProvider, generateWithFallback, offlineProvider } from "@/lib/ai/registry";
import { ProviderError, type CallOptions } from "@/lib/ai/types";
import { analyzeTextQuality, isUsableForGeneration } from "@/lib/study/quality";
import {
  groundBlocksReport,
  mergeGlossary,
  mergeSections,
  outlineFromNote,
  recapsForOverview,
  splitIntoChunks,
} from "@/lib/study/guide";
import {
  saveDeck,
  saveNote,
  saveQuiz,
  saveGuide,
  getGuideForDocument,
  getDocument,
  addCards,
  loadSettings,
} from "@/lib/storage/repo";
import { buildNote, buildQuiz, finalizeQuestions } from "@/lib/study/build";
import { summaryLooksCopied, normalizeForMatch } from "@/lib/study/grounding";
import { hashText } from "@/lib/study/hash";
import { newId, nowIso } from "@/lib/utils";
import type {
  Difficulty,
  Deck,
  Note,
  Quiz,
  QuestionType,
  StudyDocument,
  StudyGuide,
} from "@/lib/validation/schemas";
import type { CardDraft, NoteDraft, QuestionDraft } from "@/lib/ai/types";

/**
 * UI-facing orchestration. OpenAI (through Ghadi's server) is the only AI engine. When it fails the
 * error is thrown so the screen can show it with a next step; nothing is silently swapped for another
 * generator. The offline rules run only when the caller passes `useOffline` (the learner asked for a
 * basic version without AI), and the result says so.
 *
 * Every function re-reads the document from storage first, so text the learner corrected is the text
 * every AI request is built from.
 */

/** Thrown when the extracted text is too unreliable to teach from. The UI shows the review/edit screen. */
export class UnreadableTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableTextError";
  }
}

/** The stored version of a document (with the learner's corrections), falling back to the argument. */
async function latest(doc: StudyDocument): Promise<StudyDocument> {
  return (await getDocument(doc.id)) ?? doc;
}

function assertReadable(text: string) {
  const q = analyzeTextQuality(text);
  if (!isUsableForGeneration(q)) throw new UnreadableTextError(q.message);
}

export interface GenerationOutcome<T> {
  item: T;
  notices: string[];
}

/** Source characters per request for notes, quizzes and cards. Longer documents are split, never cut. */
const REQUEST_CHARS = 10_000;

function parts(text: string): string[] {
  return splitIntoChunks(text, REQUEST_CHARS);
}

function mergeNotes(drafts: NoteDraft[]): NoteDraft {
  const first = drafts[0]!;
  if (drafts.length === 1) return first;
  const uniq = <T>(items: T[], key: (t: T) => string) => {
    const seen = new Set<string>();
    return items.filter((i) => {
      const k = key(i).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  return {
    ...first,
    summary: drafts
      .map((d) => d.summary)
      .filter(Boolean)
      .join(" "),
    keyConcepts: uniq(
      drafts.flatMap((d) => d.keyConcepts),
      (k) => k,
    ),
    definitions: uniq(
      drafts.flatMap((d) => d.definitions),
      (d) => d.term,
    ),
    sections: drafts.flatMap((d) => d.sections),
    facts: drafts.flatMap((d) => d.facts),
    examples: drafts.flatMap((d) => d.examples),
    relationships: drafts.flatMap((d) => d.relationships),
    checklist: uniq(
      drafts.flatMap((d) => d.checklist),
      (c) => c,
    ),
    notices: uniq(
      drafts.flatMap((d) => d.notices),
      (n) => n,
    ),
  };
}

export async function generateNoteFromDocument(
  input: StudyDocument,
  call: CallOptions = {},
): Promise<GenerationOutcome<Note>> {
  const doc = await latest(input);
  assertReadable(doc.text);
  const settings = await loadSettings();
  const chunks = parts(doc.text);
  const drafts: NoteDraft[] = [];
  const notices: string[] = [];
  let origin: Note["origin"] = "hosted-ai";
  for (const chunk of chunks) {
    const r = await generateWithFallback(
      settings,
      (p, c) =>
        p.generateStudyNotes({ title: doc.title, text: chunk }, { language: "same as source" }, c),
      call,
    );
    origin = r.origin;
    drafts.push(r.value);
    notices.push(...r.notices);
  }
  const merged = mergeNotes(drafts);
  const all = Array.from(new Set(notices));
  if (summaryLooksCopied(merged.summary, doc.text))
    all.push("The summary repeats long passages of the source instead of summarising them.");
  const draft = { ...merged, notices: all };
  const note = await saveNote(
    buildNote({ title: `${doc.title} — study notes`, documentId: doc.id, origin, draft }),
  );
  return { item: note, notices: all };
}

export interface QuizRequest {
  count: number;
  difficulty: Difficulty;
  types: QuestionType[];
  language?: string;
  /** Keep explanations (default true). When false they are stripped before saving. */
  includeExplanations?: boolean;
  /** When the learner sees right/wrong: after each question or at the end (default "end"). */
  feedbackMode?: "immediate" | "end";
}

export async function generateQuizFromDocument(
  input: StudyDocument,
  req: QuizRequest,
  call: CallOptions = {},
  noteId?: string,
): Promise<GenerationOutcome<Quiz>> {
  const doc = await latest(input);
  assertReadable(doc.text);
  const settings = await loadSettings();
  const language = req.language ?? "same as source";
  const chunks = parts(doc.text);
  const perChunk = Math.max(1, Math.ceil(req.count / chunks.length));
  const drafts: QuestionDraft[] = [];
  const notices: string[] = [];
  let origin: Quiz["origin"] = "hosted-ai";
  for (const chunk of chunks) {
    const r = await generateWithFallback(
      settings,
      (p, c) =>
        p.generateQuiz(
          { title: doc.title, text: chunk },
          { count: perChunk, difficulty: req.difficulty, types: req.types, language },
          c,
        ),
      call,
    );
    origin = r.origin;
    drafts.push(...r.value);
    notices.push(...r.notices);
  }
  const { questions, dropped, duplicates, ungrounded } = finalizeQuestions(
    drafts,
    req.difficulty,
    doc.text,
  );
  const out = Array.from(new Set(notices));
  if (dropped > 0)
    out.push(
      `${dropped} generated question${dropped === 1 ? " was" : "s were"} discarded because they were invalid.`,
    );
  if (duplicates > 0)
    out.push(`${duplicates} repeated question${duplicates === 1 ? " was" : "s were"} removed.`);
  if (ungrounded > 0)
    out.push(
      `${ungrounded} question${ungrounded === 1 ? " was" : "s were"} removed because the passage it cited is not in your document.`,
    );
  if (questions.length === 0) {
    throw new Error(
      "Not enough usable content to build quiz questions. Try a longer document or different question types.",
    );
  }
  const kept = questions.slice(0, req.count);
  if (kept.length < req.count)
    out.push(
      `Only ${kept.length} of ${req.count} requested questions could be created from this text.`,
    );
  const quiz = await saveQuiz(
    buildQuiz({
      title: `${doc.title} — quiz`,
      documentId: doc.id,
      noteId,
      origin,
      difficulty: req.difficulty,
      language,
      questions: kept,
      includeExplanations: req.includeExplanations,
      feedbackMode: req.feedbackMode,
    }),
  );
  return { item: quiz, notices: out };
}

/**
 * A practice quiz on a topic, with no source document. This is NOT grounded in the user's material,
 * so it needs OpenAI (offline rules cannot invent questions). It never falls back: a failure is shown.
 */
export async function generateQuizFromTopic(
  topic: string,
  req: QuizRequest,
  call: CallOptions = {},
): Promise<GenerationOutcome<Quiz>> {
  const settings = await loadSettings();
  const provider = createProvider(settings); // throws consent-required until the learner agrees
  const language = req.language ?? "same as source";
  const r = await provider.generateQuiz(
    { title: topic, text: "", topic },
    { count: req.count, difficulty: req.difficulty, types: req.types, language },
    call,
  );
  const { questions, dropped, duplicates } = finalizeQuestions(r.value, req.difficulty);
  if (questions.length === 0) {
    throw new Error("OpenAI did not return any usable questions. Try again or change the topic.");
  }
  const notices = [...r.notices];
  if (dropped + duplicates > 0)
    notices.push(`${dropped + duplicates} invalid or repeated question(s) were removed.`);
  const quiz = await saveQuiz(
    buildQuiz({
      title: `Practice: ${topic}`.slice(0, 200),
      origin: r.origin,
      difficulty: req.difficulty,
      language,
      questions,
      includeExplanations: req.includeExplanations,
      feedbackMode: req.feedbackMode,
      tags: ["topic-based"],
    }),
  );
  return { item: quiz, notices };
}

export async function generateDeckFromDocument(
  input: StudyDocument,
  count: number,
  call: CallOptions = {},
): Promise<GenerationOutcome<Deck>> {
  const doc = await latest(input);
  assertReadable(doc.text);
  const settings = await loadSettings();
  const chunks = parts(doc.text);
  const perChunk = Math.max(1, Math.ceil(count / chunks.length));
  const cards: CardDraft[] = [];
  const notices: string[] = [];
  let origin: Deck["origin"] = "hosted-ai";
  for (const chunk of chunks) {
    const r = await generateWithFallback(
      settings,
      (p, c) =>
        p.generateFlashcards(
          { title: doc.title, text: chunk },
          { count: perChunk, language: "same as source" },
          c,
        ),
      call,
    );
    origin = r.origin;
    cards.push(...r.value);
    notices.push(...r.notices);
  }
  const seen = new Set<string>();
  const unique = cards
    .filter((c) => {
      const k = normalizeForMatch(c.front);
      if (!c.front.trim() || !c.back.trim() || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, count);
  if (unique.length === 0) {
    throw new Error("Not enough usable content to build flashcards. Try a longer document.");
  }
  const now = nowIso();
  const deck = await saveDeck({
    id: newId(),
    title: `${doc.title} — flashcards`,
    description: "",
    documentId: doc.id,
    origin,
    tags: [],
    createdAt: now,
    updatedAt: now,
  });
  await addCards(
    deck.id,
    unique.map((c) => ({
      front: c.front,
      back: c.back,
      explanation: c.explanation,
      sourceRef: c.sourceRef,
      origin,
    })),
  );
  return { item: deck, notices: Array.from(new Set(notices)) };
}

/* ------------------------------- Study guide ------------------------------- */

export interface GuideProgress {
  done: number;
  total: number;
  label: string;
}

/**
 * Builds and saves the study guide for a document ("teach me this material").
 * - Refuses unreliable text (OCR noise, merged questions) instead of explaining nonsense.
 * - OpenAI reads the document part by part, so long documents are covered completely; the parts are
 *   merged, checked against the source (incomplete terms, formulas and invented questions are
 *   removed), then wrapped with an overview and summary.
 * - With `call.useOffline` the learner gets a rule-based outline instead, and the guide says so.
 * Regenerating replaces the document's previous guide.
 */
export async function generateStudyGuide(
  input: StudyDocument,
  opts: { language?: string; onProgress?: (p: GuideProgress) => void } = {},
  call: CallOptions = {},
): Promise<GenerationOutcome<StudyGuide>> {
  const doc = await latest(input);
  assertReadable(doc.text);
  const settings = await loadSettings();
  const language = opts.language ?? "same as source";
  const now = nowIso();
  const previous = await getGuideForDocument(doc.id);
  // The guide shares its document's id: one guide per document, and the library can link to /study/<id>.
  const base = { id: previous?.id ?? doc.id, createdAt: previous?.createdAt ?? now };
  const sourceHash = hashText(doc.text);
  const carried = {
    userNotes: previous?.userNotes ?? "",
    tags: previous?.tags ?? [],
    collectionId: previous?.collectionId,
  };

  if (call.useOffline) {
    opts.onProgress?.({ done: 0, total: 1, label: "Outlining" });
    const note = await offlineProvider.generateStudyNotes(
      { title: doc.title, text: doc.text },
      { language },
    );
    const guide = await saveGuide({
      ...outlineFromNote(doc.title, doc.id, note.value, doc.text.length),
      ...base,
      ...carried,
      sourceHash,
    });
    opts.onProgress?.({ done: 1, total: 1, label: "Done" });
    return { item: guide, notices: guide.notices };
  }

  const provider = createProvider(settings);
  const chunks = splitIntoChunks(doc.text);
  const total = chunks.length + 1;
  const sections = [];
  const glossary = [];
  const notices: string[] = [];
  let dropped = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (call.signal?.aborted) throw new ProviderError("cancelled", "Generation was cancelled.");
    opts.onProgress?.({ done: i, total, label: `Part ${i + 1} of ${chunks.length}` });
    let part;
    try {
      part = await provider.generateGuideSections(
        { title: doc.title, text: chunks[i]!, part: i + 1, parts: chunks.length, language },
        call,
      );
    } catch (e) {
      if (e instanceof ProviderError && e.code !== "cancelled" && chunks.length > 1) {
        throw new ProviderError(
          e.code,
          `Part ${i + 1} of ${chunks.length} failed, so no guide was saved. ${e.message}`,
        );
      }
      throw e;
    }
    for (const sec of part.sections) {
      const g = groundBlocksReport(sec.blocks, doc.text);
      dropped += g.dropped;
      sections.push({ ...sec, blocks: g.blocks });
    }
    glossary.push(...part.glossary);
    notices.push(...part.notices);
  }
  const merged = mergeSections(sections.filter((s) => s.blocks.length > 0));
  if (merged.length === 0) {
    throw new ProviderError(
      "invalid-output",
      "OpenAI did not return any usable sections. Try again.",
    );
  }
  opts.onProgress?.({ done: chunks.length, total, label: "Writing the overview" });
  const wrap = await provider.generateGuideOverview(
    { title: doc.title, recaps: recapsForOverview(merged), language },
    call,
  );
  const unverified = merged
    .flatMap((s) => s.blocks)
    .filter((b) => b.type === "definition" && b.verified === false).length;
  const copied = summaryLooksCopied(wrap.finalSummary, doc.text);
  const guide = await saveGuide({
    ...base,
    ...carried,
    documentId: doc.id,
    title: doc.title,
    origin: provider.origin,
    language,
    overview: wrap.overview,
    objectives: wrap.objectives,
    sections: merged,
    finalSummary: wrap.finalSummary,
    glossary: mergeGlossary(glossary),
    notices: [
      `Written by ${provider.label} from your document. AI can make mistakes: compare with the original, especially numbers and definitions.`,
      ...(dropped > 0
        ? [
            `${dropped} item(s) were left out because they were incomplete or not supported by your document.`,
          ]
        : []),
      ...(unverified > 0
        ? [
            `${unverified} definition(s) could not be matched to a quote in your document and are marked.`,
          ]
        : []),
      ...(copied
        ? ["The final summary repeats long passages of your document instead of summarising it."]
        : []),
      ...Array.from(new Set(notices)).slice(0, 5),
    ],
    sourceChars: doc.text.length,
    sourceHash,
    updatedAt: now,
  });
  opts.onProgress?.({ done: total, total, label: "Done" });
  return { item: guide, notices: guide.notices };
}

/** True when a "simpler explanation" just hands the passage back. */
export function looksEchoed(result: string, passage: string): boolean {
  const r = normalizeForMatch(result);
  const p = normalizeForMatch(passage);
  if (!r) return true;
  if (r === p) return true;
  if (p.length >= 20 && r.includes(p) && r.length < p.length * 1.5) return true;
  const rw = new Set(r.split(" "));
  const pw = new Set(p.split(" "));
  let shared = 0;
  for (const w of pw) if (rw.has(w)) shared++;
  const jaccard = shared / (rw.size + pw.size - shared || 1);
  return pw.size >= 6 && jaccard > 0.85;
}

/**
 * Explains a selected passage again in simpler words with OpenAI. The result is checked: if it only
 * repeats the passage, one stricter retry is made, and if that fails too an error is thrown rather
 * than showing the original sentence as if it were an explanation.
 */
export async function simplifyPassage(
  passage: string,
  context: string | undefined,
  language = "same as source",
  call: CallOptions = {},
): Promise<string> {
  const settings = await loadSettings();
  const provider = createProvider(settings);
  const clean = passage.trim().slice(0, 1000);
  if (clean.length < 3) throw new ProviderError("invalid-output", "Select a passage to explain.");
  const ctx = context?.slice(0, 1500);
  const first = await provider.simplify({ concept: clean, context: ctx, language }, call);
  if (!looksEchoed(first, clean)) return first.trim();
  const retry = await provider.simplify(
    {
      concept: clean,
      context:
        `${ctx ?? ""}\n\nYour previous answer repeated the passage. Do NOT repeat or quote it: explain what it means in different, simpler words.`.trim(),
      language,
    },
    call,
  );
  if (looksEchoed(retry, clean)) {
    throw new ProviderError(
      "invalid-output",
      "OpenAI only repeated the passage instead of explaining it. Try again, or select a longer passage.",
    );
  }
  return retry.trim();
}
