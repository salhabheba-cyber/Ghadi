// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  handleApi,
  __routeTable,
  STAFF_COOKIE,
  STUDENT_COOKIE,
  type Deps,
} from "@/lib/server/api/handler";
import { testDb } from "./helpers";
import type { Db } from "@/lib/server/db/client";
import type { CompanionDeps } from "@/lib/server/ai/companion";

let db: Db;
beforeAll(async () => {
  db = await testDb();
  process.env.GHADI_SETUP_TOKEN = "test-setup-token-123456";
  process.env.GHADI_TRUST_PROXY = "true";
});
afterEach(() => vi.restoreAllMocks());

const noAi: Deps = {
  aiConfigured: () => false,
  companion: () => {
    throw new Error("should not be called");
  },
};
// Responses are asserted structurally field by field, so the tests use a deliberately loose JSON type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
let ipCounter = 0;

interface Opts {
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
  deps?: Deps;
  ip?: string;
}
async function call(method: string, path: string, o: Opts = {}) {
  const headers: Record<string, string> = {
    "x-forwarded-for": o.ip ?? `10.0.0.${(ipCounter++ % 250) + 1}`,
    ...o.headers,
  };
  if (o.body !== undefined) headers["content-type"] = "application/json";
  if (o.cookie) headers.cookie = o.cookie;
  const req = new Request(`http://localhost/api/app/${path}`, {
    method,
    headers,
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
  });
  const r = await handleApi(req, path.split("?")[0]!, o.deps ?? noAi, db);
  return { status: r.status, body: r.body as Loose, cookie: r.cookie };
}
const cookieOf = (name: string, c?: { name: string; value: string | null }) =>
  `${name}=${c!.value}`;

async function setupSchool() {
  const setup = await call("POST", "staff/setup", {
    body: {
      setupToken: "test-setup-token-123456",
      email: `root${Math.random()}@example.org`,
      name: "Root",
      password: "correct horse battery",
    },
  });
  let rootCookie: string;
  if (setup.status === 201) rootCookie = cookieOf(STAFF_COOKIE, setup.cookie);
  else {
    // a platform admin already exists in this shared database: sign in as a fresh one is impossible, so create via DB-free path
    const row = await db.query<{ email: string }>(
      "SELECT email FROM staff WHERE role='platform_admin'",
    );
    throw new Error("platform admin exists: " + row.rows[0]?.email);
  }
  const school = await call("POST", "admin/schools", {
    cookie: rootCookie,
    body: { name: "API Test School" },
  });
  expect(school.status).toBe(201);
  const inv = await call("POST", `admin/schools/${school.body.school.id}/invite`, {
    cookie: rootCookie,
    body: { email: `head${Math.random()}@example.org`, name: "Head Teacher" },
  });
  const token = inv.body.invitePath.split("/").pop();
  const info = await call("GET", `staff/invite/${token}`);
  expect(info.body.invite.schoolName).toBe("API Test School");
  const acc = await call("POST", `staff/invite/${token}/accept`, {
    body: { password: "a-strong-password" },
  });
  const adminCookie = cookieOf(STAFF_COOKIE, acc.cookie);
  const cls = await call("POST", "school/classes", {
    cookie: adminCookie,
    body: { name: "5A", grade: "Grade 5" },
  });
  return {
    rootCookie,
    adminCookie,
    school: school.body.school,
    classId: cls.body.class.id as string,
  };
}

let ctx: Awaited<ReturnType<typeof setupSchool>>;

describe("first-run setup and school onboarding", () => {
  it("requires the setup token and creates the first platform admin only once", async () => {
    expect((await call("GET", "status")).body).toMatchObject({
      setupNeeded: true,
      setupEnabled: true,
    });
    const bad = await call("POST", "staff/setup", {
      body: {
        setupToken: "wrong-token-wrong-token",
        email: "a@b.co",
        name: "X",
        password: "long enough password",
      },
    });
    expect(bad.status).toBe(403);
    ctx = await setupSchool();
    expect((await call("GET", "status")).body.setupNeeded).toBe(false);
    const again = await call("POST", "staff/setup", {
      body: {
        setupToken: "test-setup-token-123456",
        email: "b@b.co",
        name: "Y",
        password: "long enough password",
      },
    });
    expect(again.status).toBe(409);
  });

  it("platform admin sees counts, not children", async () => {
    const ov = await call("GET", "admin/overview", { cookie: ctx.rootCookie });
    expect(ov.status).toBe(200);
    expect(ov.body.stats.schools).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(ov.body)).not.toMatch(/display_name|"name":"Kid/);
    const toSchool = await call("GET", "school", { cookie: ctx.rootCookie });
    expect(toSchool.status).toBe(403);
  });
});

