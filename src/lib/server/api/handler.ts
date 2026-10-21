/**
 * One JSON API for the reading platform, mounted at /api/app/*. Every route declares who may call it
 * ('public' | 'student' | 'staff' | 'platform'); school scope always comes from the signed-in account, never from
 * the URL or body, so changing an ID in a request cannot reach another school.
 */
import { getDb, isDbConfigured, DbNotConfiguredError, type Db } from "../db/client";
import {
  ServiceError,
  audit,
  createSession,
  destroySession,
  rateLimitDb,
  resolveSession,
  type SessionKind,
} from "../services/core";
import {
  acceptInvite,
  bootstrapPlatformAdmin,
  createInvite,
  inviteInfo,
  listStaff,
  loadActor,
  platformAdminExists,
  setStaffDisabled,
  setTeacherClasses,
  staffLogin,
  type Actor,
} from "../services/staff";
import {
  archiveChallenge,
  createClass,
  createSchool,
  getSchool,
  listChallenges,
  listClasses,
  rotateJoinCode,
  saveChallenge,
  schoolByJoinCode,
  setSchoolArchived,
  updateClass,
  updateSchoolSettings,
} from "../services/schools";
import {
  approveStudent,
  createStudentByStaff,
  getStudentSelf,
  listStudents,
  loginStudent,
  registerStudent,
  reissueAccess,
  resetPin,
  setStudentStatus,
  updateStudentByStaff,
  updateStudentSelf,
  visibleStudent,
  type StudentSelf,
} from "../services/students";
import { bookFacets, getBook, searchBooks, setBookStatus, suggestBooks } from "../services/books";
import {
  addBookmark,
  answerCheck,
  heartbeat,
  openBook,
  removeBookmark,
  restoreCompletion,
  savePosition,
  startCheck,
  studentProgress,
  studentReadingDetail,
  teacherAwardCompletion,
  voidCompletion,
  loadBookContent,
  eligibility,
} from "../services/reading";
import { getLeaderboard } from "../services/leaderboard";
import { auditLog, platformStats, schoolStats } from "../services/stats";
import { ACHIEVEMENTS } from "../services/achievements";
import { readHostedConfig } from "../hosted-config";
import {
  aiComprehensionQuestions,
  askAboutPassage,
  defaultDeps,
  defineWord,
  simplifyPassage,
  UnsafeQuestionError,
  vocabularyGame,
  type CompanionDeps,
} from "../ai/companion";
import { AiError, toAiError } from "@/lib/ai/openai-server";
import { clientKey } from "@/lib/security/rate-limit";
import { isJsonRequest, readJsonLimited, sameOriginOrNull } from "../http";

export const STUDENT_COOKIE = "ghadi_s";
export const STAFF_COOKIE = "ghadi_a";

type Auth = "public" | "student" | "staff" | "platform";
type Body = Record<string, unknown>;

interface Ctx {
  req: Request;
  db: Db;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Body;
  student: StudentSelf | null;
  actor: Actor | null;
  ip: string;
  deps: Deps;
}
export interface Deps {
  companion: () => CompanionDeps;
  aiConfigured: () => boolean;
}
interface Result {
  status?: number;
  body: unknown;
  cookie?: { name: string; value: string | null; maxAgeSec?: number };
}
interface Route {
  method: string;
  pattern: string;
  auth: Auth;
  handler: (c: Ctx) => Promise<Result>;
}

const ok = (body: unknown, extra: Partial<Result> = {}): Result => ({ body, ...extra });
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Public endpoints are throttled per client. Without a trusted proxy header every caller shares a bucket, so limits are looser. */
async function throttle(c: Ctx, name: string, limit: number, windowSec: number) {
  const shared = c.ip === "shared";
  await rateLimitDb(c.db, `${name}:${c.ip}`, shared ? limit * 12 : limit, windowSec);
}

