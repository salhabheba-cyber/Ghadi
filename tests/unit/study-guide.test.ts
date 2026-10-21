import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateStudyGuide, UnreadableTextError } from "@/lib/actions";
import { __setDbForTests, GhadiDB } from "@/lib/storage/db";
import { createBackup, parseBackup, restoreBackup } from "@/lib/storage/backup";
import {
  getGuideForDocument,
  loadSettings,
  saveDocument,
  saveGuide,
  saveSettings,
} from "@/lib/storage/repo";
import { processPastedText, toStudyDocument } from "@/lib/document-processing/process";
import { groundBlocks, mergeSections, outlineFromNote, splitIntoChunks } from "@/lib/study/guide";
import { generateNotesHeuristic } from "@/lib/study/heuristic";
import type { GuideBlock } from "@/lib/validation/schemas";

const PARA =
  "Photosynthesis is the process plants use to turn light into chemical energy in chloroplasts.";
const LONG = Array.from(
  { length: 80 },
  (_, i) => `${PARA} Fact number ${i} about chlorophyll and glucose.`,
).join("\n\n");

beforeEach(() => __setDbForTests(new GhadiDB(`guide-${Math.random()}`)));
afterEach(() => vi.unstubAllGlobals());

async function doc(text: string, title = "Plants") {
  return saveDocument(toStudyDocument(processPastedText(title, text)));
}