describe("a child's journey, end to end", () => {
  let studentCookie = "";
  let studentId = "";
  it("registers with the school code, signs in, and the ID is only shown once", async () => {
    const lookup = await call("POST", "school-lookup", {
      body: { code: ctx.school.join_code.toLowerCase() },
    });
    expect(lookup.body.school.name).toBe("API Test School");
    expect(JSON.stringify(lookup.body)).not.toContain(ctx.school.id);
    const reg = await call("POST", "register", {
      body: {
        joinCode: ctx.school.join_code,
        name: "Maya Khalil",
        classId: ctx.classId,
        age: 9,
        language: "ar",
        pin: "2580",
      },
    });
    expect(reg.status).toBe(201);
    studentId = reg.body.studentId;
    const wrong = await call("POST", "login", { body: { id: studentId, pin: "0000" } });
    expect(wrong.status).toBe(401);
    const login = await call("POST", "login", { body: { id: studentId, pin: "2580" } });
    expect(login.status).toBe(200);
    studentCookie = cookieOf(STUDENT_COOKIE, login.cookie);
    const me = await call("GET", "me", { cookie: studentCookie });
    expect(me.body.me).toMatchObject({
      displayName: "Maya Khalil",
      language: "ar",
      schoolName: "API Test School",
      className: "5A",
    });
    expect(JSON.stringify(me.body)).not.toContain(studentId);
  });

  it("reads a book, saves the place, finishes it and appears on the school leaderboard", async () => {
    const list = await call("GET", "books?language=ar&age=9&limit=5", { cookie: studentCookie });
    expect(list.body.books.length).toBeGreaterThan(0);
    const slug = list.body.books[0].slug as string;
    const open = await call("POST", `read/${slug}/open`, { cookie: studentCookie, body: {} });
    expect(open.status).toBe(200);
    expect(open.body.book.language).toBe("ar");
    const pos = await call("PUT", `read/${slug}/position`, {
      cookie: studentCookie,
      body: { locator: { page: 3 }, percent: 100 },
    });
    expect(pos.body.progress.furthestPercent).toBe(100);
    expect(pos.body.eligibility.eligible).toBe(false); // no reading time yet
    await db.query(
      "UPDATE reading_progress SET active_seconds = 5000 WHERE student_id = (SELECT id FROM students WHERE display_name = 'Maya Khalil')",
    );
    const check = await call("POST", `read/${slug}/check`, { cookie: studentCookie, body: {} });
    expect(check.status).toBe(200);
    expect(JSON.stringify(check.body)).not.toContain('answer"');
    const key = await db.query<{ questions: { answer: number }[] }>(
      "SELECT questions FROM completion_checks WHERE id = $1",
      [check.body.checkId],
    );
    const done = await call("POST", `check/${check.body.checkId}/answer`, {
      cookie: studentCookie,
      body: { answers: key.rows[0]!.questions.map((q) => q.answer) },
    });
    expect(done.body).toMatchObject({ passed: true, completed: true });
    const again = await call("POST", `read/${slug}/check`, { cookie: studentCookie, body: {} });
    expect(again.status).toBe(409);
    const home = await call("GET", "home", { cookie: studentCookie });
    expect(home.body.progress.completed).toHaveLength(1);
    expect(home.body.leaderboard.entries[0]).toMatchObject({
      rank: 1,
      books: 1,
      name: "Maya K.",
      isYou: true,
    });
    expect(JSON.stringify(home.body.leaderboard)).not.toContain(studentId);
  });

  it("staff in the same school can review and fix records; the audit log records it", async () => {
    const list = await call("GET", "school/students?q=Maya", { cookie: ctx.adminCookie });
    const sid = list.body.students[0].id as string;
    expect(list.body.students[0].id_hint).toBe(studentId.slice(-4));
    const detail = await call("GET", `school/students/${sid}`, { cookie: ctx.adminCookie });
    expect(detail.body.reading.length).toBe(1);
    const slug = detail.body.reading[0].slug as string;
    const v = await call("POST", `school/students/${sid}/completions/${slug}/void`, {
      cookie: ctx.adminCookie,
      body: { reason: "Testing correction" },
    });
    expect(v.status).toBe(200);
    const lb = await call("GET", "school/leaderboard?period=all", { cookie: ctx.adminCookie });
    expect(lb.body.leaderboard.entries).toHaveLength(0);
    const audit = await call("GET", "school/audit", { cookie: ctx.adminCookie });
    expect(audit.body.events.map((e: { action: string }) => e.action)).toContain(
      "completion.voided",
    );
    const reissue = await call("POST", `school/students/${sid}/reissue`, {
      cookie: ctx.adminCookie,
      body: { identityVerified: true },
    });
    expect(reissue.body.studentId).toMatch(/^GH-/);
    expect((await call("GET", "me", { cookie: studentCookie })).status).toBe(401); // old session ended
  });
});

