import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const FIXTURE = path.join(__dirname, "..", "fixtures", "photosynthesis.txt");

async function importFixture(page: Page) {
  await page.goto("/documents");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await expect(page.getByRole("heading", { level: 1, name: "photosynthesis" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Ghadi core study flow (offline, no AI key)", () => {
  test("home screen opens the app's real pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("study");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Progress" })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    // Fresh profile: no fake data.
    await expect(page.getByText("Welcome to Ghadi")).toBeVisible();
  });

  test("import → notes → quiz → flashcards → persistence → backup/restore", async ({ page }) => {
    await importFixture(page);
    await expect(page.getByText("words", { exact: false }).first()).toBeVisible();

    // Notes (heuristic, clearly labelled)
    await page.getByRole("button", { name: "Generate notes" }).click();
    await expect(page).toHaveURL(/\/notes\/.+/, { timeout: 15_000 });
    await expect(page.getByText("Offline heuristics").first()).toBeVisible();
    await expect(page.getByText("No AI model was used", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Definitions" })).toBeVisible();

    // Quiz
    await page.goto("/documents");
    await page
      .getByRole("link", { name: /photosynthesis/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Generate quiz" }).click();
    await expect(page).toHaveURL(/\/quizzes\/.+/, { timeout: 15_000 });
    await page.getByRole("button", { name: "Start quiz" }).click();
    for (let i = 0; i < 40; i++) {
      if (await page.getByRole("button", { name: "Finish" }).isVisible()) break;
      const radio = page.getByRole("radio").first();
      if (await radio.isVisible().catch(() => false)) await radio.check();
      else await page.getByLabel("Your answer").fill("chlorophyll");
      await page.getByRole("button", { name: /^(Next|Skip)/ }).click();
    }
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByTestId("score")).toBeVisible();
    await page.getByRole("button", { name: "Back to quiz" }).click();
    await expect(page.getByText("Attempt history")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review" }).first()).toBeVisible();

    // Flashcards + spaced repetition
    await page.goto("/documents");
    await page
      .getByRole("link", { name: /photosynthesis/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Generate deck" }).click();
    await expect(page).toHaveURL(/\/flashcards\/.+/, { timeout: 15_000 });
    await page.getByRole("button", { name: /Study due/ }).click();
    await page.getByRole("button", { name: "Show answer" }).click();
    await page.getByRole("button", { name: /^Known/ }).click();

    // Persistence across reloads; dashboard shows only real activity
    await page.goto("/dashboard");
    await page.reload();
    await expect(page.getByText("Study streak")).toBeVisible();
    await expect(page.getByText("1 day")).toBeVisible();

    // Library finds everything
    await page.goto("/library");
    await page.getByLabel("Search library").fill("photosynthesis");
    await expect(page.getByText("Document", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Quiz", { exact: true }).first()).toBeVisible();

    // Backup → wipe → restore
    await page.goto("/settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Download full backup/ }).click(),
    ]);
    const file = await download.path();
    const backup = JSON.parse(fs.readFileSync(file, "utf8")) as {
      app: string;
      data: { documents: unknown[] };
    };
    expect(backup.app).toBe("ghadi");
    expect(backup.data.documents.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Delete all local data" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete everything" }).click();
    await page.goto("/documents");
    await expect(page.getByText("No documents yet")).toBeVisible();

    await page.goto("/settings");
    await page.getByTestId("restore-input").setInputFiles(file);
    await page.getByRole("dialog").getByRole("button", { name: "Merge" }).click();
    await page.goto("/documents");
    await expect(page.getByRole("link", { name: /photosynthesis/i }).first()).toBeVisible();
  });

  test("rejects an invalid backup without touching data", async ({ page }, testInfo) => {
    await importFixture(page);
    const bad = testInfo.outputPath("bad.json");
    fs.writeFileSync(bad, JSON.stringify({ app: "ghadi", schemaVersion: 1, data: "nope" }));
    await page.goto("/settings");
    await page.getByTestId("restore-input").setInputFiles(bad);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/documents");
    await expect(page.getByRole("link", { name: /photosynthesis/i }).first()).toBeVisible();
  });

  test("rejects unsupported and mislabelled files with a clear message", async ({
    page,
  }, testInfo) => {
    await page.goto("/documents");
    const fake = testInfo.outputPath("fake.pdf");
    fs.writeFileSync(fake, "this is not a pdf");
    await page.getByTestId("file-input").setInputFiles(fake);
    await expect(page.getByText("does not look like a real", { exact: false })).toBeVisible();
  });

  test("pasted text works and theme toggle persists", async ({ page }) => {
    await page.goto("/documents");
    await page.getByRole("tab", { name: "Paste text" }).click();
    await page.getByLabel("Title (optional)").fill("My pasted notes");
    await page
      .getByLabel("Text")
      .fill("Mitosis is the process by which a cell divides into two identical cells. ".repeat(6));
    await page.getByRole("button", { name: "Save text" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "My pasted notes" })).toBeVisible();
    await page.getByRole("button", { name: /Switch to dark theme/ }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
