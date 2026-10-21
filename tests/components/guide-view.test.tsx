import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GuideView } from "@/components/study/guide-view";
import { layoutFlow } from "@/components/study/flow-diagram";
import { UiProvider } from "@/components/ui/primitives";
import { loadSettings, saveSettings } from "@/lib/storage/repo";
import type { StudyGuide } from "@/lib/validation/schemas";

const iso = "2026-10-21T10:00:00.000Z";
const guide: StudyGuide = {
  id: "d1",
  documentId: "d1",
  title: "Photosynthesis",
  origin: "hosted-ai",
  language: "same as source",
  overview: "Plants make food from light.",
  objectives: ["Explain the light reactions"],
  sections: [
    {
      heading: "Light reactions",
      intro: "The first stage.",
      recap: "Light becomes chemical energy.",
      blocks: [
        { type: "paragraph", text: "Plants capture light. ".repeat(15) },
        { type: "keyPoints", title: "Key points", points: ["Needs light", "Needs water"] },
        {
          type: "definition",
          term: "Chlorophyll",
          definition: "The green pigment.",
          verified: true,
          sourceExcerpt: "absorbs light",
        },
        {
          type: "steps",
          title: "How it works",
          steps: [
            { title: "Absorb", detail: "Leaves absorb light" },
            { title: "Split", detail: "" },
          ],
        },
        {
          type: "table",
          title: "Compare",
          columns: ["Stage", "Where"],
          rows: [
            ["Light", "Thylakoid"],
            ["Calvin", "Stroma"],
          ],
        },
        {
          type: "example",
          title: "Leaf",
          text: "A leaf in sunlight.",
          source: "document",
          sourceExcerpt: "leaf",
        },
        { type: "example", title: "Solar panel", text: "Like a panel.", source: "added" },
        {
          type: "formula",
          name: "Equation",
          expression: "6CO2 + 6H2O → C6H12O6 + 6O2",
          explanation: "Overall.",
          workedExample: "6 in, 1 out",
        },
        {
          type: "timeline",
          title: "History",
          events: [
            { label: "1779", detail: "Ingenhousz" },
            { label: "1845", detail: "Mayer" },
          ],
        },
        {
          type: "flow",
          title: "Energy flow",
          nodes: [
            { id: "a", label: "Light" },
            { id: "b", label: "ATP" },
            { id: "c", label: "Sugar" },
          ],
          edges: [
            { from: "a", to: "b" },
            { from: "b", to: "c", label: "powers" },
          ],
        },
        { type: "callout", tone: "warning", text: "Do not confuse stages." },
        { type: "detail", title: "More detail", text: "Extra depth." },
      ],
    },
    {
      heading: "Calvin cycle",
      intro: "",
      recap: "",
      blocks: [{ type: "paragraph", text: "Sugar is made." }],
    },
  ],
  finalSummary: "Everything in short.",
  glossary: [{ term: "ATP", meaning: "Energy currency" }],
  notices: ["Written by AI."],
  userNotes: "",
  tags: [],
  sourceChars: 100,
  createdAt: iso,
  updatedAt: iso,
};

function setup(over: Partial<React.ComponentProps<typeof GuideView>> = {}) {
  const props = {
    guide,
    documentAvailable: true,
    busyAction: null,
    onNotes: vi.fn(),
    onRegenerate: vi.fn(),
    onFlashcards: vi.fn(),
    ...over,
  };
  render(
    <UiProvider>
      <GuideView {...props} />
    </UiProvider>,
  );
  return { ...props, user: userEvent.setup() };
}

