import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateCardsHeuristic,
  generateNotesHeuristic,
  generateQuestionsHeuristic,
  summarizeHeuristic,
} from "@/lib/study/heuristic";
import {
  extractDefinitions,
  extractFacts,
  keywordScores,
  splitSections,
  splitSentences,
} from "@/lib/study/text";
import { finalizeQuestions } from "@/lib/study/build";
import { OfflineProvider } from "@/lib/ai/offline";

const text = readFileSync(path.join(__dirname, "../fixtures/photosynthesis.txt"), "utf8");

describe("text analysis", () => {
  it("splits sentences without breaking on abbreviations or decimals", () => {
    const s = splitSentences("Use e.g. a ruler. Pi is 3.14 roughly. Dr. Smith agreed!");
    expect(s).toEqual(["Use e.g. a ruler.", "Pi is 3.14 roughly.", "Dr. Smith agreed!"]);
  });

  it("detects markdown headings as sections", () => {
    const sections = splitSections(text);
    expect(sections.map((s) => s.heading)).toEqual([
      "Photosynthesis",
      "Light-dependent reactions",
      "The Calvin cycle",
      "Factors affecting the rate",
    ]);
  });

  it("falls back to numbered parts when there are no headings", () => {
    const plain =
      "First paragraph with some words in it.\n\nSecond paragraph with more words in it.";
    expect(splitSections(plain)[0]?.heading).toBe("Part 1");
  });

  it("extracts only definitions the text actually states", () => {
    const defs = extractDefinitions(text);
    const terms = defs.map((d) => d.term.toLowerCase());
    expect(terms).toContain("photosynthesis");
    expect(terms).toContain("chlorophyll");
    expect(terms).toContain("the calvin cycle".replace(/^the /, ""));
    expect(terms).toContain("stomata");
    for (const d of defs) expect(text).toContain(d.excerpt.replace(/\.$/, ""));
    expect(extractDefinitions("It rained all day and nobody went outside at all.")).toEqual([]);
  });

  it("finds dates and formulas with their sentence as context", () => {
    const facts = extractFacts(text);
    expect(facts.some((f) => f.kind === "date" && f.value === "1779")).toBe(true);
    expect(facts.some((f) => f.kind === "formula" && f.value.startsWith("Glucose ="))).toBe(true);
  });

  it("ranks frequent content words and ignores stop words", () => {
    const terms = keywordScores(text).map((k) => k.term);
    expect(terms).toContain("chlorophyll");
    expect(terms).not.toContain("the");
  });
});

describe("heuristic notes", () => {
  const draft = generateNotesHeuristic("Photosynthesis", text);

  it("labels itself as offline output with no model", () => {
    expect(draft.notices[0]).toMatch(/No AI model was used/);
  });
  it("builds sections, definitions, facts, examples and a checklist from the source", () => {
    expect(draft.sections.length).toBe(4);
    expect(draft.definitions.length).toBeGreaterThanOrEqual(3);
    expect(draft.facts.length).toBeGreaterThan(0);
    expect(draft.examples.length).toBeGreaterThan(0);
    expect(draft.checklist.some((c) => c.startsWith("Be able to define"))).toBe(true);
    expect(draft.overview).toMatch(/words in 4 sections/);
  });
  it("only reuses sentences that exist in the source (no fabricated content)", () => {
    for (const section of draft.sections) {
      for (const sentence of splitSentences(section.body)) {
        expect(text.replace(/\s+/g, " ")).toContain(sentence.replace(/\s+/g, " "));
      }
      expect(section.provenance).toBe("extracted");
    }
  });
  it("is deterministic", () => {
    expect(generateNotesHeuristic("Photosynthesis", text)).toEqual(draft);
  });
  it("warns honestly when the source is too short", () => {
    const short = generateNotesHeuristic("Tiny", "Cells are small. They divide.");
    expect(short.notices.join(" ")).toMatch(/short/);
    expect(short.notices.join(" ")).toMatch(/No explicit definitions/);
  });
});

