import { describe, expect, it } from "vitest";
import {
  appearsInSource,
  isCompleteDefinition,
  isCompleteFact,
  isCompleteFormula,
  isMeaningfulTerm,
  isSensibleHeading,
  looksLikeWorksheet,
  pageOf,
  splitWorksheetQuestions,
  summaryLooksCopied,
} from "@/lib/study/grounding";
import { analyzeTextQuality, isUsableForGeneration } from "@/lib/study/quality";
import { extractDefinitions, extractFacts, splitSections } from "@/lib/study/text";
import { generateNotesHeuristic } from "@/lib/study/heuristic";
import {
  ARABIC_TEXT,
  FRENCH_SCIENCE,
  MATH_WORKSHEET,
  MERGED_QUESTIONS,
  OCR_NOISE,
} from "../fixtures/worksheets";

describe("key terms", () => {
  it.each([
    "27 What",
    "3 Find",
    "Question 4",
    "mathsworksheets.com",
    "www.example.org",
    "What is the",
    "and the cell",
    "the",
    "42",
    "Find x?",
  ])("rejects %j", (term) => {
    expect(isMeaningfulTerm(term).ok).toBe(false);
  });

  it.each([
    "Chlorophyll",
    "Calvin cycle",
    "Pythagorean theorem",
    "H2O",
    "الكلوروفيل",
    "énergie cinétique",
  ])("accepts %j", (term) => {
    expect(isMeaningfulTerm(term).ok).toBe(true);
  });
});

describe("definitions", () => {
  it("rejects a website name followed by a sentence fragment", () => {
    expect(
      isCompleteDefinition("mathsworksheets.com", "Free printable worksheets for every").ok,
    ).toBe(false);
  });
  it("rejects cut-off and unreadable definitions", () => {
    expect(isCompleteDefinition("Chlorophyll", "The green pigment that absorbs the").ok).toBe(
      false,
    );
    expect(isCompleteDefinition("Chlorophyll", "The green [unclear] pigment in leaves").ok).toBe(
      false,
    );
    expect(isCompleteDefinition("Chlorophyll", "(a pigment").ok).toBe(false);
  });
  it("accepts a complete one, and requires support from the source when given", () => {
    const def = "The green pigment that absorbs red and blue light.";
    expect(isCompleteDefinition("Chlorophyll", def).ok).toBe(true);
    expect(
      isCompleteDefinition("Chlorophyll", def, "Chlorophyll absorbs red and blue light in leaves.")
        .ok,
    ).toBe(true);
    expect(
      isCompleteDefinition("Chlorophyll", def, "Volcanoes erupt when pressure builds underground.")
        .ok,
    ).toBe(false);
  });
});

describe("facts and formulas", () => {
  it("rejects a bare year with no subject (the incomplete 2022 fact)", () => {
    expect(isCompleteFact("date", "2022", "In 2022 the").ok).toBe(false);
    expect(isCompleteFact("date", "2022", "2022 .").ok).toBe(false);
  });
  it("accepts a dated fact with real context", () => {
    expect(
      isCompleteFact(
        "date",
        "1969",
        "Apollo 11 landed the first humans on the Moon in 1969, during the space race.",
      ).ok,
    ).toBe(true);
  });
  it("rejects incomplete formulas and keeps real ones", () => {
    for (const bad of ["x +", "= 5", "2x + 5 =", "(a + b = 3", "A = "])
      expect(isCompleteFormula(bad).ok).toBe(false);
    for (const good of ["2x + 5 = 17", "E = 1/2 m v^2", "A = πr²", "F = m × a"])
      expect(isCompleteFormula(good).ok).toBe(true);
  });
});