describe("GuideView", () => {
  it("renders every part of a textbook-style guide", () => {
    setup();
    expect(screen.getByText("Plants make food from light.")).toBeInTheDocument();
    expect(screen.getByText("Explain the light reactions")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Light reactions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Calvin cycle" })).toBeInTheDocument();
    expect(screen.getByText("Chlorophyll")).toBeInTheDocument();
    expect(screen.getByText(/From your material: “absorbs light”/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Stage" })).toBeInTheDocument();
    expect(screen.getByText("Thylakoid")).toBeInTheDocument();
    expect(screen.getByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toBeInTheDocument();
    expect(screen.getByText("Ingenhousz")).toBeInTheDocument();
    expect(screen.getByText(/Do not confuse stages/)).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Recap of section 1" })).toHaveTextContent(
      "Light becomes chemical energy.",
    );
    expect(screen.getByText("Everything in short.")).toBeInTheDocument();
    expect(screen.getByText("Energy currency")).toBeInTheDocument();
  });

  it("keeps source material and added examples visibly distinct", () => {
    setup();
    expect(screen.getByText("From your material")).toBeInTheDocument();
    expect(screen.getByText("Added by Ghadi to clarify")).toBeInTheDocument();
  });

  it("draws the flow as a labelled SVG built only from the declared edges", () => {
    setup();
    const svg = screen.getByRole("img", {
      name: /Flow diagram: Energy flow.*Light leads to ATP.*ATP leads to Sugar \(powers\)/,
    });
    expect(svg.querySelectorAll("rect")).toHaveLength(3);
    expect(svg.querySelectorAll("line")).toHaveLength(2);
  });

  it("has a table of contents that lists every section", () => {
    setup();
    const toc = screen.getByRole("navigation", { name: "Table of contents" });
    expect(
      within(toc)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["1Light reactions", "2Calvin cycle", "Summary and glossary"]);
  });

  it("expands and collapses optional details", async () => {
    const { user } = setup();
    const d = screen.getByText("More detail").closest("details")!;
    expect(d.open).toBe(false);
    await user.click(screen.getByRole("button", { name: /Expand \/ collapse details/ }));
    expect(d.open).toBe(true);
    await user.click(screen.getByRole("button", { name: /Expand \/ collapse details/ }));
    expect(d.open).toBe(false);
  });

  it("saves the learner's own notes when the box loses focus", async () => {
    const { user, onNotes } = setup();
    await user.type(screen.getByRole("textbox", { name: "My notes" }), "remember ATP");
    expect(onNotes).not.toHaveBeenCalled();
    await user.tab();
    expect(onNotes).toHaveBeenCalledWith("remember ATP");
  });

  it("creates flashcards or a quiz only when asked", async () => {
    const { user, onFlashcards, onRegenerate } = setup();
    expect(onFlashcards).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Create flashcards/ }));
    expect(onFlashcards).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /Create a quiz from this material/ })).toHaveAttribute(
      "href",
      "/quizzes/new?doc=d1",
    );
    await user.click(screen.getByRole("button", { name: /Write the guide again/ }));
    expect(onRegenerate).toHaveBeenCalled();
  });

  it("asks for permission before sending a passage to OpenAI, and sends nothing if declined", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { user } = setup();
    await user.click(screen.getAllByRole("button", { name: "Explain simpler" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: /Use OpenAI/ });
    expect(within(dialog).getByText(/may cost money/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Cancel|No|Not now/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("shows OpenAI's real simpler explanation after consent", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ text: JSON.stringify({ text: "Plants use sunlight to make food." }) }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { user } = setup();
    await user.click(screen.getAllByRole("button", { name: "Explain simpler" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: /Use OpenAI/ });
    await user.click(within(dialog).getByRole("button", { name: "Allow and continue" }));
    expect(await screen.findByText(/Plants use sunlight to make food/)).toBeInTheDocument();
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body).toMatchObject({ task: "simplify", consent: true });
    vi.unstubAllGlobals();
  });

  it("never shows the original sentence as the explanation, and reports the failure", async () => {
    await saveSettings({ ...(await loadSettings()), hostedConsent: true });
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            text: JSON.stringify({ text: "Plants capture light. ".repeat(15).trim() }),
          }),
        ),
    );
    const { user } = setup();
    await user.click(screen.getAllByRole("button", { name: "Explain simpler" })[0]!);
    expect(await screen.findByText(/only repeated the passage/)).toBeInTheDocument();
    expect(screen.queryByText(/In simpler words/)).toBeNull();
    vi.unstubAllGlobals();
  });

  it("hides the quiz link when the source document is gone", () => {
    setup({ documentAvailable: false });
    expect(screen.queryByRole("link", { name: /Create a quiz/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Create flashcards/ })).toBeDisabled();
  });
});

describe("layoutFlow", () => {
  it("places each node below everything that leads to it", () => {
    const { pos } = layoutFlow({
      type: "flow",
      title: "t",
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c" },
      ],
    });
    expect(pos.get("a")!.y).toBeLessThan(pos.get("b")!.y);
    expect(pos.get("b")!.y).toBeLessThan(pos.get("c")!.y);
  });
  it("survives cycles", () => {
    const r = layoutFlow({
      type: "flow",
      title: "t",
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    });
    expect(Number.isFinite(r.height)).toBe(true);
  });
});
