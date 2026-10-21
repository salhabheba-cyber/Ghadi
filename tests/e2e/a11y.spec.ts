import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "..", "fixtures", "photosynthesis.txt");

async function scan(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const bad = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  expect(bad, `${label}\n${bad.join("\n")}`).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test(`no WCAG A/AA violations across the app (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("ghadi-theme", t), theme);
    await page.goto("/");
    await scan(page, "landing");

    await page.goto("/dashboard");
    await expect(page.getByText("Welcome to Ghadi")).toBeVisible();
    await scan(page, "dashboard (empty)");

    await page.goto("/documents");
    await page.getByTestId("file-input").setInputFiles(FIXTURE);
    await expect(page.getByRole("heading", { level: 1, name: "photosynthesis" })).toBeVisible();
    await scan(page, "document");

    await page.getByRole("button", { name: "Quick study notes" }).click();
    await page.waitForURL(/\/notes\//);
    await expect(page.getByRole("heading", { name: "Definitions" })).toBeVisible();
    await scan(page, "note");

    await page.goto("/documents");
    await page
      .getByRole("link", { name: /photosynthesis/i })
      .first()
      .click();
    await page.getByRole("link", { name: "Make a quiz" }).click();
    await page.getByRole("button", { name: "Create quiz" }).click();
    await page.waitForURL(/\/quizzes\//);
    await scan(page, "quiz overview");
    await page.getByLabel("After each question").check();
    await page.getByRole("button", { name: "Take Exam in Ghadi" }).click();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await scan(page, "quiz player");

    await page.goto("/documents");
    await page
      .getByRole("link", { name: /photosynthesis/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Flashcards" }).click();
    await page.waitForURL(/\/flashcards\//);
    await scan(page, "deck");
    await page.getByRole("button", { name: /Study due/ }).click();
    await page.getByRole("button", { name: "Show answer" }).click();
    await scan(page, "study session");

    for (const route of [
      "/dashboard",
      "/library",
      "/documents",
      "/notes",
      "/quizzes",
      "/flashcards",
      "/review",
      "/settings",
    ]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await scan(page, route);
    }
  });
}
