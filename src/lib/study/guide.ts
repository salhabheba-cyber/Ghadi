import type { NoteDraft } from "@/lib/ai/types";
import type { GuideBlock, GuideSection, StudyGuide } from "@/lib/validation/schemas";
import { excerptInSource } from "@/lib/study/build";
import {
  appearsInSource,
  isCompleteDefinition,
  isCompleteFormula,
  isMeaningfulTerm,
  pageOf,
} from "@/lib/study/grounding";
import { newId, nowIso } from "@/lib/utils";

/** Source characters per model call. Small enough that the guide for one chunk fits in one response. */
export const GUIDE_CHUNK_CHARS = 6000;

/**
 * Splits a document into chunks on paragraph (then line, then sentence) boundaries so no chunk cuts a
 * sentence in half and nothing is dropped: the chunks, joined, contain the whole text.
 */
export function splitIntoChunks(text: string, max = GUIDE_CHUNK_CHARS): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const units: string[] = [];
  for (const para of clean.split(/\n{2,}/)) {
    if (para.length <= max) {
      units.push(para);
      continue;
    }
    for (const line of para.split("\n")) {
      if (line.length <= max) units.push(line);
      else
        units.push(
          ...(line.match(/[^.!?؟。]+[.!?؟。]*\s*/g) ?? [line]).flatMap((s) => hardSplit(s, max)),
        );
    }
  }
  const chunks: string[] = [];
  let cur = "";
  for (const u of units) {
    if (cur && cur.length + u.length + 2 > max) {
      chunks.push(cur);
      cur = u;
    } else cur = cur ? `${cur}\n\n${u}` : u;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function hardSplit(s: string, max: number): string[] {
  if (s.length <= max) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
  return out;
}

/**
 * Checks model-written blocks against the source and downgrades or removes what cannot be trusted:
 * - a definition quoting text that is not in the source loses its quote and is marked unverified;
 * - an example claiming to come from the document but whose quote is not found becomes "added";
 * - a flow diagram whose edges point at nodes that do not exist is dropped (never repaired by guessing).
 */
export function groundBlocks(blocks: GuideBlock[], sourceText: string): GuideBlock[] {
  return groundBlocksReport(blocks, sourceText).blocks;
}

/**
 * Same as groundBlocks, also counting what was removed so the guide can say so. Removal rules:
 * - a definition whose term is not a real term ("27 What", a website name) or whose meaning is cut off;
 * - a formula that is incomplete (one side empty, dangling operator, unmatched bracket);
 * - an exercise whose text is not actually in the document.
 */
export function groundBlocksReport(
  blocks: GuideBlock[],
  sourceText: string,
): { blocks: GuideBlock[]; dropped: number } {
  const out: GuideBlock[] = [];
  let dropped = 0;
  for (const b of blocks) {
    if (b.type === "definition") {
      if (!isMeaningfulTerm(b.term).ok || !isCompleteDefinition(b.term, b.definition).ok) {
        dropped++;
        continue;
      }
      if (b.sourceExcerpt) {
        const ok = excerptInSource(b.sourceExcerpt, sourceText);
        out.push(
          ok ? { ...b, verified: true } : { ...b, sourceExcerpt: undefined, verified: false },
        );
      } else out.push({ ...b, verified: false });
    } else if (b.type === "formula") {
      if (!isCompleteFormula(b.expression).ok) {
        dropped++;
        continue;
      }
      out.push({ ...b, page: b.page ?? pageOf(sourceText, b.expression) });
    } else if (b.type === "exercise") {
      if (!appearsInSource(b.text, sourceText)) {
        dropped++;
        continue;
      }
      out.push({ ...b, page: b.page ?? pageOf(sourceText, b.text) });
    } else if (b.type === "example") {
      const fromDoc =
        b.source === "document" && b.sourceExcerpt && excerptInSource(b.sourceExcerpt, sourceText);
      out.push({
        ...b,
        source: fromDoc ? "document" : "added",
        sourceExcerpt: fromDoc ? b.sourceExcerpt : undefined,
      });
    } else if (b.type === "flow") {
      const ids = new Set(b.nodes.map((n) => n.id));
      const edges = b.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
      if (ids.size === b.nodes.length && edges.length > 0) out.push({ ...b, edges });
      else dropped++;
    } else if (b.type === "table") {
      const w = b.columns.length;
      out.push({ ...b, rows: b.rows.map((r) => Array.from({ length: w }, (_, i) => r[i] ?? "")) });
    } else out.push(b);
  }
  return { blocks: out, dropped };
}

/** Joins sections that the model repeated across chunks (same heading) so topics are not duplicated. */
export function mergeSections(sections: GuideSection[]): GuideSection[] {
  const byKey = new Map<string, GuideSection>();
  const order: string[] = [];
  for (const s of sections) {
    const key = s.heading.trim().toLowerCase();
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...s, blocks: [...s.blocks] });
      order.push(key);
    } else {
      prev.blocks.push(...s.blocks);
      prev.recap = [prev.recap, s.recap].filter(Boolean).join(" ").slice(0, 1200);
      if (!prev.intro) prev.intro = s.intro;
    }
  }
  return order.map((k) => byKey.get(k)!);
}

