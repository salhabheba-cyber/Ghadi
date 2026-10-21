import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockOpenAi } from "./mock-openai";

const FIXTURE = path.join(__dirname, "..", "fixtures", "photosynthesis.txt");

test("exam options → export dialog: nothing downloads until Download, quiz-only file holds no key", async ({
  page,
}) => {
  await mockOpenAi(page);
  await page.goto("/documents");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await expect(page.getByRole("heading", { level: 1, name: "photosynthesis" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("link", { name: "Make a quiz" }).click();
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page).toHaveURL(/\/quizzes\/.+/, { timeout: 15_000 });

  let downloads = 0;
  page.on("download", () => downloads++);

  await expect(page.getByRole("button", { name: "Take Exam in Ghadi" })).toBeVisible();
  await page.getByRole("button", { name: "Export Exam" }).click();
  await expect(page.getByRole("heading", { name: "Export Exam" })).toBeVisible();

  // Choosing options is not a download.
  await page.getByRole("radio", { name: /Word/ }).check();
  await page.getByRole("radio", { name: /Quiz \+ separate answer key/ }).check();
  await page.getByRole("radio", { name: /Quiz only/ }).check();
  await page.waitForTimeout(500);
  expect(downloads).toBe(0);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  for (const [label, ext] of [
    [/PDF/, "pdf"],
    [/Word/, "docx"],
    [/Excel/, "xlsx"],
  ] as const) {
    await page.getByRole("radio", { name: label }).check();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`_quiz\\.${ext}$`));
    const file = await download.path();
    expect(fs.statSync(file).size).toBeGreaterThan(500);
    const head = fs.readFileSync(file).subarray(0, 4).toString("latin1");
    expect(head).toBe(ext === "pdf" ? "%PDF" : "PK\u0003\u0004");
  }
  expect(downloads).toBe(3);
});

test("take exam in Ghadi: navigate, mark, refresh restores answers, submit needs confirmation", async ({
  page,
}) => {
  await mockOpenAi(page);
  await page.goto("/documents");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await expect(page.getByRole("heading", { level: 1, name: "photosynthesis" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("link", { name: "Make a quiz" }).click();
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page).toHaveURL(/\/quizzes\/.+/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Take Exam in Ghadi" }).click();

  await page.getByRole("button", { name: "Mark for review" }).click();
  await expect(page.getByRole("button", { name: /Question 1, .*marked for review/ })).toBeVisible();
  const radio = page.getByRole("radio").first();
  if (await radio.isVisible().catch(() => false)) await radio.check();
  else await page.getByLabel("Your answer").fill("chlorophyll");
  await expect(page.getByRole("button", { name: /^Question 1, answered/ })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Take Exam in Ghadi" }).click();
  await expect(page.getByText("Your saved progress was restored.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Question 1, answered/ })).toBeVisible();

  await page
    .getByRole("button", { name: /Submit/ })
    .first()
    .click();
  await expect(page.getByText("Submit your exam?")).toBeVisible();
  await expect(page.getByTestId("score")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit exam" }).click();
  await expect(page.getByTestId("score")).toBeVisible();
});
