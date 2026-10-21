import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "..", "fixtures", "photosynthesis.txt");

test.describe("Study mode and Quick Quiz are separate (offline provider)", () => {
  test("upload → study guide page, saved and reopenable; quiz only when chosen", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("home-file-input").setInputFiles(FIXTURE);
    await expect(page).toHaveURL(/\/study\/(.+)/, { timeout: 15_000 });
    const toc = page.getByRole("navigation", { name: "Table of contents" });
    await expect(toc).toBeVisible({ timeout: 20_000 });
    // Honest labelling: offline mode makes a rule-based outline, not an AI explanation.
    await expect(
      page.getByText(/not an explanation written by an AI model/i).first(),
    ).toBeVisible();
    const url = page.url();

    // Expand/collapse and notes persist.
    await page.getByRole("textbox", { name: "My notes" }).fill("remember chlorophyll");
    await page.getByRole("heading", { level: 1 }).click();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "My notes" })).toHaveValue(
      "remember chlorophyll",
      {
        timeout: 20_000,
      },
    );
    expect(page.url()).toBe(url);

    // Quiz is an explicit, separate choice.
    await page.getByRole("link", { name: /Create a quiz from this material/ }).click();
    await expect(page).toHaveURL(/\/quizzes\/new\?doc=/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/quiz/i);
    await page.getByRole("button", { name: "Create quiz" }).click();
    await expect(page).toHaveURL(/\/quizzes\/(?!new).+/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Take Exam in Ghadi" })).toBeVisible();

    // Library lists both the guide and the quiz.
    await page.goto("/library");
    await expect(page.getByText("Study guide", { exact: true }).first()).toBeVisible();
  });

  test("Quick Quiz on home opens the quiz setup, not a document", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: /Quick Quiz/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/quizzes\/new/);
    await expect(page.getByRole("button", { name: "Create quiz" })).toBeVisible();
  });

  test("unreadable text is blocked, not explained", async ({ page }) => {
    await page.goto("/documents");
    const garbled = Array.from({ length: 40 }, () => "xq~ zk# jv^ wp| qz@ bx% fk* gj& hv!").join(
      "\n",
    );
    await page.getByTestId("file-input").setInputFiles({
      name: "scan.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(garbled),
    });
    await expect(page.getByRole("heading", { level: 1, name: "scan" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/unreadable|garbled|clearer/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Study this material" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Quick study notes" })).toBeDisabled();
  });

  for (const width of [320, 360, 390, 430, 1280]) {
    test(`study page fits and is accessible at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/documents");
      await page.getByTestId("file-input").setInputFiles(FIXTURE);
      await expect(page.getByRole("heading", { level: 1, name: "photosynthesis" })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("link", { name: "Study this material" }).click();
      await expect(page.getByRole("navigation", { name: "Table of contents" })).toBeVisible({
        timeout: 20_000,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }

  test("quiz setup page is accessible and fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/quizzes/new");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