describe("heuristic questions", () => {
  const options = {
    count: 8,
    difficulty: "medium" as const,
    types: ["mcq", "tf", "short", "fill"] as const,
    language: "same as source",
  };

  it("returns the requested number of valid questions across types", () => {
    const { questions } = generateQuestionsHeuristic(text, {
      ...options,
      types: [...options.types],
    });
    expect(questions).toHaveLength(8);
    expect(new Set(questions.map((q) => q.type)).size).toBeGreaterThanOrEqual(3);
    const { questions: valid, dropped } = finalizeQuestions(questions);
    expect(dropped).toBe(0);
    expect(valid).toHaveLength(8);
  });

  it("always includes the correct answer among multiple-choice options, with unique options", () => {
    const { questions } = generateQuestionsHeuristic(text, {
      ...options,
      types: ["mcq"],
      count: 6,
    });
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q.options).toContain(q.correct[0]);
      expect(new Set(q.options).size).toBe(q.options?.length);
    }
  });

  it("keeps fill-in-the-blank answers inside the quoted source sentence", () => {
    const { questions } = generateQuestionsHeuristic(text, {
      ...options,
      types: ["fill"],
      count: 5,
    });
    for (const q of questions) {
      expect(q.prompt).toContain("_____");
      expect(q.sourceExcerpt?.toLowerCase()).toContain((q.correct[0] as string).toLowerCase());
    }
  });

  it("makes true statements verbatim and false statements differ from the source", () => {
    const { questions } = generateQuestionsHeuristic(text, { ...options, types: ["tf"], count: 6 });
    const flat = text.replace(/\s+/g, " ");
    for (const q of questions) {
      const statement = q.prompt.replace("True or false: ", "");
      if (q.correct[0] === "True") expect(flat).toContain(statement);
      else expect(flat).not.toContain(statement);
    }
    expect(questions.some((q) => q.correct[0] === "False")).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const a = generateQuestionsHeuristic(text, { ...options, types: [...options.types] });
    const b = generateQuestionsHeuristic(text, { ...options, types: [...options.types] });
    expect(a).toEqual(b);
  });

  it("reports a shortfall and a not-enough-text notice instead of inventing questions", () => {
    const r = generateQuestionsHeuristic("Cells are small.", {
      ...options,
      types: [...options.types],
    });
    expect(r.questions).toHaveLength(0);
    expect(r.notices.join(" ")).toMatch(/Not enough usable text/);
    const partial = generateQuestionsHeuristic(text, { ...options, types: ["tf"], count: 50 });
    expect(partial.questions.length).toBeLessThan(50);
    expect(partial.notices.join(" ")).toMatch(/Only \d+ question/);
  });

  it("says it cannot translate when another output language is requested", () => {
    const r = generateQuestionsHeuristic(text, {
      ...options,
      types: [...options.types],
      language: "Arabic",
    });
    expect(r.notices.join(" ")).toMatch(/cannot translate/);
  });
});

describe("heuristic flashcards and provider", () => {
  it("turns definitions into term/definition cards first", () => {
    const { cards } = generateCardsHeuristic(text, { count: 6, language: "same as source" });
    expect(cards).toHaveLength(6);
    expect(cards.some((c) => c.front.toLowerCase() === "photosynthesis")).toBe(true);
    expect(cards.some((c) => c.front.startsWith("Fill in the blank"))).toBe(true);
  });

  it("offline provider labels everything as heuristic and never claims a model", async () => {
    const p = new OfflineProvider();
    expect(p.origin).toBe("heuristic");
    const quiz = await p.generateQuiz(
      { title: "t", text },
      { count: 3, difficulty: "easy", types: ["mcq", "tf"], language: "same as source" },
    );
    expect(quiz.origin).toBe("heuristic");
    expect(quiz.notices.join(" ")).toMatch(/no AI model/i);
    const summary = await p.summarizeContent({ title: "t", text });
    expect(summary.value.length).toBeGreaterThan(40);
    expect(summarizeHeuristic(text)).toBe(summary.value);
    const explain = await p.explainAnswer({
      question: "q",
      correctAnswer: "a",
      userAnswer: "b",
      sourceExcerpt: "src",
    });
    expect(explain.notices.join(" ")).toMatch(/No AI model was used/);
  });
});

describe("question validation", () => {
  it("drops drafts that cannot be answered and repairs option matching", () => {
    const { questions, dropped } = finalizeQuestions([
      {
        type: "mcq",
        prompt: "Pick",
        options: ["a", "b", "c"],
        correct: ["B "],
        explanation: "",
        difficulty: "easy",
      },
      {
        type: "mcq",
        prompt: "Broken",
        options: ["a", "b"],
        correct: ["zzz"],
        explanation: "",
        difficulty: "easy",
      },
      {
        type: "tf",
        prompt: "Yes?",
        options: ["Yes", "No"],
        correct: ["true"],
        explanation: "",
        difficulty: "easy",
      },
      { type: "fill", prompt: "x _____", correct: [], explanation: "", difficulty: "easy" },
    ]);
    expect(dropped).toBe(2);
    expect(questions[0]?.correct).toEqual(["b"]);
    expect(questions[1]?.options).toEqual(["True", "False"]);
  });
});