export function mergeGlossary(entries: { term: string; meaning: string }[]) {
  const seen = new Set<string>();
  const out: { term: string; meaning: string }[] = [];
  for (const e of entries) {
    const k = e.term.trim().toLowerCase();
    if (
      !isMeaningfulTerm(e.term).ok ||
      e.meaning.trim().length < 6 ||
      /[,;:(\-–—]$/.test(e.meaning.trim())
    )
      continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.sort((a, b) => a.term.localeCompare(b.term));
}

/** Text handed to the overview call: only headings and recaps, never the whole document again. */
export function recapsForOverview(sections: GuideSection[]): string {
  return sections.map((s, i) => `${i + 1}. ${s.heading}: ${s.intro} ${s.recap}`.trim()).join("\n");
}

/**
 * Offline fallback: a structured outline made by rules from the heuristic notes. It reorganises what is
 * in the document; it does not explain it, and the guide says so.
 */
export function outlineFromNote(
  title: string,
  documentId: string,
  note: NoteDraft,
  sourceChars: number,
): StudyGuide {
  const sections: GuideSection[] = [];
  note.sections.forEach((s) => {
    if (!s.body.trim()) return;
    sections.push({
      heading: s.heading.slice(0, 160) || "Section",
      intro: "",
      blocks: [{ type: "paragraph", text: s.body.slice(0, 4000) }],
      recap: "",
    });
  });
  if (note.keyConcepts.length > 0)
    sections.unshift({
      heading: "Key concepts",
      intro: "The main ideas found in the document.",
      blocks: [{ type: "keyPoints", title: "Key concepts", points: note.keyConcepts.slice(0, 12) }],
      recap: "",
    });
  if (note.definitions.length > 0)
    sections.push({
      heading: "Key terms",
      intro: "Definitions found in the document.",
      blocks: note.definitions.slice(0, 30).map((d) => ({
        type: "definition" as const,
        term: d.term,
        definition: d.definition,
        sourceExcerpt: d.sourceExcerpt,
        verified: true,
      })),
      recap: "",
    });
  if (note.facts.length > 0)
    sections.push({
      heading: "Dates and formulas",
      intro: "",
      blocks: [
        {
          type: "keyPoints",
          title: "Important facts",
          points: note.facts
            .slice(0, 12)
            .map((f) => (f.context ? `${f.value} — ${f.context}` : f.value)),
        },
      ],
      recap: "",
    });
  if (sections.length === 0)
    sections.push({
      heading: "Outline",
      intro: "",
      blocks: [{ type: "paragraph", text: note.summary || note.overview || title }],
      recap: "",
    });
  const now = nowIso();
  return {
    id: newId(),
    documentId,
    title,
    origin: "heuristic",
    language: "same as source",
    overview: note.overview || note.summary,
    objectives: [],
    sections,
    finalSummary: note.summary,
    glossary: note.definitions.slice(0, 50).map((d) => ({ term: d.term, meaning: d.definition })),
    notices: [
      "This is an automatic outline made with rules, not an explanation written by an AI model. It reorganises what is in the document. For a full step-by-step explanation with examples and diagrams, generate the guide with OpenAI.",
    ],
    userNotes: "",
    tags: [],
    sourceChars,
    createdAt: now,
    updatedAt: now,
  };
}
