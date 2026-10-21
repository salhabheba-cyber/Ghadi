import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "@/components/quiz/export-dialog";
import { UiProvider } from "@/components/ui/primitives";
import type { Quiz } from "@/lib/validation/schemas";

const iso = "2026-06-01T10:00:00.000Z";
const quiz: Quiz = {
  id: "q",
  title: "Cells",
  origin: "heuristic",
  difficulty: "easy",
  language: "same as source",
  includeExplanations: true,
  feedbackMode: "end",
  tags: [],
  createdAt: iso,
  updatedAt: iso,
  questions: [
    {
      id: "a",
      type: "mcq",
      prompt: "Powerhouse of the cell?",
      options: ["Nucleus", "Mitochondria", "Ribosome"],
      correct: ["Mitochondria"],
      explanation: "SECRET-EXPLANATION",
      difficulty: "easy",
      tags: [],
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

function setup() {
  const onSuccess = vi.fn();
  render(
    <UiProvider>
      <ExportDialog quiz={quiz} onBack={vi.fn()} onSuccess={onSuccess} />
    </UiProvider>,
  );
  return { onSuccess, user: userEvent.setup() };
}

describe("ExportDialog", () => {
  it("does not request or download anything until Download is pressed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setup();
    await userEvent.setup().click(screen.getByRole("radio", { name: /Word/ }));
    await userEvent
      .setup()
      .click(screen.getByRole("radio", { name: /Quiz \+ separate answer key/ }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers PDF, Word and Excel and the three content modes", () => {
    setup();
    for (const n of [
      /PDF/,
      /Word/,
      /Excel/,
      /Quiz only/,
      /Quiz \+ separate answer key/,
      /Answer key only/,
    ])
      expect(screen.getByRole("radio", { name: n })).toBeInTheDocument();
  });

  it("quiz-only preview shows no answers or explanations", () => {
    setup();
    const preview = screen.getByTestId("export-preview");
    expect(preview).toHaveTextContent("Powerhouse of the cell?");
    expect(preview).toHaveTextContent("No answers are included");
    expect(preview.textContent).not.toContain("SECRET-EXPLANATION");
    expect(preview.textContent).not.toContain("Answer Key");
  });

  it("key preview appears only when a key is chosen", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("radio", { name: /Quiz \+ separate answer key/ }));
    expect(screen.getByTestId("export-preview")).toHaveTextContent("Answer Key");
    expect(screen.getByTestId("export-preview")).toHaveTextContent("B. Mitochondria");
    expect(screen.getByTestId("export-preview").textContent).not.toContain("SECRET-EXPLANATION");
    await user.click(screen.getByRole("checkbox", { name: /Include explanations/ }));
    expect(screen.getByTestId("export-preview")).toHaveTextContent("SECRET-EXPLANATION");
  });

  it("sends the chosen options on Download, then saves the blob", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(900), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user, onSuccess } = setup();
    await user.click(screen.getByRole("radio", { name: /Excel/ }));
    await user.type(screen.getByLabelText("Student name"), "Sam");
    await user.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body).toMatchObject({ format: "xlsx", content: "quiz", studentName: "Sam" });
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/was downloaded/)).toBeInTheDocument();
  });

  it("shows the server's error and downloads nothing when generation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { message: "PDF export does not support Arabic yet." } }),
            {
              status: 422,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user, onSuccess } = setup();
    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText(/does not support Arabic/)).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("refuses an empty file instead of saving it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(0), { status: 200 })),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText(/empty file/)).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
  });
});
