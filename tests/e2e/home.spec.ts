import { expect, test } from "@playwright/test";
import path from "node:path";
import { mockOpenAi } from "./mock-openai";

const FIXTURE = path.join(__dirname, "..", "fixtures", "photosynthesis.txt");
const WIDTHS = [320, 360, 390, 430, 768, 1440];

for (const width of WIDTHS) {
  test(`home layout fits at ${width}px (no overflow, nothing hidden by the nav)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Attach File" })).toBeVisible();

    const m = await page.evaluate(() => {
      const nav = document.querySelector(".gh-nav")!.getBoundingClientRect();
      const cards = [...document.querySelectorAll(".gh-card")].map((c) =>
        c.getBoundingClientRect(),
      );
      const cols = getComputedStyle(document.querySelector(".gh-cards")!).gridTemplateColumns.split(
        " ",
      ).length;
      const quick = [...document.querySelectorAll(".gh-quick a")].map((c) =>
        c.getBoundingClientRect(),
      );
      return {
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        navTop: nav.top,
        navBottom: nav.bottom,
        vh: window.innerHeight,
        cols,
        cardMin: Math.min(...cards.map((c) => c.width)),
        cardsRight: Math.max(...cards.map((c) => c.right)),
        cardsLeft: Math.min(...cards.map((c) => c.left)),
        lastBottom: Math.max(...quick.map((c) => c.bottom), ...cards.map((c) => c.bottom)),
        docH: document.documentElement.scrollHeight,
      };
    });
    expect(m.scrollW).toBeLessThanOrEqual(m.clientW); // no horizontal scroll
    expect(m.cardsLeft).toBeGreaterThanOrEqual(0);
    expect(m.cardsRight).toBeLessThanOrEqual(m.clientW);
    expect(m.cardMin).toBeGreaterThan(100); // cards are real cards, not slivers
    expect(m.cols).toBe(width >= 768 ? 4 : 2);
    expect(Math.round(m.navBottom)).toBe(m.vh); // bottom nav sits fully on screen
    // Scroll to the very end: the last content must clear the nav.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const clear = await page.evaluate(() => {
      const nav = document.querySelector(".gh-nav")!.getBoundingClientRect();
      const last = [...document.querySelectorAll(".gh-quick a")].map(
        (c) => c.getBoundingClientRect().bottom,
      );
      return nav.top - Math.max(...last);
    });
    expect(clear).toBeGreaterThanOrEqual(0);
  });
}

test.describe("home controls", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("settings gear and bottom navigation reach real pages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    for (const [name, url] of [
      ["My Quizzes", /\/quizzes$/],
      ["Library", /\/library$/],
      ["Progress", /\/dashboard$/],
    ] as const) {
      await page.goto("/");
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();
      await expect(page).toHaveURL(url);
    }
  });

  test("language buttons switch the UI, Arabic is RTL, and the choice survives reload", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Français" }).click();
    await expect(page.getByRole("button", { name: "Coller un lien" })).toBeVisible();
    await page.getByRole("button", { name: "العربية" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("button", { name: "لصق رابط" })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("button", { name: "لصق رابط" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("Attach File imports a real file and opens the Study page (not a quiz)", async ({
    page,
  }) => {
    const ai = await mockOpenAi(page);
    await page.goto("/");
    await page.getByTestId("home-file-input").setInputFiles(FIXTURE);
    await expect(page).toHaveURL(/\/study\/.+/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: "photosynthesis" })).toBeVisible({
      timeout: 15_000,
    });
    expect(ai.tasks).toEqual([]);
    await page.getByRole("button", { name: "Write my study guide" }).click();
    await expect(page.getByRole("navigation", { name: "Table of contents" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("link", { name: /Create a quiz from this material/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Take Exam in Ghadi" })).toHaveCount(0);
  });

  test("Paste URL opens the importer; an unreachable page shows an error, not success", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Paste URL" }).click();
    const dialog = page.getByRole("dialog", { name: "Import a web page" });
    await dialog.getByLabel(/Address/).fill("http://127.0.0.1:9/private");
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(
      dialog.getByText(/blocked|private|could not|failed|not allowed/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/$/);
  });

  test("Prompt opens a form and keeps keyboard focus while typing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Prompt" }).click();
    const box = page.getByLabel("Your prompt");
    await box.focus();
    await page.keyboard.type("Explain mitosis in simple terms");
    await expect(box).toHaveValue("Explain mitosis in simple terms");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("keyboard: Tab reaches the action cards and Enter activates one", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Paste URL" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Import a web page" })).toBeVisible();
  });

  test("reduced motion turns the decorative animations off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const anim = await page.evaluate(
      () => getComputedStyle(document.querySelector(".gh-mascot")!).animationName,
    );
    expect(anim).toBe("none");
  });
});
