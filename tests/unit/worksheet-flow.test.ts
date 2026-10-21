import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateStudyGuide, simplifyPassage, UnreadableTextError } from "@/lib/actions";
import { ProviderError } from "@/lib/ai/types";
import { processPastedText, toStudyDocument } from "@/lib/document-processing/process";
import { __setDbForTests, GhadiDB } from "@/lib/storage/db";
import {
  correctDocumentText,
  getDocument,
  getGuideForDocument,
  loadSettings,
  restoreOriginalText,
  saveDocument,
  saveSettings,
} from "@/lib/storage/repo";
import { hashText } from "@/lib/study/hash";
import { MATH_WORKSHEET, MERGED_QUESTIONS } from "../fixtures/worksheets";

interface Call {
  task: string;
  payload: Record<string, unknown>;
}

/** A stand-in for Ghadi's /api/ai/generate route: records every request and answers like OpenAI would. */
function mockOpenAi(handler: (c: Call) => unknown | Response) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    expect(url).toBe("/api/ai/generate"); // nothing else (no Ollama, no other provider) is ever contacted
    const body = JSON.parse(init.body as string) as Call & { consent: boolean };
    expect(body.consent).toBe(true);
    const call = { task: body.task, payload: body.payload };
    calls.push(call);
    const out = handler(call);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify({ text: JSON.stringify(out) }), {
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

const guideSection = (c: Call) => ({
  sections: [
    {
      heading: "Questions 1-7",
      intro: "Practice questions on fractions, equations and areas.",
      recap: "Seven practice questions.",
      blocks: [
        {
          type: "exercise",
          number: "1",
          text: "Simplify 3/4 + 2/3.",
          approach: "Find a common denominator.",
        },
        {
          type: "exercise",
          number: "2",
          text: "Solve 2x + 5 = 17 for x.",
          approach: "Isolate x.",
        },
        // Invented question: not in the document.
        {
          type: "exercise",
          number: "8",
          text: "Differentiate sin(x) with respect to x.",
          approach: "Use the derivative of sine.",
        },
        // Junk the old pipeline produced.
        { type: "definition", term: "27 What", definition: "Is the value of the expression shown" },
        { type: "formula", name: "Broken", expression: "2x + 5 =", explanation: "" },
        {
          type: "formula",
          name: "Linear",
          expression: "2x + 5 = 17",
          explanation: "A linear equation.",
        },
      ],
    },
  ],
  glossary: [
    { term: "mathsworksheets.com", meaning: "Free printable worksheets for every" },
    { term: "Denominator", meaning: "The bottom number of a fraction" },
  ],
  notices: [],
  ...(c.payload.part ? {} : {}),
});

const overview = {
  overview: "A worksheet of practice questions.",
  objectives: ["Add fractions"],
  finalSummary: "Practice adding fractions and solving a linear equation.",
};

async function saveText(text: string) {
  return saveDocument(toStudyDocument(processPastedText("Maths worksheet", text)));
}

beforeEach(async () => {
  __setDbForTests(new GhadiDB(`flow-${Math.random()}`));
  await saveSettings({ ...(await loadSettings()), hostedConsent: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("maths worksheet: import → validate → generate", () => {
  it("imports a clean worksheet as readable and keeps its questions in order", async () => {
    const p = processPastedText("Maths worksheet", MATH_WORKSHEET);
    expect(p.status).toBe("ready");
    expect(p.warnings).toEqual([]);
    expect(p.text.indexOf("1. Simplify")).toBeLessThan(p.text.indexOf("7. A car travels"));
  });

  it("builds the guide from OpenAI, drops invented and incomplete items, and saves it with a fingerprint", async () => {
    const doc = await saveText(MATH_WORKSHEET);
    const calls = mockOpenAi((c) => (c.task === "guide-section" ? guideSection(c) : overview));
    const { item } = await generateStudyGuide(doc);

    expect(item.origin).toBe("hosted-ai");
    expect(item.sourceHash).toBe(hashText(doc.text));
    const blocks = item.sections.flatMap((s) => s.blocks);
    const exercises = blocks.filter((b) => b.type === "exercise");
    expect(exercises.map((b) => b.type === "exercise" && b.number)).toEqual(["1", "2"]);
    expect(exercises[0]).toMatchObject({ page: 1 });
    expect(blocks.some((b) => b.type === "exercise" && /sin\(x\)/.test(b.text))).toBe(false);
    expect(blocks.some((b) => b.type === "definition" && /27 What/.test(b.term))).toBe(false);
    const formulas = blocks.filter((b) => b.type === "formula");
    expect(formulas.map((b) => b.type === "formula" && b.expression)).toEqual(["2x + 5 = 17"]);
    expect(item.glossary).toEqual([
      { term: "Denominator", meaning: "The bottom number of a fraction" },
    ]);
    expect(item.notices.join(" ")).toMatch(
      /left out because they were incomplete or not supported/,
    );
    // OpenAI saw the real worksheet, not a paraphrase.
    const sent = calls.find((c) => c.task === "guide-section")!.payload.text as string;
    expect(sent).toContain("2. Solve 2x + 5 = 17 for x.");
    expect((await getGuideForDocument(doc.id))?.id).toBe(item.id);
  });
});

describe("unreliable text is not turned into a confident guide", () => {
  it("refuses merged questions, explains why, and sends nothing to OpenAI", async () => {
    const doc = await saveText(MERGED_QUESTIONS);
    const calls = mockOpenAi(() => ({}));
    await expect(generateStudyGuide(doc)).rejects.toBeInstanceOf(UnreadableTextError);
    await expect(generateStudyGuide(doc)).rejects.toThrow(/run together/);
    expect(calls).toHaveLength(0);
    expect(await getGuideForDocument(doc.id)).toBeUndefined();
  });

  it("uses the learner's corrected text in every later AI request and keeps the original for comparison", async () => {
    const doc = await saveText(MERGED_QUESTIONS);
    const fixed = MATH_WORKSHEET;
    const corrected = await correctDocumentText(doc.id, fixed);
    expect(corrected.originalText).toBe(doc.text);
    expect(corrected.textEditedAt).toBeTruthy();
    expect(corrected.warnings).toContain("Text corrected by you.");

    const calls = mockOpenAi((c) => (c.task === "guide-section" ? guideSection(c) : overview));
    // Pass the STALE object on purpose: actions must re-read the stored, corrected document.
    const { item } = await generateStudyGuide(doc);
    const sent = calls.find((c) => c.task === "guide-section")!.payload.text as string;
    expect(sent).toContain("6. Factorise x^2 − 9.");
    expect(sent).not.toContain("www.mathsworksheets.com");
    expect(item.sourceHash).toBe(hashText(corrected.text));

    // A second correction is detected as making the guide out of date.
    const again = await correctDocumentText(doc.id, fixed + "\n8. Find 10% of 250.");
    expect(again.originalText).toBe(doc.text); // still the very first extraction
    expect(hashText(again.text)).not.toBe(item.sourceHash);

    const restored = await restoreOriginalText(doc.id);
    expect(restored.text).toBe(doc.text);
    expect(restored.originalText).toBeUndefined();
    expect((await getDocument(doc.id))?.text).toBe(doc.text);
  });
});

describe("OpenAI failures are shown, not hidden", () => {
  it("surfaces a missing key as an error and saves no guide", async () => {
    const doc = await saveText(MATH_WORKSHEET);
    mockOpenAi(
      () =>
        new Response(
          JSON.stringify({
            error: { code: "not-configured", message: "OpenAI is not set up on this server." },
          }),
          { status: 501 },
        ),
    );
    await expect(generateStudyGuide(doc)).rejects.toMatchObject({ code: "not-configured" });
    expect(await getGuideForDocument(doc.id)).toBeUndefined();
  });

  it.each([
    [429, "rate-limited"],
    [401, "invalid-key"],
  ])(
    "a %i from the server stays a %s error and does not produce offline output",
    async (status, code) => {
      const doc = await saveText(MATH_WORKSHEET);
      mockOpenAi(
        () => new Response(JSON.stringify({ error: { code, message: "no" } }), { status }),
      );
      await expect(generateStudyGuide(doc)).rejects.toBeInstanceOf(ProviderError);
      expect(await getGuideForDocument(doc.id)).toBeUndefined();
    },
  );

  it("malformed AI output is retried once, then reported", async () => {
    const doc = await saveText(MATH_WORKSHEET);
    const calls = mockOpenAi(() => ({ sections: "nonsense" }));
    await expect(generateStudyGuide(doc)).rejects.toMatchObject({ code: "invalid-output" });
    expect(calls.length).toBe(2);
  });

  it("is blocked without the learner's permission and sends nothing", async () => {
    await saveSettings({ ...(await loadSettings()), hostedConsent: false });
    const doc = await saveText(MATH_WORKSHEET);
    const calls = mockOpenAi(() => ({}));
    await expect(generateStudyGuide(doc)).rejects.toMatchObject({ code: "consent-required" });
    expect(calls).toHaveLength(0);
  });

  it("offline outline happens only when explicitly requested and is labelled", async () => {
    const doc = await saveText(MATH_WORKSHEET);
    const calls = mockOpenAi(() => ({}));
    const { item } = await generateStudyGuide(doc, {}, { useOffline: true });
    expect(calls).toHaveLength(0);
    expect(item.origin).toBe("heuristic");
    expect(item.notices.join(" ")).toMatch(/not an explanation written by an AI/);
    expect(JSON.stringify(item)).not.toMatch(/geograph/i);
  });
});

describe("Explain simpler", () => {
  const passage = "Simplify 3/4 + 2/3 by finding a common denominator first.";

  it("sends the passage and context to OpenAI and returns its real explanation", async () => {
    const calls = mockOpenAi(() => ({
      text: "Fractions need the same bottom number before you can add them. Here that number is 12.",
    }));
    const out = await simplifyPassage(passage, "Questions 1-7", "French");
    expect(out).toMatch(/same bottom number/);
    expect(calls[0]).toMatchObject({
      task: "simplify",
      payload: { concept: passage, sourceExcerpt: "Questions 1-7", language: "French" },
    });
  });

  it("never returns the original sentence as the explanation", async () => {
    const calls = mockOpenAi(() => ({ text: passage }));
    await expect(simplifyPassage(passage, undefined)).rejects.toThrow(/only repeated the passage/);
    expect(calls).toHaveLength(2); // one stricter retry, then an honest error
    expect(String(calls[1]!.payload.sourceExcerpt)).toMatch(/Do NOT repeat/);
  });

  it("recovers when the retry gives a real explanation", async () => {
    let n = 0;
    mockOpenAi(() => ({
      text: n++ === 0 ? passage : "Add fractions by first giving them the same denominator.",
    }));
    expect(await simplifyPassage(passage, undefined)).toMatch(/same denominator/);
  });

  it("reports provider failures and never mentions choosing a provider", async () => {
    mockOpenAi(
      () =>
        new Response(
          JSON.stringify({ error: { code: "rate-limited", message: "Too many requests." } }),
          {
            status: 429,
          },
        ),
    );
    const err = await simplifyPassage(passage, undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(String((err as Error).message)).not.toMatch(/choose (a )?provider|Ollama|Settings/i);
  });

  it("asks for consent instead of sending anything when it has not been given", async () => {
    await saveSettings({ ...(await loadSettings()), hostedConsent: false });
    const calls = mockOpenAi(() => ({ text: "x" }));
    await expect(simplifyPassage(passage, undefined)).rejects.toMatchObject({
      code: "consent-required",
    });
    expect(calls).toHaveLength(0);
  });
});