/** Pretends to be Ghadi's /api/ai/generate route, answering each guide task with valid JSON. */
function mockServer(opts: { failPart?: number } = {}) {
  const calls: { task: string; part?: number; text?: string }[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as {
      task: string;
      payload: { part?: number; text?: string };
    };
    calls.push({ task: body.task, part: body.payload.part, text: body.payload.text });
    if (body.task === "guide-section" && body.payload.part === opts.failPart)
      return new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    const n = body.payload.part ?? 1;
    const out =
      body.task === "guide-section"
        ? {
            sections: [
              {
                heading: n === 1 ? "Light reactions" : `Topic ${n}`,
                intro: "What happens first.",
                recap: `Recap ${n}`,
                blocks: [
                  { type: "paragraph", text: "Plants capture light." },
                  {
                    type: "definition",
                    term: "Chlorophyll",
                    definition: "The green pigment that absorbs light.",
                    sourceExcerpt: "invented quote that is not in the document at all",
                  },
                  {
                    type: "flow",
                    title: "Process",
                    nodes: [
                      { id: "a", label: "Light" },
                      { id: "b", label: "Energy" },
                    ],
                    edges: [
                      { from: "a", to: "b" },
                      { from: "a", to: "ghost" },
                    ],
                  },
                ],
              },
            ],
            glossary: [{ term: "Chlorophyll", meaning: "Green pigment" }],
            notices: [],
          }
        : {
            overview: "An overview.",
            objectives: ["Explain photosynthesis"],
            finalSummary: "In short.",
          };
    return new Response(JSON.stringify({ text: JSON.stringify(out) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

describe("splitIntoChunks", () => {
  it("covers the whole document without cutting paragraphs", () => {
    const chunks = splitIntoChunks(LONG, 3000);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 3000)).toBe(true);
    for (let i = 0; i < 80; i++) expect(chunks.join("\n")).toContain(`Fact number ${i} about`);
  });
  it("splits a huge unbroken paragraph", () => {
    expect(splitIntoChunks("word ".repeat(5000), 1000).length).toBeGreaterThan(20);
  });
});

describe("groundBlocks", () => {
  const src = "Chlorophyll absorbs red and blue light in the chloroplast of leaf cells.";
  it("verifies real quotes and flags invented ones", () => {
    const blocks: GuideBlock[] = [
      {
        type: "definition",
        term: "Chlorophyll",
        definition: "The pigment that absorbs red and blue light.",
        sourceExcerpt: "absorbs red and blue light",
      },
      {
        type: "definition",
        term: "Chloroplast",
        definition: "The organelle in which leaf cells capture light.",
        sourceExcerpt: "this sentence never appeared anywhere",
      },
    ];
    const [a, b] = groundBlocks(blocks, src) as Extract<GuideBlock, { type: "definition" }>[];
    expect(a!.verified).toBe(true);
    expect(b!.verified).toBe(false);
    expect(b!.sourceExcerpt).toBeUndefined();
  });
  it("downgrades an example that claims to be from the document but is not", () => {
    const [e] = groundBlocks(
      [
        {
          type: "example",
          title: "t",
          text: "x",
          source: "document",
          sourceExcerpt: "totally made up passage here",
        },
      ],
      src,
    ) as Extract<GuideBlock, { type: "example" }>[];
    expect(e!.source).toBe("added");
  });
  it("drops flow diagrams that reference unknown nodes instead of repairing them", () => {
    const out = groundBlocks(
      [
        {
          type: "flow",
          title: "bad",
          nodes: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          edges: [{ from: "a", to: "zzz" }],
        },
        {
          type: "flow",
          title: "ok",
          nodes: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          edges: [
            { from: "a", to: "b" },
            { from: "b", to: "q" },
          ],
        },
      ],
      src,
    );
    expect(out).toHaveLength(1);
    expect((out[0] as Extract<GuideBlock, { type: "flow" }>).edges).toEqual([
      { from: "a", to: "b" },
    ]);
  });
  it("pads ragged table rows", () => {
    const [t] = groundBlocks(
      [{ type: "table", title: "t", columns: ["a", "b", "c"], rows: [["1"]] }],
      src,
    ) as Extract<GuideBlock, { type: "table" }>[];
    expect(t!.rows[0]).toEqual(["1", "", ""]);
  });
});

describe("mergeSections", () => {
  it("joins repeated headings from different chunks", () => {
    const s = (h: string, t: string) => ({
      heading: h,
      intro: "",
      recap: t,
      blocks: [{ type: "paragraph" as const, text: t }],
    });
    const m = mergeSections([s("Cells", "one"), s("cells", "two"), s("Other", "x")]);
    expect(m).toHaveLength(2);
    expect(m[0]!.blocks).toHaveLength(2);
  });
});

describe("generateStudyGuide (hosted AI, mocked)", () => {
  beforeEach(async () => {
    await saveSettings({ ...(await loadSettings()), hostedConsent: true });
  });

  it("reads a long document chunk by chunk, grounds it, wraps it up and saves it", async () => {
    const d = await doc(LONG);
    const calls = mockServer();
    const progress: string[] = [];
    const { item } = await generateStudyGuide(d, { onProgress: (p) => progress.push(p.label) });
    const chunks = splitIntoChunks(d.text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(calls.filter((c) => c.task === "guide-section")).toHaveLength(chunks.length);
    expect(calls.filter((c) => c.task === "guide-overview")).toHaveLength(1);
    // Every part of the document went to the model.
    const sent = calls
      .filter((c) => c.task === "guide-section")
      .map((c) => c.text)
      .join("\n");
    for (const i of [0, 40, 79]) expect(sent).toContain(`Fact number ${i} about`);
    expect(item.origin).toBe("hosted-ai");
    expect(item.overview).toBe("An overview.");
    expect(item.objectives).toEqual(["Explain photosynthesis"]);
    expect(item.glossary).toEqual([{ term: "Chlorophyll", meaning: "Green pigment" }]);
    const defs = item.sections.flatMap((s) => s.blocks).filter((b) => b.type === "definition");
    expect(defs.every((b) => b.type === "definition" && b.verified === false)).toBe(true);
    expect(item.notices.join(" ")).toMatch(/could not be matched/);
    const flows = item.sections.flatMap((s) => s.blocks).filter((b) => b.type === "flow");
    expect(flows.every((b) => b.type === "flow" && b.edges.length === 1)).toBe(true);
    expect(progress.at(-1)).toBe("Done");
    // Persisted and reopenable.
    expect((await getGuideForDocument(d.id))?.id).toBe(item.id);
  });

  it("regenerating replaces the guide but keeps the learner's notes", async () => {
    const d = await doc("Photosynthesis uses light. ".repeat(40));
    mockServer();
    const first = (await generateStudyGuide(d)).item;
    await saveGuide({ ...first, userNotes: "my own words" });
    const second = (await generateStudyGuide(d)).item;
    expect(second.id).toBe(first.id);
    expect(second.userNotes).toBe("my own words");
  });

  it("saves nothing and says which part failed when a chunk fails", async () => {
    const d = await doc(LONG);
    mockServer({ failPart: 2 });
    await expect(generateStudyGuide(d)).rejects.toThrow(
      /Part 2 of \d+ failed, so no guide was saved/,
    );
    expect(await getGuideForDocument(d.id)).toBeUndefined();
  });

  it("refuses garbled OCR text without calling the AI", async () => {
    const d = await saveDocument({
      ...toStudyDocument(
        processPastedText(
          "Photo",
          "BD 0\nSAREE ESS CX CK < < ' <\nKY, 34 Vk \\ Wx j vi > /, / /\nAA - .\nBn R \\ 0 1 | ' A Be bod i | c\nSa K 1 | i {| 1 Wf\n7 PV PI VEYA D0 [Sk W hh Fava FIR",
        ),
      ),
    });
    const calls = mockServer();
    await expect(generateStudyGuide(d)).rejects.toBeInstanceOf(UnreadableTextError);
    expect(calls).toHaveLength(0);
  });
});

describe("generateStudyGuide (offline)", () => {
  it("builds an honestly labelled rule-based outline", async () => {
    const d = await doc(
      "# Cells\n\nA cell is the basic unit of life. Cells contain a nucleus, which stores DNA.\n\n# Energy\n\nMitochondria make ATP for the cell.",
    );
    const { item } = await generateStudyGuide(d, {}, { useOffline: true });
    expect(item.origin).toBe("heuristic");
    expect(item.notices[0]).toMatch(/not an explanation written by an AI/);
    expect(item.sections.length).toBeGreaterThan(0);
  });
  it("outlineFromNote always yields at least one section", () => {
    const note = generateNotesHeuristic(
      "T",
      "Short but readable sentence about the topic at hand.",
    );
    expect(
      outlineFromNote(
        "T",
        "d1",
        { ...note, sections: [], keyConcepts: [], definitions: [], facts: [] },
        10,
      ).sections.length,
    ).toBe(1);
  });
});

describe("backup", () => {
  it("includes study guides and restores them", async () => {
    const d = await doc("Photosynthesis uses light. ".repeat(40));
    const { item } = await generateStudyGuide(d, {}, { useOffline: true });
    const backup = parseBackup(JSON.stringify(await createBackup()));
    expect(backup.data.guides.map((g) => g.id)).toEqual([item.id]);
    __setDbForTests(new GhadiDB(`guide-restore-${Math.random()}`));
    await restoreBackup(backup, "replace");
    expect((await getGuideForDocument(d.id))?.title).toBe("Plants");
  });
});