describe("authentication and authorisation on every route", () => {
  it("rejects anonymous callers on every protected route", async () => {
    for (const r of __routeTable().filter((x) => x.auth !== "public")) {
      const path = r.pattern.replace(/:[a-z]+/g, "x");
      const res = await call(r.method, path, {
        body: r.method === "GET" || r.method === "DELETE" ? undefined : {},
      });
      expect(res.status, `${r.method} ${r.pattern}`).toBe(401);
    }
  });

  it("keeps student and staff sessions apart", async () => {
    const reg = await call("POST", "register", {
      body: {
        joinCode: ctx.school.join_code,
        name: "Cross Check",
        classId: ctx.classId,
        age: 10,
        language: "en",
      },
    });
    const login = await call("POST", "login", { body: { id: reg.body.studentId } });
    const student = cookieOf(STUDENT_COOKIE, login.cookie);
    for (const p of ["school", "school/students", "school/audit", "admin/overview"])
      expect((await call("GET", p, { cookie: student })).status).toBe(401);
    for (const p of ["me", "home", "progress"])
      expect((await call("GET", p, { cookie: ctx.adminCookie })).status).toBe(401);
    expect((await call("GET", "admin/overview", { cookie: ctx.adminCookie })).status).toBe(403);
    // a student cookie placed in the staff cookie slot (and vice versa) is just an unknown token
    expect(
      (await call("GET", "school", { cookie: `${STAFF_COOKIE}=${login.cookie!.value}` })).status,
    ).toBe(401);
  });

  it("stops a school administrator from reaching another school by changing an id", async () => {
    const other = await call("POST", "admin/schools", {
      cookie: ctx.rootCookie,
      body: { name: "Other School" },
    });
    const inv = await call("POST", `admin/schools/${other.body.school.id}/invite`, {
      cookie: ctx.rootCookie,
      body: { email: `o${Math.random()}@example.org`, name: "Other Head" },
    });
    const acc = await call("POST", `staff/invite/${inv.body.invitePath.split("/").pop()}/accept`, {
      body: { password: "another-strong-pass" },
    });
    const otherAdmin = cookieOf(STAFF_COOKIE, acc.cookie);
    const mine = await call("GET", "school/students?q=Cross", { cookie: ctx.adminCookie });
    const victim = mine.body.students[0].id as string;
    for (const [m, p, b] of [
      ["GET", `school/students/${victim}`, undefined],
      ["PATCH", `school/students/${victim}`, { name: "Hacked" }],
      ["POST", `school/students/${victim}/reissue`, { identityVerified: true }],
      ["POST", `school/students/${victim}/status`, { status: "disabled" }],
      ["POST", `school/students/${victim}/reset-pin`, { identityVerified: true }],
    ] as const) {
      const res = await call(m, p, { cookie: otherAdmin, body: b });
      expect(res.status, `${m} ${p}`).toBe(404);
    }
    expect(
      (await call("GET", "school/leaderboard?classId=" + ctx.classId, { cookie: otherAdmin }))
        .status,
    ).toBe(404);
    expect(
      (
        await call("PATCH", `school/classes/${ctx.classId}`, {
          cookie: otherAdmin,
          body: { name: "Mine" },
        })
      ).status,
    ).toBe(404);
    const stillThere = await call("GET", `school/students/${victim}`, { cookie: ctx.adminCookie });
    expect(stillThere.status).toBe(200);
  });

  it("refuses cross-site posts, non-JSON bodies, oversize bodies and wrong methods", async () => {
    expect(
      (
        await call("POST", "login", {
          body: { id: "x" },
          headers: { "sec-fetch-site": "cross-site" },
        })
      ).status,
    ).toBe(403);
    const form = await handleApi(
      new Request("http://localhost/api/app/login", {
        method: "POST",
        headers: { "content-type": "text/plain", "x-forwarded-for": "9.9.9.9" },
        body: "id=1",
      }),
      "login",
      noAi,
      db,
    );
    expect(form.status).toBe(415);
    expect((await call("POST", "login", { body: { id: "x".repeat(30_000) } })).status).toBe(413);
    expect((await call("DELETE", "login")).status).toBe(405);
    expect((await call("GET", "nope/nothing")).status).toBe(404);
  });

  it("rate-limits repeated login guessing per client", async () => {
    let last = 0;
    for (let i = 0; i < 45; i++)
      last = (
        await call("POST", "login", {
          body: { id: "GH-2222-3333-4444", pin: "0000" },
          ip: "203.0.113.77",
        })
      ).status;
    expect(last).toBe(429);
  });
});

