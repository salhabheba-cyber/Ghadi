import type { Page } from "@playwright/test";

/**
 * Stands in for OpenAI in the browser tests: Playwright answers Ghadi's own /api/ai/* routes with
 * deterministic, schema-valid replies. No real OpenAI request is ever made (CI has no key), and the
 * tests never claim otherwise. The consent dialog is accepted automatically whenever it appears.
 */
export interface MockOpenAi {
  /** Task names of every /api/ai/generate request, in order. */
  tasks: string[];
  /** Payload text sent with each request (to check which text the AI was given). */
  texts: string[];
  vision: number;
}

const quiz = {
  questions: [
    {
      type: "mcq",
      prompt: "What pigment absorbs light in photosynthesis?",
      options: ["Chlorophyll", "Keratin", "Insulin"],
      correct: "Chlorophyll",
      explanation: "Chlorophyll absorbs light energy.",
      difficulty: "easy",
    },
    {
      type: "tf",
      prompt: "Photosynthesis happens in the chloroplasts.",
      options: ["True", "False"],
      correct: "True",
      explanation: "Chloroplasts contain chlorophyll.",
      difficulty: "easy",
    },
    {
      type: "short",
      prompt: "Which pigment makes leaves green?",
      correct: "chlorophyll",
      explanation: "Chlorophyll reflects green light.",
      difficulty: "easy",
    },
  ],
};

function answer(task: string): unknown {
  switch (task) {
    case "notes":
      return {
        overview: "How plants turn light into chemical energy.",
        summary: "Plants use chlorophyll to capture light and make glucose.",
        keyConcepts: ["Photosynthesis", "Chlorophyll"],
        definitions: [
          {
            term: "Chlorophyll",
            definition: "The green pigment in chloroplasts that absorbs light.",
          },
        ],
        sections: [{ heading: "Light capture", body: "Chlorophyll absorbs red and blue light." }],
        checklist: ["Explain photosynthesis"],
        notices: [],
      };
    case "quiz":
      return quiz;
    case "cards":
      return {
        cards: [
          { front: "What absorbs light in a leaf?", back: "Chlorophyll" },
          { front: "Where does photosynthesis happen?", back: "In the chloroplasts" },
          { front: "What does a plant make from light?", back: "Glucose" },
        ],
      };
    case "guide-section":
      return {
        sections: [
          {
            heading: "How plants capture light",
            intro: "Leaves contain a pigment that absorbs sunlight.",
            recap: "Chlorophyll captures light for photosynthesis.",
            blocks: [
              { type: "paragraph", text: "Plants capture light with chlorophyll in their leaves." },
              {
                type: "keyPoints",
                title: "Key points",
                points: ["Light is absorbed by chlorophyll", "Glucose is produced"],
              },
              {
                type: "definition",
                term: "Chlorophyll",
                definition: "The green pigment in chloroplasts that absorbs light.",
              },
            ],
          },
        ],
        glossary: [{ term: "Chlorophyll", meaning: "The green pigment that absorbs light" }],
        notices: [],
      };
    case "guide-overview":
      return {
        overview: "This guide explains how plants capture light.",
        objectives: ["Explain what chlorophyll does"],
        finalSummary: "Plants use chlorophyll to turn light into chemical energy.",
      };
    case "simplify":
      return { text: "Plants catch sunlight with a green substance and use it to make food." };
    default:
      return { text: "Plants make food from light." };
  }
}

export async function mockOpenAi(
  page: Page,
  options: { autoConsent?: boolean } = {},
): Promise<MockOpenAi> {
  const state: MockOpenAi = { tasks: [], texts: [], vision: 0 };
  if (options.autoConsent !== false) {
    // Accept the "Use OpenAI for this?" dialog whenever it appears (flows that are not about consent).
    await page.addInitScript(() => {
      new MutationObserver(() => {
        for (const b of document.querySelectorAll("button"))
          if (b.textContent?.trim() === "Allow and continue") b.click();
      }).observe(document, { childList: true, subtree: true });
    });
  }
  await page.route("**/api/ai/status", (r) =>
    r.fulfill({
      json: {
        configured: true,
        provider: "openai",
        model: "gpt-6-luna",
        visionModel: "gpt-6.1-sol",
        cloud: true,
      },
    }),
  );
  await page.route("**/api/ai/generate", (r) => {
    const body = r.request().postDataJSON() as {
      task: string;
      consent?: boolean;
      payload?: { text?: string };
    };
    state.tasks.push(body.task);
    state.texts.push(body.payload?.text ?? "");
    if (body.consent !== true)
      return r.fulfill({
        status: 400,
        json: { error: { code: "consent-required", message: "no" } },
      });
    return r.fulfill({ json: { text: JSON.stringify(answer(body.task)) } });
  });
  await page.route("**/api/ai/vision", (r) => {
    state.vision++;
    return r.fulfill({
      json: {
        transcription: {
          pages: [
            {
              page: 1,
              unreadable: false,
              blocks: [
                { kind: "question", number: "1", text: "Simplify 3/4 + 2/3.", uncertain: false },
                {
                  kind: "question",
                  number: "2",
                  text: "Solve 2x + 5 = 17 for x.",
                  uncertain: false,
                },
                { kind: "question", number: "3", text: "Evaluate 2^3 × 5^2.", uncertain: false },
              ],
            },
          ],
          issues: [],
        },
        model: "gpt-6.1-sol",
      },
    });
  });
  return state;
}
