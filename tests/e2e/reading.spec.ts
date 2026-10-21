import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * The whole school-reading journey against the production build and a real (embedded) Postgres:
 * first-run setup, school and staff onboarding, a child registering, reading an Arabic picture book in RTL,
 * finishing it through the comprehension check, the leaderboard, and a teacher correcting the record.
 */
const SETUP_TOKEN = "e2e-setup-token-0123456789";

/** WCAG A/AA scan after animations settle, so contrast is measured on final colours. */
async function scan(page: Page, label: string) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
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

test.describe.serial("school reading journey", () => {
  let browser: Browser;
  let admin: BrowserContext;
  let head: BrowserContext;
  let kid: BrowserContext;
  let adminPage: Page;
  let headPage: Page;
  let kidPage: Page;
  let inviteUrl = "";
  let joinCode = "";
  let studentId = "";
  let slug = "";

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    admin = await browser.newContext();
    head = await browser.newContext();
    kid = await browser.newContext({ viewport: { width: 390, height: 800 } });
    adminPage = await admin.newPage();
    headPage = await head.newPage();
    kidPage = await kid.newPage();
  });
  test.afterAll(async () => {
    await Promise.all([admin.close(), head.close(), kid.close()]);
  });

  test("the platform administrator completes first-run setup, creates a school and an invitation", async () => {
    await adminPage.goto("/staff");
    await expect(adminPage.getByRole("heading", { name: "First-time setup" })).toBeVisible();
    await adminPage.getByLabel("Setup token").fill("wrong-token-wrong-token");
    await adminPage.getByLabel("Your name").fill("Platform Owner");
    await adminPage.getByLabel("Email").fill("owner@example.org");
    await adminPage.getByLabel("Password").fill("a-long-owner-password");
    await adminPage.getByRole("button", { name: "Save" }).click();
    await expect(adminPage.locator("p[role='alert']")).toBeVisible(); // wrong token is refused
    await adminPage.getByLabel("Setup token").fill(SETUP_TOKEN);
    await adminPage.getByRole("button", { name: "Save" }).click();
    await expect(adminPage).toHaveURL(/\/admin$/);

    await adminPage.getByLabel("School name").fill("E2E Primary School");
    await adminPage.getByRole("button", { name: "Create school" }).click();
    await expect(adminPage.getByRole("cell", { name: /E2E Primary School/ })).toBeVisible();
    await adminPage.getByRole("button", { name: "Invite admin" }).click();
    await adminPage.getByLabel("Email").fill("head@example.org");
    await adminPage.getByLabel("Name", { exact: true }).fill("Head Teacher");
    await adminPage.getByRole("button", { name: "Create invitation link" }).click();
    inviteUrl = (await adminPage.getByTestId("secret").textContent()) ?? "";
    expect(inviteUrl).toContain("/staff/invite/");
    // Counts only: no student names appear on the platform page.
    await expect(adminPage.getByText(/counts only/i)).toBeVisible();
  });

  test("the school administrator accepts the invitation, adds a class and reads the school code", async () => {
    await headPage.goto(inviteUrl);
    await expect(headPage.getByRole("heading", { name: "E2E Primary School" })).toBeVisible();
    await headPage.getByLabel(/Password/).fill("a-long-head-password");
    await headPage.getByRole("button", { name: "Save" }).click();
    await expect(headPage).toHaveURL(/\/school$/);
    await headPage.getByRole("tab", { name: "Classes" }).click();
    await headPage.getByLabel("Class name").fill("5A");
    await headPage.getByLabel("Grade").fill("Grade 5");
    await headPage.getByRole("button", { name: "Add class" }).click();
    await expect(headPage.getByText("Class added")).toBeVisible();
    await headPage.getByRole("tab", { name: "Settings" }).click();
    joinCode = ((await headPage.getByTestId("secret").textContent()) ?? "").trim();
    expect(joinCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  test("a child joins with the school code and receives a one-time Ghadi ID", async () => {
    await kidPage.goto("/join");
    await scan(kidPage, "join (code step)");
    await kidPage.getByLabel("School code").fill("WRONG-CODE");
    await kidPage.getByRole("button", { name: "Find my school" }).click();
    await expect(kidPage.locator("p[role='alert']")).toBeVisible();
    await kidPage.getByLabel("School code").fill(joinCode);
    await kidPage.getByRole("button", { name: "Find my school" }).click();
    await expect(kidPage.getByRole("heading", { name: "E2E Primary School" })).toBeVisible();
    await scan(kidPage, "join (details step)");
    await kidPage.getByLabel("Your name").fill("Layla Haddad");
    await kidPage.getByLabel("Your class").selectOption({ label: "Grade 5 · 5A" });
    await kidPage.getByLabel("Your age").fill("7");
    await kidPage.getByLabel("I like to read in").selectOption("ar");
    await kidPage.getByRole("button", { name: "Create my reading account" }).click();
    studentId = ((await kidPage.getByTestId("student-id").textContent()) ?? "").trim();
    expect(studentId).toMatch(
      /^GH-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/,
    );
    // The sign-in link stays disabled until the child confirms they saved the ID.
    await expect(kidPage.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await kidPage.getByRole("checkbox").check();
    await kidPage.getByRole("link", { name: "Sign in" }).click();
  });

  test("the child signs in with the ID and sees a mobile-friendly home in the chosen language", async () => {
    await kidPage.getByLabel("Ghadi Student ID").fill("GH-2222-2222-2222");
    await kidPage.getByRole("button", { name: "Sign in" }).click();
    await expect(kidPage.locator("p[role='alert']")).toBeVisible(); // unknown ID: generic message
    await kidPage.getByLabel("Ghadi Student ID").fill(studentId);
    await kidPage.getByRole("button", { name: "Sign in" }).click();
    await expect(kidPage).toHaveURL(/\/read$/);
    // The profile language seeds the interface language on first visit: Arabic, right-to-left.
    await expect(kidPage.locator("div[dir='rtl']").first()).toBeVisible();
    await expect(kidPage.getByRole("heading", { level: 1 })).toContainText("مرحبًا");
    // No horizontal scroll at phone width, and the bottom tab bar is present.
    const overflow = await kidPage.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(kidPage.getByRole("navigation").last().getByRole("link")).toHaveCount(4);
    // The ID is never rendered on the dashboard.
    expect(await kidPage.content()).not.toContain(studentId);
    await scan(kidPage, "student home (Arabic, RTL, phone)");
  });

  test("Explore filters the library by language and age and finds a book by title", async () => {
    await kidPage.goto("/read/explore");
    await expect(kidPage.getByText(/كتابًا|books found/)).toBeVisible();
    await kidPage.getByLabel("اللغة", { exact: true }).selectOption("fr");
    await expect(kidPage.getByRole("list").last().getByRole("listitem").first()).toBeVisible();
    await kidPage.getByLabel("اللغة", { exact: true }).selectOption("ar");
    await kidPage.getByLabel("العمر", { exact: true }).selectOption("6");
    const books = await kidPage.evaluate(
      async () =>
        (await (await fetch("/api/app/books?language=ar&age=6&limit=40")).json()).books as {
          slug: string;
          est_minutes: number;
          layout: string;
          title: string;
        }[],
    );
    const pick = books.find((b) => b.layout === "pages" && b.est_minutes <= 2) ?? books[0]!;
    slug = pick.slug;
    await scan(kidPage, "explore (Arabic)");
    await kidPage.getByLabel("ابحث عن عنوان أو مؤلف").fill(pick.title.slice(0, 5));
    await expect(
      kidPage.getByRole("link", { name: new RegExp(pick.title.slice(0, 5)) }).first(),
    ).toBeVisible();
  });

  test("the reader is right-to-left for Arabic, keeps the place, and supports bookmarks and search", async () => {
    await kidPage.goto(`/reader/${slug}`);
    const text = kidPage.getByTestId("reader-text");
    await expect(text).toHaveAttribute("dir", "rtl");
    await expect(text).toHaveAttribute("lang", "ar");
    await expect(kidPage.getByText(/الصفحة 1 من/)).toBeVisible();
    await kidPage.keyboard.press("ArrowLeft"); // in right-to-left, "forward" is leftwards
    await expect(kidPage.getByText(/الصفحة 2 من/)).toBeVisible();
    await kidPage.getByRole("button", { name: "ضع علامة هنا" }).click();
    await expect(kidPage.getByText("حُفظ مكانك")).toBeVisible();
    await kidPage.getByRole("button", { name: "الفهرس" }).click();
    await expect(kidPage.getByRole("dialog")).toBeVisible();
    await scan(kidPage, "reader with contents panel (Arabic)");
    await kidPage.getByRole("button", { name: "إغلاق" }).click();
    // Settings: a larger text size is applied to the page text.
    await kidPage.getByRole("button", { name: "إعدادات القراءة" }).click();
    await kidPage.getByLabel(/حجم الخط/).fill("30");
    await expect(text).toHaveCSS("font-size", "30px");
    await kidPage.getByRole("button", { name: "إغلاق" }).click();
    // The place is restored after a reload.
    await kidPage.waitForTimeout(300);
    await kidPage.reload();
    await expect(kidPage.getByText(/الصفحة 2 من/)).toBeVisible();
    // The reading helper says plainly that AI is off, and reading still works.
    await kidPage.getByRole("button", { name: "مساعد القراءة" }).click();
    await expect(kidPage.getByText(/غير مفعَّل/)).toBeVisible();
    await kidPage.getByRole("button", { name: "إغلاق" }).click();
  });

  test("a book cannot be finished early; reading it through and passing the check completes it once", async () => {
    // Go to the last page quickly: reading time and the check are what stop a rushed completion.
    const total = Number(
      ((await kidPage.getByText(/الصفحة \d+ من \d+/).textContent()) ?? "").match(/من (\d+)/)![1],
    );
    for (let i = 0; i < total; i++) await kidPage.keyboard.press("ArrowLeft");
    await expect(kidPage.getByText(new RegExp(`الصفحة ${total} من ${total}`))).toBeVisible();
    await expect(kidPage.getByText("تابع القراءة لتنهي الكتاب")).toBeVisible();
    await expect(kidPage.getByRole("button", { name: "أنهيتُ هذا الكتاب" })).toHaveCount(0);

    // Real reading time accrues from heartbeats while the page is open and the child is active.
    for (let i = 0; i < 4; i++) {
      await kidPage.waitForTimeout(9_000);
      await kidPage.keyboard.press("ArrowRight");
      await kidPage.keyboard.press("ArrowLeft");
    }
    const finish = kidPage.getByRole("button", { name: "أنهيتُ هذا الكتاب" });
    await expect(finish).toBeVisible({ timeout: 20_000 });
    await finish.click();
    await expect(kidPage.getByRole("heading", { name: "بضعة أسئلة" })).toBeVisible();

    // Answer from the book's own text: the right line of a "which line is from this story" check is in the book.
    const bookText = await kidPage.evaluate(async (s) => {
      const f = await (await fetch(`/books/${s}.json`)).json();
      return (f.chapters as { blocks: { x?: string }[] }[])
        .flatMap((c) => c.blocks.map((b) => b.x ?? ""))
        .join("\n");
    }, slug);
    const sets = kidPage.locator("fieldset");
    const n = await sets.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < n; i++) {
      const labels = sets.nth(i).locator("label");
      const count = await labels.count();
      let chosen = 0;
      for (let j = 0; j < count; j++) {
        const t = ((await labels.nth(j).innerText()) ?? "").trim();
        if (t && bookText.includes(t)) chosen = j;
      }
      await labels.nth(chosen).click();
    }
    await kidPage.getByRole("button", { name: "تحقق من إجاباتي" }).click();
    await expect(kidPage.getByText("أحسنت! لقد أنهيت هذا الكتاب.")).toBeVisible();
    await expect(kidPage.getByText(/أول كتاب أنهيته/)).toBeVisible(); // first-book badge
  });

  test("opening the finished book again does not count it twice, and the leaderboard shows the child", async () => {
    await kidPage.goto(`/reader/${slug}`);
    await expect(kidPage.getByTestId("reader")).toBeVisible();
    await kidPage.goto("/read");
    const board = kidPage.getByRole("region", { name: "أفضل ٥ قرّاء" });
    await expect(board).toBeVisible();
    await expect(board.getByRole("listitem")).toHaveCount(1);
    await expect(board).toContainText("Layla H.");
    await expect(board).toContainText("أنت");
    await expect(board).toContainText("شارة غدي"); // no prize configured: neutral badge, no invented prize
    const done = await kidPage.evaluate(
      async () => (await (await fetch("/api/app/progress")).json()).progress.completed.length,
    );
    expect(done).toBe(1);
  });

  test("the school administrator reviews the record, voids it with a reason, and the leaderboard updates", async () => {
    await headPage.getByRole("tab", { name: "Students" }).click();
    await scan(headPage, "school dashboard students");
    await headPage.getByLabel("Search students").fill("Layla");
    await headPage.getByRole("button", { name: "Open" }).click();
    await expect(headPage.getByText(/ID ends …/).first()).toBeVisible();
    await expect(
      headPage
        .getByRole("cell", { name: "verified (3)" })
        .or(headPage.getByRole("cell", { name: /^verified/ })),
    ).toBeVisible();
    await headPage.getByLabel("Reason").fill("Testing a correction");
    await headPage.getByRole("button", { name: "Void" }).click();
    await expect(headPage.getByText("Record voided")).toBeVisible();
    await headPage.getByRole("button", { name: "Close" }).first().click();
    await headPage.getByRole("tab", { name: "Leaderboard & prizes" }).click();
    await headPage.getByLabel("Period").selectOption("all");
    await expect(headPage.getByText("No finished books yet. Be the first!")).toBeVisible();
    await headPage.getByRole("tab", { name: "Activity log" }).click();
    await expect(headPage.getByText("completion.voided")).toBeVisible();
  });

  test("a school cannot read another school's data by guessing identifiers", async () => {
    const r = await headPage.evaluate(async () => {
      const res = await fetch("/api/app/school/students/00000000-0000-4000-8000-000000000000");
      return res.status;
    });
    expect(r).toBe(404);
    const noStudent = await headPage.evaluate(async () => (await fetch("/api/app/me")).status);
    expect(noStudent).toBe(401);
  });
});
