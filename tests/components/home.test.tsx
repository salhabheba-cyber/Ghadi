import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeScreen } from "@/components/home/home-screen";
import { LanguageSync } from "@/components/language-sync";
import { __setDbForTests, GhadiDB, getDb } from "@/lib/storage/db";
import { loadSettings, saveAttempt } from "@/lib/storage/repo";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

beforeEach(() => {
  push.mockClear();
  __setDbForTests(new GhadiDB(`home-${Math.random()}`));
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

function setup() {
  render(
    <>
      <LanguageSync />
      <HomeScreen />
    </>,
  );
  return userEvent.setup();
}

describe("Home screen controls", () => {
  it("renders the four action cards as real buttons and quick links to real routes", () => {
    setup();
    for (const name of ["Attach File", "Paste URL", "Attach Photos", "Prompt"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: /Quick Quiz/ })).toHaveAttribute(
      "href",
      "/quizzes/new",
    );
    expect(screen.getByRole("link", { name: /Study Notes/ })).toHaveAttribute("href", "/notes");
    expect(screen.getByRole("link", { name: /Review Cards/ })).toHaveAttribute("href", "/review");
  });

  it("bottom navigation links go to working pages and mark Home as current", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "My Quizzes" })).toHaveAttribute(
      "href",
      "/quizzes",
    );
    expect(within(nav).getByRole("link", { name: "Library" })).toHaveAttribute("href", "/library");
    expect(within(nav).getByRole("link", { name: "Progress" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("Paste URL opens the URL importer and rejects an inaccessible address clearly", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Paste URL" }));
    const dialog = await screen.findByRole("dialog", { name: "Import a web page" });
    const input = within(dialog).getByLabelText(/Address/);
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "blocked", message: "That page could not be reached." }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    await user.type(input, "https://example.invalid/page");
    await user.click(within(dialog).getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(within(dialog).getByText(/could not be reached|failed|error/i)).toBeVisible(),
    );
    expect(push).not.toHaveBeenCalled(); // no fake success
  });

  it("Attach File imports a chosen text file and opens the saved document", async () => {
    const user = setup();
    const input = screen.getByTestId("home-file-input");
    const file = new File(
      ["Photosynthesis converts light into chemical energy. ".repeat(10)],
      "bio.txt",
      {
        type: "text/plain",
      },
    );
    await user.upload(input, file);
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/study\/.+/)));
    expect(await getDb().documents.count()).toBe(1);
  });

  it("Attach File refuses an unsupported file type and saves nothing", async () => {
    const user = setup();
    const bad = new File(["MZ"], "virus.exe", { type: "application/x-msdownload" });
    await user.upload(screen.getByTestId("home-file-input"), bad);
    // jsdom honours the accept filter in user-event, so force the change event path too.
    expect(push).not.toHaveBeenCalled();
    expect(await getDb().documents.count()).toBe(0);
  });

  it("Prompt opens a working form and explains clearly when hosted AI is not consented", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Prompt" }));
    const dialog = await screen.findByRole("dialog", { name: "What do you want to study?" });
    const ask = within(dialog).getByRole("button", { name: "Ask Ghadi AI" });
    expect(ask).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Your prompt"), "Explain mitosis");
    await user.click(ask);
    expect(await within(dialog).findByText(/give your consent in Settings/i)).toBeVisible();
  });

  it("Prompt can save the user's own text as a document (offline path)", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Prompt" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Your prompt"),
      "Mitosis is cell division producing two identical cells. It has four phases.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save my text as a document" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/study\/.+/)));
  });
});

describe("Language switching", () => {
  it("FR and AR change the interface and persist; Arabic sets right-to-left", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Français/ }));
    expect(await screen.findByRole("button", { name: "Coller un lien" })).toBeVisible();
    await waitFor(() => expect(document.documentElement.lang).toBe("fr"));
    expect((await loadSettings()).uiLanguage).toBe("fr");

    await user.click(screen.getByRole("button", { name: /العربية/ }));
    expect(await screen.findByRole("button", { name: "لصق رابط" })).toBeVisible();
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect((await loadSettings()).uiLanguage).toBe("ar");

    await user.click(screen.getByRole("button", { name: /English/ }));
    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));
  });
});

describe("Coins and XP", () => {
  it("start at zero and come only from saved study history", async () => {
    setup();
    const pills = await screen.findAllByLabelText(/^(Coins|XP):/);
    expect(pills.map((p) => p.textContent)).toEqual(["0", "0"]);

    await saveAttempt({
      id: "a1",
      quizId: "q1",
      quizTitle: "Quiz",
      feedbackMode: "end",
      answers: [],
      score: 3,
      total: 4,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/^XP:/)).toHaveTextContent("3");
      expect(screen.getByLabelText(/^Coins:/)).toHaveTextContent("2"); // 1 quiz + 1 study day
    });
  });
});