describe("headings and worksheets", () => {
  it("does not treat a numbered question as a heading", () => {
    expect(isSensibleHeading("27 What is the value of x?")).toBe(false);
    expect(isSensibleHeading("27 What")).toBe(false);
    expect(isSensibleHeading("Light reactions")).toBe(true);
    expect(isSensibleHeading("2.1 Cell structure")).toBe(true);
  });
  it("recognises a worksheet and keeps its questions separate and in order", () => {
    expect(looksLikeWorksheet(MATH_WORKSHEET)).toBe(true);
    expect(looksLikeWorksheet("Plants make food from light. ".repeat(20))).toBe(false);
    const qs = splitWorksheetQuestions(MATH_WORKSHEET);
    expect(qs.map((q) => q.number)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(qs[0]!.text).toBe("Simplify 3/4 + 2/3.");
    expect(qs[2]!.text).toBe("Evaluate 2^3 × 5^2.");
    expect(qs[5]!.page).toBe(2);
  });
});

describe("source support", () => {
  it("finds quotes tolerant of spacing, quotes and case", () => {
    expect(
      appearsInSource("absorbs  RED and blue light", "Chlorophyll absorbs red and blue light."),
    ).toBe(true);
    expect(appearsInSource("never appeared anywhere", "Chlorophyll absorbs light.")).toBe(false);
  });
  it("detects a summary that just repeats the source", () => {
    const src =
      "The mitochondria produce ATP by oxidative phosphorylation which powers most cellular work in animals and plants.";
    expect(summaryLooksCopied(src, src)).toBe(true);
    expect(
      summaryLooksCopied("Cells get energy from their mitochondria, which make ATP.", src),
    ).toBe(false);
  });
  it("gives the page of a passage from the page markers", () => {
    expect(pageOf(MATH_WORKSHEET, "Factorise x^2 − 9.")).toBe(2);
    expect(pageOf(MATH_WORKSHEET, "Simplify 3/4 + 2/3.")).toBe(1);
  });
});

describe("quality gate on representative documents", () => {
  it("accepts a clean maths worksheet, scientific notation, French and Arabic", () => {
    for (const text of [MATH_WORKSHEET, FRENCH_SCIENCE, ARABIC_TEXT]) {
      const q = analyzeTextQuality(text);
      expect(q.level, q.message).toBe("good");
      expect(isUsableForGeneration(q)).toBe(true);
    }
  });
  it("does not mistake Markdown headings, quotes and bold markers for scanning marks", () => {
    const md = [
      "# Photosynthesis",
      "Photosynthesis is the process by which green plants convert light into chemical energy.",
      "## Light-dependent reactions",
      "Chlorophyll is a green pigment that absorbs light in the blue and red wavelengths.",
      "> A quoted note about the leaf and its structure in plants.",
      "## The Calvin cycle",
      "The Calvin cycle uses ATP and NADPH to build sugars in the stroma of the chloroplast.",
    ].join("\n");
    const q = analyzeTextQuality(md);
    expect(q.issues.map((i) => i.code)).not.toContain("symbols");
    expect(q.level).toBe("good");
  });
  it("blocks merged questions and says why", () => {
    const q = analyzeTextQuality(MERGED_QUESTIONS);
    expect(isUsableForGeneration(q)).toBe(false);
    expect(q.issues.map((i) => i.code)).toContain("merged-questions");
  });
  it("blocks OCR noise and mojibake", () => {
    const q = analyzeTextQuality(OCR_NOISE);
    expect(q.level).toBe("poor");
    expect(q.issues.some((i) => i.severity === "block")).toBe(true);
  });
  it("blocks text that is the same line repeated", () => {
    const q = analyzeTextQuality(
      Array.from({ length: 12 }, () => "Geography of the world map").join("\n"),
    );
    expect(q.issues.map((i) => i.code)).toContain("repeated");
  });
});

describe("offline extraction no longer produces the screenshot junk", () => {
  const notes = generateNotesHeuristic("Algebra", MATH_WORKSHEET);

  it("never invents key terms from question numbers or site names", () => {
    const terms = [...notes.keyConcepts, ...notes.definitions.map((d) => d.term)];
    for (const t of terms) expect(isMeaningfulTerm(t).ok, t).toBe(true);
    expect(terms.join("|")).not.toMatch(/\b27 What\b/);
  });
  it("does not label a maths worksheet as a geography document", () => {
    const text = JSON.stringify(notes);
    expect(text).not.toMatch(/geograph/i);
  });
  it("keeps every question as its own item in the original order", () => {
    const headings = notes.sections.map((s) => s.heading + " " + s.body).join("\n");
    const positions = [
      "3/4 + 2/3",
      "2x + 5 = 17",
      "2^3 × 5^2",
      "4.5 cm",
      "0.00045",
      "x^2 − 9",
      "150 km",
    ].map((n) => headings.indexOf(n));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
  it("does not make facts or definitions out of fragments", () => {
    const text = "Worksheet 3 is attached. In 2022 the";
    expect(extractFacts(text).filter((f) => f.kind === "date")).toHaveLength(0);
    for (const d of extractDefinitions(text))
      expect(isCompleteDefinition(d.term, d.definition).ok).toBe(true);
  });
  it("sections follow worksheet questions, not invented topics", () => {
    const sections = splitSections(MATH_WORKSHEET);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.map((s) => s.heading).join(" ")).not.toMatch(/geograph|history|biology/i);
  });
});