const student = (c: Ctx): StudentSelf => c.student!;
const actor = (c: Ctx): Actor => c.actor!;
const schoolOf = (c: Ctx): string => {
  const id = actor(c).schoolId;
  if (!id || actor(c).role === "platform_admin")
    throw new ServiceError(403, "forbidden", "This needs a school account.");
  return id;
};
const adminOnly = (c: Ctx) => {
  if (actor(c).role !== "school_admin")
    throw new ServiceError(403, "forbidden", "Only school administrators can do this.");
};

async function studentLeaderboard(c: Ctx) {
  const me = student(c);
  if (!me.leaderboardEnabled)
    throw new ServiceError(404, "disabled", "Your school has not turned on the leaderboard.");
  const wantClass = c.query.get("scope") === "class";
  if (wantClass && !me.classLeaderboardEnabled)
    throw new ServiceError(404, "disabled", "Your school has not turned on class leaderboards.");
  if (wantClass && !me.classId)
    throw new ServiceError(404, "no-class", "You are not in a class yet.");
  return getLeaderboard(c.db, {
    schoolId: me.schoolId,
    classId: wantClass ? me.classId : null,
    period: c.query.get("period") ?? undefined,
    viewerStudentId: me.id,
  });
}

const routes: Route[] = [
  // ── status ────────────────────────────────────────────────────────────────────────────────
  {
    method: "GET",
    pattern: "/status",
    auth: "public",
    handler: async (c) =>
      ok({
        configured: true,
        setupNeeded: !(await platformAdminExists(c.db)),
        setupEnabled: Boolean(
          process.env.GHADI_SETUP_TOKEN && process.env.GHADI_SETUP_TOKEN.length >= 16,
        ),
        ai: c.deps.aiConfigured(),
      }),
  },

  // ── public: registration and login ────────────────────────────────────────────────────────
  {
    method: "POST",
    pattern: "/school-lookup",
    auth: "public",
    handler: async (c) => {
      await throttle(c, "lookup", 20, 600);
      const s = await schoolByJoinCode(c.db, c.body.code);
      return ok({
        school: {
          name: s.name,
          requireApproval: s.requireApproval,
          pinPolicy: s.pinPolicy,
          classes: s.classes,
        },
      });
    },
  },
  {
    method: "POST",
    pattern: "/register",
    auth: "public",
    handler: async (c) => {
      await throttle(c, "register", 15, 3600);
      return ok(await registerStudent(c.db, c.body as never), { status: 201 });
    },
  },
  {
    method: "POST",
    pattern: "/login",
    auth: "public",
    handler: async (c) => {
      await throttle(c, "login", 40, 600);
      const { id } = await loginStudent(c.db, c.body.id, c.body.pin);
      const token = await createSession(c.db, "student", id, 30);
      return ok(
        { ok: true },
        { cookie: { name: STUDENT_COOKIE, value: token, maxAgeSec: 30 * 86400 } },
      );
    },
  },
  {
    method: "POST",
    pattern: "/logout",
    auth: "public",
    handler: async (c) => {
      await destroySession(c.db, cookieOf(c.req, STUDENT_COOKIE));
      return ok({ ok: true }, { cookie: { name: STUDENT_COOKIE, value: null } });
    },
  },

  // ── public catalogue ──────────────────────────────────────────────────────────────────────
  {
    method: "GET",
    pattern: "/books",
    auth: "public",
    handler: async (c) => {
      const q = c.query;
      const age = q.get("age") ? Number(q.get("age")) : undefined;
      return ok(
        await searchBooks(c.db, {
          q: q.get("q") ?? undefined,
          language: q.get("language") ?? undefined,
          age: age !== undefined && Number.isFinite(age) ? age : undefined,
          genre: q.get("genre") ?? undefined,
          subject: q.get("subject") ?? undefined,
          level: q.get("level") ?? undefined,
          limit: Number(q.get("limit")) || 24,
          offset: Number(q.get("offset")) || 0,
        }),
      );
    },
  },
  {
    method: "GET",
    pattern: "/books/facets",
    auth: "public",
    handler: async (c) => ok(await bookFacets(c.db)),
  },
  {
    method: "GET",
    pattern: "/books/:slug",
    auth: "public",
    handler: async (c) => {
      const b = await getBook(c.db, c.params.slug!);
      if (!b) throw new ServiceError(404, "not-found", "Book not found.");
      return ok({ book: b });
    },
  },

  // ── student ───────────────────────────────────────────────────────────────────────────────
  {
    method: "GET",
    pattern: "/me",
    auth: "student",
    handler: async (c) =>
      ok({ me: student(c), achievements: ACHIEVEMENTS, ai: c.deps.aiConfigured() }),
  },
  {
    method: "PATCH",
    pattern: "/me",
    auth: "student",
    handler: async (c) => ok({ me: await updateStudentSelf(c.db, student(c).id, c.body as never) }),
  },
  {
    method: "GET",
    pattern: "/home",
    auth: "student",
    handler: async (c) => {
      const me = student(c);
      const [progress, suggestions] = await Promise.all([
        studentProgress(c.db, me.id),
        suggestBooks(c.db, me.id, me.language, me.age, 6),
      ]);
      let leaderboard = null;
      if (me.leaderboardEnabled) leaderboard = await studentLeaderboard(c).catch(() => null);
      return ok({ me, progress, suggestions, leaderboard, achievements: ACHIEVEMENTS });
    },
  },
  {
    method: "GET",
    pattern: "/progress",
    auth: "student",
    handler: async (c) =>
      ok({ progress: await studentProgress(c.db, student(c).id), achievements: ACHIEVEMENTS }),
  },
  {
    method: "GET",
    pattern: "/leaderboard",
    auth: "student",
    handler: async (c) => ok({ leaderboard: await studentLeaderboard(c) }),
  },
  {
    method: "POST",
    pattern: "/read/heartbeat",
    auth: "student",
    handler: async (c) => ok(await heartbeat(c.db, student(c).id, str(c.body.sessionId))),
  },
  {
    method: "POST",
    pattern: "/read/:slug/open",
    auth: "student",
    handler: async (c) => {
      const r = await openBook(c.db, student(c).id, c.params.slug!);
      return ok({ ...r, eligibility: await eligibility(c.db, student(c).id, r.book) });
    },
  },
  {
    method: "PUT",
    pattern: "/read/:slug/position",
    auth: "student",
    handler: async (c) => {
      const b = await getBook(c.db, c.params.slug!);
      if (!b) throw new ServiceError(404, "not-found", "Book not found.");
      const progress = await savePosition(c.db, student(c).id, b.id, c.body as never);
      return ok({ progress, eligibility: await eligibility(c.db, student(c).id, b) });
    },
  },
  {
    method: "POST",
    pattern: "/read/:slug/bookmarks",
    auth: "student",
    handler: async (c) => {
      const b = await getBook(c.db, c.params.slug!);
      if (!b) throw new ServiceError(404, "not-found", "Book not found.");
      return ok(await addBookmark(c.db, student(c).id, b.id, c.body as never), { status: 201 });
    },
  },
  {
    method: "DELETE",
    pattern: "/bookmarks/:id",
    auth: "student",
    handler: async (c) => {
      await removeBookmark(c.db, student(c).id, c.params.id!);
      return ok({ ok: true });
    },
  },
  {
    method: "POST",
    pattern: "/read/:slug/check",
    auth: "student",
    handler: async (c) => {
      const me = student(c);
      const ai =
        me.aiConsent && c.deps.aiConfigured()
          ? async (
              book: { title: string; language: "ar" | "fr" | "en" },
              content: Awaited<ReturnType<typeof loadBookContent>>,
            ) => {
              await rateLimitDb(c.db, `ai:${me.id}`, 40, 600);
              return aiComprehensionQuestions(
                c.deps.companion(),
                { lang: book.language, age: me.age, bookTitle: book.title },
                content,
              );
            }
          : undefined;
      return ok(await startCheck(c.db, me.id, c.params.slug!, { ai }));
    },
  },
  {
    method: "POST",
    pattern: "/check/:id/answer",
    auth: "student",
    handler: async (c) => ok(await answerCheck(c.db, student(c).id, c.params.id!, c.body.answers)),
  },

  // ── student: AI reading companion (optional) ──────────────────────────────────────────────
  {
    method: "POST",
    pattern: "/ai/:task",
    auth: "student",
    handler: async (c) => {
      const me = student(c);
      if (!c.deps.aiConfigured())
        throw new ServiceError(
          501,
          "ai-not-configured",
          "AI help is not switched on for this server. You can keep reading without it.",
        );
      if (!me.aiConsent)
        throw new ServiceError(
          403,
          "ai-consent",
          "Please agree to AI help first. Nothing was sent.",
        );
      await rateLimitDb(c.db, `ai:${me.id}`, 40, 600);
      const book = await getBook(c.db, str(c.body.book));
      if (!book) throw new ServiceError(404, "not-found", "Book not found.");
      const ctx = { lang: book.language, age: me.age, bookTitle: book.title };
      const d = c.deps.companion();
      const passage = str(c.body.passage);
      try {
        switch (c.params.task) {
          case "define":
            return ok({ text: await defineWord(d, ctx, str(c.body.word), passage) });
          case "simplify":
            return ok({ text: await simplifyPassage(d, ctx, passage) });
          case "ask":
            return ok({ text: await askAboutPassage(d, ctx, passage, str(c.body.question)) });
          case "vocab":
            return ok({ items: await vocabularyGame(d, ctx, passage) });
          default:
            throw new ServiceError(404, "not-found", "Unknown AI task.");
        }
      } catch (e) {
        if (e instanceof UnsafeQuestionError)
          throw new ServiceError(422, "unsafe-question", e.message);
        if (e instanceof ServiceError) throw e;
        const ai = e instanceof AiError ? e : toAiError(e);
        throw new ServiceError(
          ai.status === 501 ? 501 : ai.status >= 500 || ai.status === 429 ? 503 : ai.status,
          `ai-${ai.code}`,
          ai.message,
        );
      }
    },
  },

  // ── staff authentication ──────────────────────────────────────────────────────────────────
  {
    method: "POST",
    pattern: "/staff/setup",
    auth: "public",
    handler: async (c) => {
      await throttle(c, "setup", 10, 3600);
      const id = await bootstrapPlatformAdmin(c.db, c.body as never);
      const token = await createSession(c.db, "staff", id, 1);
      return ok(
        { ok: true },
        { status: 201, cookie: { name: STAFF_COOKIE, value: token, maxAgeSec: 86400 } },
      );
    },
  },
  {
    method: "POST",
    pattern: "/staff/login",
    auth: "public",
    handler: async (c) => {
      await throttle(c, "staff-login", 20, 600);
      const id = await staffLogin(c.db, c.body.email, c.body.password);
      const token = await createSession(c.db, "staff", id, 1);
      await audit(c.db, { actorKind: "staff", actorId: id, action: "staff.login" });
      return ok({ ok: true }, { cookie: { name: STAFF_COOKIE, value: token, maxAgeSec: 86400 } });
    },
  },
  {
    method: "POST",
    pattern: "/staff/logout",
    auth: "public",
    handler: async (c) => {
      await destroySession(c.db, cookieOf(c.req, STAFF_COOKIE));
      return ok({ ok: true }, { cookie: { name: STAFF_COOKIE, value: null } });
    },
  },
  {
    method: "GET",
    pattern: "/staff/me",
    auth: "staff",
    handler: async (c) => ok({ actor: actor(c) }),
  },
  {
    method: "GET",
    pattern: "/staff/invite/:token",
    auth: "public",
    handler: async (c) => {
      await throttle(c, "invite", 30, 600);
      return ok({ invite: await inviteInfo(c.db, c.params.token!) });
    },
  },
  {
    method: "POST",
    pattern: "/staff/invite/:token/accept",
    auth: "public",
    handler: async (c) => {
      await throttle(c, "invite", 30, 600);
      const id = await acceptInvite(c.db, c.params.token!, c.body.password);
      const token = await createSession(c.db, "staff", id, 1);
      return ok(
        { ok: true },
        { status: 201, cookie: { name: STAFF_COOKIE, value: token, maxAgeSec: 86400 } },
      );
    },
  },

  // ── platform administrator ────────────────────────────────────────────────────────────────
  {
    method: "GET",
    pattern: "/admin/overview",
    auth: "platform",
    handler: async (c) => ok({ stats: await platformStats(c.db, actor(c)) }),
  },
  {
    method: "POST",
    pattern: "/admin/schools",
    auth: "platform",
    handler: async (c) =>
      ok({ school: await createSchool(c.db, actor(c), c.body.name) }, { status: 201 }),
  },
  {
    method: "PATCH",
    pattern: "/admin/schools/:id",
    auth: "platform",
    handler: async (c) => {
      await setSchoolArchived(c.db, actor(c), c.params.id!, c.body.archived === true);
      return ok({ ok: true });
    },
  },
  {
    method: "POST",
    pattern: "/admin/schools/:id/invite",
    auth: "platform",
    handler: async (c) => {
      const inv = await createInvite(c.db, actor(c), {
        email: c.body.email,
        name: c.body.name,
        role: "school_admin",
        schoolId: c.params.id,
      });
      return ok(
        { invitePath: `/staff/invite/${inv.token}`, expiresAt: inv.expiresAt },
        { status: 201 },
      );
    },
  },
  {
    method: "GET",
    pattern: "/admin/audit",
    auth: "platform",
    handler: async (c) => ok({ events: await auditLog(c.db, actor(c), c.query.get("schoolId")) }),
  },
  {
    method: "GET",
    pattern: "/admin/books",
    auth: "platform",
    handler: async (c) =>
      ok(
        await searchBooks(
          c.db,
          {
            q: c.query.get("q") ?? undefined,
            language: c.query.get("language") ?? undefined,
            limit: Number(c.query.get("limit")) || 30,
            offset: Number(c.query.get("offset")) || 0,
          },
          true,
        ),
      ),
  },
  {
    method: "PATCH",
    pattern: "/admin/books/:id",
    auth: "platform",
    handler: async (c) => {
      const b = await getBook(c.db, c.params.id!, true);
      if (!b) throw new ServiceError(404, "not-found", "Book not found.");
      await setBookStatus(c.db, b.id, c.body.hidden === true);
      await audit(c.db, {
        actorKind: "staff",
        actorId: actor(c).id,
        action: c.body.hidden === true ? "book.hidden" : "book.shown",
        targetKind: "book",
        targetId: b.id,
      });
      return ok({ ok: true });
    },
  },

  // ── school staff ──────────────────────────────────────────────────────────────────────────
  {
    method: "GET",
    pattern: "/school",
    auth: "staff",
    handler: async (c) => {
      const sid = schoolOf(c);
      const school = (await getSchool(c.db, sid))!;
      const isAdmin = actor(c).role === "school_admin";
      return ok({
        actor: actor(c),
        school: {
          id: school.id,
          name: school.name,
          nameFormat: school.name_format,
          leaderboardEnabled: school.leaderboard_enabled,
          classLeaderboardEnabled: school.class_leaderboard_enabled,
          requireApproval: school.require_approval,
          pinPolicy: school.pin_policy,
          joinCode: school.join_code,
        },
        classes: await listClasses(c.db, actor(c), sid),
        challenges: await listChallenges(c.db, sid),
        stats: await schoolStats(c.db, actor(c), sid),
        canAdminister: isAdmin,
      });
    },
  },
  {
    method: "PATCH",
    pattern: "/school/settings",
    auth: "staff",
    handler: async (c) =>
      ok({ school: await updateSchoolSettings(c.db, actor(c), schoolOf(c), c.body) }),
  },
  {
    method: "POST",
    pattern: "/school/join-code",
    auth: "staff",
    handler: async (c) => ok({ joinCode: await rotateJoinCode(c.db, actor(c), schoolOf(c)) }),
  },
  {
    method: "POST",
    pattern: "/school/classes",
    auth: "staff",
    handler: async (c) =>
      ok(
        { class: await createClass(c.db, actor(c), schoolOf(c), c.body as never) },
        { status: 201 },
      ),
  },
  {
    method: "PATCH",
    pattern: "/school/classes/:id",
    auth: "staff",
    handler: async (c) => {
      await updateClass(c.db, actor(c), schoolOf(c), c.params.id!, c.body);
      return ok({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: "/school/students",
    auth: "staff",
    handler: async (c) =>
      ok({
        students: await listStudents(c.db, actor(c), {
          status: c.query.get("status") ?? undefined,
          classId: c.query.get("classId") ?? undefined,
          q: c.query.get("q") ?? undefined,
          limit: Number(c.query.get("limit")) || 100,
          offset: Number(c.query.get("offset")) || 0,
        }),
      }),
  },
  {
    method: "POST",
    pattern: "/school/students",
    auth: "staff",
    handler: async (c) =>
      ok(await createStudentByStaff(c.db, actor(c), c.body as never), { status: 201 }),
  },
  {
    method: "GET",
    pattern: "/school/students/:id",
    auth: "staff",
    handler: async (c) => {
      const s = await visibleStudent(c.db, actor(c), c.params.id!);
      const detail = await studentReadingDetail(c.db, actor(c), s.id);
      const profile = await c.db.query(
        `SELECT st.id, st.display_name, st.nickname, st.age, st.language, st.status, st.id_hint, st.class_id, cl.name AS class_name, (st.pin_hash IS NOT NULL) AS has_pin, st.created_at, st.last_login_at
         FROM students st LEFT JOIN classes cl ON cl.id = st.class_id WHERE st.id = $1`,
        [s.id],
      );
      return ok({ student: profile.rows[0], reading: detail });
    },
  },
  {
    method: "PATCH",
    pattern: "/school/students/:id",
    auth: "staff",
    handler: async (c) => {
      await updateStudentByStaff(c.db, actor(c), c.params.id!, c.body as never);
      return ok({ ok: true });
    },
  },
  {
    method: "POST",
    pattern: "/school/students/:id/approve",
    auth: "staff",
    handler: async (c) => {
      await approveStudent(c.db, actor(c), c.params.id!, c.body.approve !== false);
      return ok({ ok: true });
    },
  },
  {
    method: "POST",
    pattern: "/school/students/:id/reissue",
    auth: "staff",
    handler: async (c) => ok(await reissueAccess(c.db, actor(c), c.params.id!, c.body as never)),
  },
  {
    method: "POST",
    pattern: "/school/students/:id/reset-pin",
    auth: "staff",
    handler: async (c) => {
      await resetPin(c.db, actor(c), c.params.id!, c.body as never);
      return ok({ ok: true });
    },
  },
  {
    method: "POST",
    pattern: "/school/students/:id/status",
    auth: "staff",
    handler: async (c) => {
      await setStudentStatus(c.db, actor(c), c.params.id!, c.body.status as never);
      return ok({ ok: true });
    },
  },
  {
    method: "POST",
    pattern: "/school/students/:id/award",
    auth: "staff",
    handler: async (c) => {
      await teacherAwardCompletion(c.db, actor(c), c.params.id!, str(c.body.book), c.body.reason);
      return ok({ ok: true });
    },
  },
  {
    method: "POST",
    pattern: "/school/students/:id/completions/:slug/void",
    auth: "staff",
    handler: async (c) => {
      await voidCompletion(c.db, actor(c), c.params.id!, c.params.slug!, c.body.reason);
      return ok({ ok: true });
    },
  },
  {
    method: "POST",
    pattern: "/school/students/:id/completions/:slug/restore",
    auth: "staff",
    handler: async (c) => {
      await restoreCompletion(c.db, actor(c), c.params.id!, c.params.slug!);
      return ok({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: "/school/leaderboard",
    auth: "staff",
    handler: async (c) => {
      const classId = c.query.get("classId");
      const a = actor(c);
      if (a.classIds && classId && !a.classIds.includes(classId))
        throw new ServiceError(404, "not-found", "Class not found.");
      if (a.classIds && !classId)
        throw new ServiceError(403, "forbidden", "Choose one of your classes.");
      return ok({
        leaderboard: await getLeaderboard(c.db, {
          schoolId: schoolOf(c),
          classId,
          period: c.query.get("period") ?? undefined,
          ranksShown: Number(c.query.get("top")) || 5,
        }),
        challenges: await listChallenges(c.db, schoolOf(c)),
      });
    },
  },
  {
    method: "POST",
    pattern: "/school/challenges",
    auth: "staff",
    handler: async (c) =>
      ok(await saveChallenge(c.db, actor(c), schoolOf(c), c.body as never), { status: 201 }),
  },
  {
    method: "DELETE",
    pattern: "/school/challenges/:id",
    auth: "staff",
    handler: async (c) => {
      await archiveChallenge(c.db, actor(c), schoolOf(c), c.params.id!);
      return ok({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: "/school/staff",
    auth: "staff",
    handler: async (c) => {
      adminOnly(c);
      return ok({ staff: await listStaff(c.db, actor(c), schoolOf(c)) });
    },
  },
  {
    method: "POST",
    pattern: "/school/staff/invite",
    auth: "staff",
    handler: async (c) => {
      adminOnly(c);
      const inv = await createInvite(c.db, actor(c), c.body as never);
      return ok(
        { invitePath: `/staff/invite/${inv.token}`, expiresAt: inv.expiresAt },
        { status: 201 },
      );
    },
  },
  {
    method: "POST",
    pattern: "/school/staff/:id/disabled",
    auth: "staff",
    handler: async (c) => {
      adminOnly(c);
      await setStaffDisabled(c.db, actor(c), c.params.id!, c.body.disabled === true);
      return ok({ ok: true });
    },
  },
  {
    method: "PUT",
    pattern: "/school/staff/:id/classes",
    auth: "staff",
    handler: async (c) => {
      await setTeacherClasses(
        c.db,
        actor(c),
        c.params.id!,
        Array.isArray(c.body.classIds) ? (c.body.classIds as string[]) : [],
      );
      return ok({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: "/school/audit",
    auth: "staff",
    handler: async (c) => {
      adminOnly(c);
      return ok({ events: await auditLog(c.db, actor(c), null) });
    },
  },
];

function cookieOf(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name)
      return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const seg = a[i]!;
    if (seg.startsWith(":")) {
      try {
        params[seg.slice(1)] = decodeURIComponent(b[i]!);
      } catch {
        return null;
      }
    } else if (seg !== b[i]) return null;
  }
  return params;
}

const defaultDepsImpl: Deps = {
  companion: defaultDeps,
  aiConfigured: () => readHostedConfig() !== null,
};

export interface ApiResult {
  status: number;
  body: unknown;
  cookie?: { name: string; value: string | null; maxAgeSec?: number };
  headers?: Record<string, string>;
}

function fail(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
  headers?: Record<string, string>,
): ApiResult {
  return { status, body: { error: { code, message, ...extra } }, headers };
}

/** Pure request → result function (the Next.js route only adapts it), so tests drive the real thing. */
export async function handleApi(
  req: Request,
  subPath: string,
  deps: Deps = defaultDepsImpl,
  dbOverride?: Db,
): Promise<ApiResult> {
  const method = req.method.toUpperCase();
  const path = "/" + subPath.replace(/^\/+|\/+$/g, "");
  let chosen: { route: Route; params: Record<string, string> } | null = null;
  let pathKnown = false;
  // Exact (static) patterns win over parameterised ones, e.g. /books/facets before /books/:slug.
  const ordered = [...routes].sort(
    (x, y) => (x.pattern.includes(":") ? 1 : 0) - (y.pattern.includes(":") ? 1 : 0),
  );
  for (const r of ordered) {
    const params = match(r.pattern, path);
    if (!params) continue;
    pathKnown = true;
    if (r.method === method) {
      chosen = { route: r, params };
      break;
    }
  }
  if (!chosen)
    return pathKnown
      ? fail(405, "method-not-allowed", "That method is not allowed here.")
      : fail(404, "not-found", "Not found.");

  if (method !== "GET") {
    if (!sameOriginOrNull(req))
      return fail(403, "cross-site", "Cross-site requests are not allowed.");
    if (method !== "DELETE" && !isJsonRequest(req))
      return fail(415, "unsupported-media-type", "Send the request as application/json.");
  }

  let db: Db;
  try {
    if (dbOverride) db = dbOverride;
    else {
      if (!isDbConfigured()) throw new DbNotConfiguredError();
      db = await getDb();
    }
  } catch (e) {
    if (e instanceof DbNotConfiguredError)
      return fail(503, "not-configured", "The school database is not set up on this server yet.");
    console.error("[ghadi] database unavailable:", e instanceof Error ? e.message : e);
    return fail(
      503,
      "db-unavailable",
      "The reading library is temporarily unavailable. Please try again soon.",
    );
  }

  let body: Body = {};
  if (method === "POST" || method === "PATCH" || method === "PUT") {
    const read = await readJsonLimited(req, 24_000);
    if (!read.ok) return fail(read.status, "bad-request", read.message);
    if (read.data === null || typeof read.data !== "object" || Array.isArray(read.data))
      return fail(400, "bad-request", "The request body must be a JSON object.");
    body = read.data as Body;
  }

  const url = new URL(req.url);
  const ctx: Ctx = {
    req,
    db,
    params: chosen.params,
    query: url.searchParams,
    body,
    student: null,
    actor: null,
    ip: clientKey(req),
    deps,
  };

  try {
    const { auth } = chosen.route;
    if (auth === "student") {
      const id = await resolveSession(db, "student" as SessionKind, cookieOf(req, STUDENT_COOKIE));
      ctx.student = id ? await getStudentSelf(db, id) : null;
      if (!ctx.student)
        return {
          ...fail(401, "signed-out", "Please sign in with your Ghadi ID."),
          cookie: id ? { name: STUDENT_COOKIE, value: null } : undefined,
        };
    } else if (auth === "staff" || auth === "platform") {
      const id = await resolveSession(db, "staff", cookieOf(req, STAFF_COOKIE));
      ctx.actor = id ? await loadActor(db, id) : null;
      if (!ctx.actor) return fail(401, "signed-out", "Please sign in.");
      if (auth === "platform" && ctx.actor.role !== "platform_admin")
        return fail(403, "forbidden", "Only the platform administrator can do this.");
      if (
        auth === "staff" &&
        ctx.actor.role === "platform_admin" &&
        chosen.route.pattern !== "/staff/me"
      )
        return fail(
          403,
          "forbidden",
          "Platform administrators manage schools from the admin dashboard.",
        );
    }
    const res = await chosen.route.handler(ctx);
    return { status: res.status ?? 200, body: res.body, cookie: res.cookie };
  } catch (e) {
    if (e instanceof ServiceError) {
      return fail(
        e.status,
        e.code,
        e.message,
        e.extra,
        e.extra?.retryAfterSec ? { "Retry-After": String(e.extra.retryAfterSec) } : undefined,
      );
    }
    console.error("[ghadi] api error:", method, path, e instanceof Error ? e.message : e);
    return fail(500, "server-error", "Something went wrong on our side. Please try again.");
  }
}

/** Test hook: the declared route table (method, pattern, auth). */
export function __routeTable(): { method: string; pattern: string; auth: string }[] {
  return routes.map((r) => ({ method: r.method, pattern: r.pattern, auth: r.auth }));
}
