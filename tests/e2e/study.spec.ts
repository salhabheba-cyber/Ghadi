import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import path from "node:path";
import { mockOpenAi } from "./mock-openai";

const FIXTURE = path.join(__dirname, "..", "fixtures", "photosynthesis.txt");

test.describe("Study mode and Quick Quiz are separate (OpenAI mocked in the browser)", () => {
  test("upload → study guide page, saved and reopenable; quiz only when chosen", async ({
    page,
  }) => {
    const ai = await mockOpenAi(page, { autoConsent: false });
    await page.goto("/");
    await page.getByTestId("home-file-input").setInputFiles(FIXTURE);
    await expect(page).toHaveURL(/\/study\/(.+)/, { timeout: 15_000 });
    // Uploading never starts a paid AI request by itself.
    await expect(page.getByRole("button", { name: "Write my study guide" })).toBeVisible({
      timeout: 15_000,
    });
    expect(ai.tasks).toEqual([]);
    // The learner presses the button (and allows OpenAI); only then is the document sent.
    await page.getByRole("button", { name: "Write my study guide" }).click();
    // Permission and cost are explained before anything is sent.
    const consent = page.getByRole("dialog", { name: "Use OpenAI for this?" });
    await expect(consent).toContainText("may cost money");
    await expect(consent).toContainText("separate from any ChatGPT subscription");
    expect(ai.tasks).toEqual([]);
    await consent.getByRole("button", { name: "Allow and continue" }).click();
    const toc = page.getByRole("navigation", { name: "Table of contents" });
    await expect(toc).toBeVisible({ timeout: 20_000 });
    expect(ai.tasks).toContain("guide-section");
    expect(ai.tasks).toContain("guide-overview");
    await expect(page.getByText("Written by OpenAI", { exact: true }).first()).toBeVisible();
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

  test("a basic outline without AI is offered, labelled, and sends nothing", async ({ page }) => {
    const ai = await mockOpenAi(page);
    await page.goto("/");
    await page.getByTestId("home-file-input").setInputFiles(FIXTURE);
    await page.getByRole("button", { name: "Basic outline (no AI)" }).click();
    await expect(page.getByRole("navigation", { name: "Table of contents" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/not an explanation written by an AI model/i).first(),
    ).toBeVisible();
    expect(ai.tasks).toEqual([]);
  });

  test("worksheet photo: read with OpenAI → review → guide → Explain simpler", async ({ page }) => {
    const ai = await mockOpenAi(page, { autoConsent: false });
    await page.goto("/documents");
    await page
      .getByTestId("file-input")
      .setInputFiles(path.join(__dirname, "..", "fixtures", "ocr-sample.png"));
    // Choosing a photo sends nothing: the learner picks how to read it.
    const read = page.getByRole("button", { name: /Read with OpenAI/ });
    await expect(read).toBeVisible();
    expect(ai.vision).toBe(0);
    await read.click();
    const consent = page.getByRole("dialog", { name: "Use OpenAI for this?" });
    await expect(consent).toContainText("sends the image to OpenAI");
    expect(ai.vision).toBe(0);
    await consent.getByRole("button", { name: "Allow and continue" }).click();

    // The transcription keeps the questions separate and in order, and is labelled as machine-read.
    await expect(page.getByText("Simplify 3/4 + 2/3.").first()).toBeVisible({ timeout: 20_000 });
    expect(ai.vision).toBe(1);
    await expect(page.getByText("Evaluate 2^3 × 5^2.").first()).toBeVisible();
    await expect(page.getByText(/read from the image by OpenAI/).first()).toBeVisible();

    await page.getByRole("link", { name: "Study this material" }).click();
    await page.getByRole("button", { name: "Write my study guide" }).click();
    await expect(page.getByRole("navigation", { name: "Table of contents" })).toBeVisible({
      timeout: 20_000,
    });
    expect(ai.texts.join("\n")).toContain("2. Solve 2x + 5 = 17 for x.");

    // Explain simpler shows OpenAI's real answer, not the original sentence or a provider message.
    await page.getByRole("button", { name: "Explain simpler" }).first().click();
    await expect(page.getByText(/Plants catch sunlight/).first()).toBeVisible();
    await expect(page.getByText(/needs an AI model|choose.*provider/i)).toHaveCount(0);
    expect(ai.tasks).toContain("simplify");
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
      await mockOpenAi(page);
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/documents");
      await page.getByTestId("file-input").setInputFiles(FIXTURE);
      await expect(page.getByRole("heading", { level: 1, name: "photosynthesis" })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("link", { name: "Study this material" }).click();
      await page.getByRole("button", { name: "Write my study guide" }).click();
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