describe("AI reading companion is optional, consented and safe", () => {
  let cookie = "";
  let slug = "";
  beforeAll(async () => {
    const reg = await call("POST", "register", {
      body: {
        joinCode: ctx.school.join_code,
        name: "Ai Tester",
        classId: ctx.classId,
        age: 11,
        language: "en",
      },
    });
    cookie = cookieOf(
      STUDENT_COOKIE,
      (await call("POST", "login", { body: { id: reg.body.studentId } })).cookie,
    );
    slug = "se-lewis-carroll-alices-adventures-in-wonderland";
  });
  const fake = (chat: CompanionDeps["chat"], flagged = false): Deps => ({
    aiConfigured: () => true,
    companion: () => ({ chat, moderate: async () => ({ flagged }) }),
  });

  it("says clearly that AI is not configured, and reading still works", async () => {
    const r = await call("POST", "ai/define", {
      cookie,
      body: { book: slug, word: "curious", passage: "Alice was curious." },
    });
    expect(r.status).toBe(501);
    expect(r.body.error.message).toMatch(/keep reading/i);
    expect((await call("POST", `read/${slug}/open`, { cookie, body: {} })).status).toBe(200);
  });

  it("sends nothing to the AI until the child agrees", async () => {
    const chat = vi.fn(async () => "x");
    const r = await call("POST", "ai/define", {
      cookie,
      body: { book: slug, word: "curious", passage: "Alice was curious." },
      deps: fake(chat),
    });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("ai-consent");
    expect(chat).not.toHaveBeenCalled();
  });

  it("sends only the passage and book title, never personal details", async () => {
    await call("PATCH", "me", { cookie, body: { aiConsent: true } });
    const chat = vi.fn(async (_c: unknown) => "Curious means wanting to know more.");
    const r = await call("POST", "ai/define", {
      cookie,
      body: { book: slug, word: "curious", passage: "Alice was curious about the rabbit." },
      deps: fake(chat),
    });
    expect(r.status).toBe(200);
    expect(r.body.text).toMatch(/Curious/);
    const sent = JSON.stringify(chat.mock.calls[0]![0]);
    expect(sent).toContain("curious about the rabbit");
    expect(sent).toMatch(/Alice.s Adventures in Wonderland/);
    expect(sent).not.toMatch(/Ai Tester|API Test School|GH-|5A/);
    expect(sent).toMatch(/Never invent quotations/);
  });

  it("blocks unsafe questions before they reach the model, and reports provider errors plainly", async () => {
    const chat = vi.fn(async () => "x");
    const blocked = await call("POST", "ai/ask", {
      cookie,
      body: { book: slug, passage: "text", question: "something unsafe" },
      deps: fake(chat, true),
    });
    expect(blocked.status).toBe(422);
    expect(chat).not.toHaveBeenCalled();
    const { AiError } = await import("@/lib/ai/openai-server");
    const down = await call("POST", "ai/simplify", {
      cookie,
      body: { book: slug, passage: "text" },
      deps: fake(async () => {
        throw new AiError(
          "insufficient-credits",
          "The AI provider account is out of credits.",
          402,
        );
      }),
    });
    expect(down.status).toBe(402);
    expect(down.body.error.message).toMatch(/credits/);
    const broken = await call("POST", "ai/simplify", {
      cookie,
      body: { book: slug, passage: "text" },
      deps: fake(async () => {
        throw new Error("boom with key sk-secret");
      }),
    });
    expect(broken.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(broken.body)).not.toContain("sk-secret");
  });
});

describe("when the database is not configured", () => {
  it("answers 503 with a clear message instead of pretending", async () => {
    const saved = { url: process.env.DATABASE_URL, dev: process.env.GHADI_DEV_DB };
    delete process.env.DATABASE_URL;
    delete process.env.GHADI_DEV_DB;
    const r = await handleApi(new Request("http://localhost/api/app/books"), "books", noAi);
    expect(r.status).toBe(503);
    expect((r.body as Loose).error.code).toBe("not-configured");
    if (saved.url) process.env.DATABASE_URL = saved.url;
    if (saved.dev) process.env.GHADI_DEV_DB = saved.dev;
  });
});
