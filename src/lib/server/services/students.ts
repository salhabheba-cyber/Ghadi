import type { Db } from "../db/client";
import {
  generateStudentId,
  hashSecret,
  hashStudentId,
  isValidPin,
  normalizeJoinCode,
  normalizeStudentId,
  verifySecret,
} from "../auth/crypto";
import { ServiceError, audit, cleanText, destroySubjectSessions, nameKey } from "./core";
import type { Actor } from "./staff";
import type { NameFormat, PinPolicy } from "./schools";

export type Language = "ar" | "fr" | "en";
export type StudentStatus = "pending" | "active" | "disabled" | "archived";
const LANGS: Language[] = ["ar", "fr", "en"];
const DUMMY_PIN_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export interface StudentSelf {
  id: string;
  displayName: string;
  nickname: string | null;
  age: number;
  language: Language;
  schoolId: string;
  schoolName: string;
  classId: string | null;
  className: string | null;
  grade: string | null;
  hasPin: boolean;
  pinPolicy: PinPolicy;
  showOnLeaderboard: boolean;
  aiConsent: boolean;
  leaderboardEnabled: boolean;
  classLeaderboardEnabled: boolean;
  nameFormat: NameFormat;
}

/** The name shown on a leaderboard, following the school's chosen format. Never includes IDs. */
export function formatDisplayName(
  displayName: string,
  nickname: string | null,
  format: NameFormat,
): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "Reader";
  const last = parts.length > 1 ? parts[parts.length - 1]! : "";
  const initial = (s: string) => Array.from(s)[0]?.toLocaleUpperCase() ?? "";
  switch (format) {
    case "first_name":
      return first;
    case "initials":
      return parts.map(initial).slice(0, 3).join(".") + ".";
    case "nickname":
      return nickname?.trim() || first;
    default:
      return last ? `${first} ${initial(last)}.` : first;
  }
}

function cleanAge(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < 3 || n > 19)
    throw new ServiceError(400, "invalid", "Age must be between 3 and 19.");
  return n;
}
function cleanLang(v: unknown): Language {
  if (!LANGS.includes(v as Language))
    throw new ServiceError(400, "invalid", "Choose Arabic, French or English.");
  return v as Language;
}
function cleanPin(v: unknown): string {
  if (typeof v !== "string" || !isValidPin(v))
    throw new ServiceError(400, "invalid-pin", "A PIN is 4 numbers, like 1234.");
  return v;
}

interface NewStudent {
  schoolId: string;
  classId: string | null;
  name: string;
  age: number;
  language: Language;
  pin: string | null;
  status: StudentStatus;
  force: boolean;
}

async function insertStudent(
  db: Db,
  s: NewStudent,
): Promise<{ id: string; studentId: string; hint: string }> {
  return db.tx(async (t) => {
    const key = nameKey(s.name);
    await t.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`reg:${s.schoolId}:${key}`]);
    if (!s.force) {
      const dup = await t.query(
        `SELECT 1 FROM students WHERE school_id = $1 AND name_key = $2 AND status IN ('pending','active','disabled')
           AND class_id IS NOT DISTINCT FROM $3 AND abs(age - $4) <= 1 LIMIT 1`,
        [s.schoolId, key, s.classId, s.age],
      );
      if (dup.rowCount > 0) {
        throw new ServiceError(
          409,
          "possible-duplicate",
          "A student with this name may already have an account. Ask your teacher to help you get your ID back instead of making a new one.",
        );
      }
    }
    const pinHash = s.pin ? await hashSecret(s.pin) : null;
    for (let i = 0; i < 6; i++) {
      const studentId = generateStudentId();
      const hint = studentId.slice(-4);
      const r = await t.query<{ id: string }>(
        `INSERT INTO students (school_id, class_id, id_hash, id_hint, display_name, name_key, age, language, status, pin_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id_hash) DO NOTHING RETURNING id`,
        [
          s.schoolId,
          s.classId,
          hashStudentId(studentId),
          hint,
          s.name,
          key,
          s.age,
          s.language,
          s.status,
          pinHash,
        ],
      );
      if (r.rows[0]) return { id: r.rows[0].id, studentId, hint };
    }
    throw new ServiceError(500, "id-collision", "Could not create an ID. Please try again.");
  });
}

async function checkClass(db: Db, schoolId: string, classId: unknown): Promise<string | null> {
  if (classId === undefined || classId === null || classId === "") return null;
  if (typeof classId !== "string")
    throw new ServiceError(400, "invalid", "Choose your class from the list.");
  const r = await db.query(
    "SELECT 1 FROM classes WHERE id = $1 AND school_id = $2 AND archived_at IS NULL",
    [classId, schoolId],
  );
  if (r.rowCount === 0) throw new ServiceError(400, "invalid", "Choose your class from the list.");
  return classId;
}

/** Self-registration with a school join code. The school is whoever owns the code; typing a school name proves nothing. */
export async function registerStudent(
  db: Db,
  input: {
    joinCode: unknown;
    name: unknown;
    classId?: unknown;
    age: unknown;
    language: unknown;
    pin?: unknown;
  },
) {
  const code = typeof input.joinCode === "string" ? normalizeJoinCode(input.joinCode) : null;
  const sc = code
    ? (
        await db.query<{
          id: string;
          name: string;
          require_approval: boolean;
          pin_policy: PinPolicy;
        }>(
          "SELECT id, name, require_approval, pin_policy FROM schools WHERE join_code = $1 AND archived_at IS NULL",
          [code],
        )
      ).rows[0]
    : undefined;
  if (!sc)
    throw new ServiceError(
      404,
      "bad-code",
      "That school code is not right. Ask your teacher for the code.",
    );
  const name = cleanText(input.name, 1, 60, "Your name");
  const age = cleanAge(input.age);
  const language = cleanLang(input.language);
  const classId = await checkClass(db, sc.id, input.classId);
  let pin: string | null = null;
  if (input.pin !== undefined && input.pin !== null && input.pin !== "") pin = cleanPin(input.pin);
  if (sc.pin_policy === "required" && !pin)
    throw new ServiceError(
      400,
      "pin-required",
      "Your school asks every student to choose a 4-number PIN.",
    );
  if (sc.pin_policy === "off") pin = null;
  const status: StudentStatus = sc.require_approval ? "pending" : "active";
  const created = await insertStudent(db, {
    schoolId: sc.id,
    classId,
    name,
    age,
    language,
    pin,
    status,
    force: false,
  });
  await audit(db, {
    actorKind: "system",
    schoolId: sc.id,
    action: "student.registered",
    targetKind: "student",
    targetId: created.id,
    detail: { status, hasPin: Boolean(pin) },
  });
  return { studentId: created.studentId, status, schoolName: sc.name, hasPin: Boolean(pin) };
}

/** Teacher/admin creates an account (e.g. for a 4-year-old). The ID is shown once, to the staff member. */
export async function createStudentByStaff(
  db: Db,
  actor: Actor,
  input: {
    name: unknown;
    classId?: unknown;
    age: unknown;
    language: unknown;
    pin?: unknown;
    force?: unknown;
  },
) {
  if (!actor.schoolId || actor.role === "platform_admin")
    throw new ServiceError(403, "forbidden", "Only school staff can add students.");
  const name = cleanText(input.name, 1, 60, "Name");
  const age = cleanAge(input.age);
  const language = cleanLang(input.language);
  const classId = await checkClass(db, actor.schoolId, input.classId);
  if (actor.classIds && (!classId || !actor.classIds.includes(classId)))
    throw new ServiceError(403, "forbidden", "You can only add students to your own classes.");
  const pin = input.pin ? cleanPin(input.pin) : null;
  const created = await insertStudent(db, {
    schoolId: actor.schoolId,
    classId,
    name,
    age,
    language,
    pin,
    status: "active",
    force: input.force === true,
  });
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "student.created_by_staff",
    targetKind: "student",
    targetId: created.id,
  });
  return { id: created.id, studentId: created.studentId };
}

export async function loginStudent(db: Db, idIn: unknown, pinIn: unknown): Promise<{ id: string }> {
  const generic = new ServiceError(
    401,
    "bad-login",
    "That ID or PIN is not right. Check it and try again, or ask your teacher.",
  );
  const norm = typeof idIn === "string" ? normalizeStudentId(idIn) : null;
  if (!norm) throw generic;
  const r = await db.query<{
    id: string;
    status: StudentStatus;
    pin_hash: string | null;
    failed_attempts: number;
    locked_until: Date | null;
    archived: Date | null;
  }>(
    `SELECT st.id, st.status, st.pin_hash, st.failed_attempts, st.locked_until, sc.archived_at AS archived
       FROM students st JOIN schools sc ON sc.id = st.school_id WHERE st.id_hash = $1`,
    [hashStudentId(norm)],
  );
  const row = r.rows[0];
  if (!row) {
    await verifySecret(typeof pinIn === "string" ? pinIn : "0000", DUMMY_PIN_HASH);
    throw generic;
  }
  if (row.locked_until && row.locked_until > new Date())
    throw new ServiceError(
      429,
      "locked",
      "Too many wrong tries. Please ask your teacher or wait 15 minutes.",
    );
  if (row.pin_hash) {
    const ok =
      typeof pinIn === "string" && isValidPin(pinIn) && (await verifySecret(pinIn, row.pin_hash));
    if (!ok) {
      const fails = row.failed_attempts + 1;
      if (fails >= 5)
        await db.query(
          "UPDATE students SET failed_attempts = 0, locked_until = now() + interval '15 minutes' WHERE id = $1",
          [row.id],
        );
      else
        await db.query("UPDATE students SET failed_attempts = $2 WHERE id = $1", [row.id, fails]);
      throw generic;
    }
  }
  if (row.status === "pending")
    throw new ServiceError(
      403,
      "pending",
      "Your teacher needs to approve your account first. Please check back soon.",
    );
  if (row.status !== "active" || row.archived)
    throw new ServiceError(403, "inactive", "This account is not active. Please ask your teacher.");
  await db.query(
    "UPDATE students SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1",
    [row.id],
  );
  return { id: row.id };
}

export async function getStudentSelf(db: Db, studentId: string): Promise<StudentSelf | null> {
  const r = await db.query<{
    id: string;
    display_name: string;
    nickname: string | null;
    age: number;
    language: Language;
    school_id: string;
    school_name: string;
    class_id: string | null;
    class_name: string | null;
    grade: string | null;
    pin_hash: string | null;
    pin_policy: PinPolicy;
    show_on_leaderboard: boolean;
    ai_consent: boolean;
    leaderboard_enabled: boolean;
    class_leaderboard_enabled: boolean;
    name_format: NameFormat;
    status: StudentStatus;
  }>(
    `SELECT st.id, st.display_name, st.nickname, st.age, st.language, st.school_id, sc.name AS school_name, st.class_id, c.name AS class_name,
            c.grade, st.pin_hash, sc.pin_policy, st.show_on_leaderboard, st.ai_consent, sc.leaderboard_enabled, sc.class_leaderboard_enabled, sc.name_format, st.status
       FROM students st JOIN schools sc ON sc.id = st.school_id LEFT JOIN classes c ON c.id = st.class_id
      WHERE st.id = $1 AND sc.archived_at IS NULL`,
    [studentId],
  );
  const s = r.rows[0];
  if (!s || s.status !== "active") return null;
  return {
    id: s.id,
    displayName: s.display_name,
    nickname: s.nickname,
    age: s.age,
    language: s.language,
    schoolId: s.school_id,
    schoolName: s.school_name,
    classId: s.class_id,
    className: s.class_name,
    grade: s.grade,
    hasPin: Boolean(s.pin_hash),
    pinPolicy: s.pin_policy,
    showOnLeaderboard: s.show_on_leaderboard,
    aiConsent: s.ai_consent,
    leaderboardEnabled: s.leaderboard_enabled,
    classLeaderboardEnabled: s.class_leaderboard_enabled,
    nameFormat: s.name_format,
  };
}

export async function updateStudentSelf(
  db: Db,
  studentId: string,
  patch: {
    nickname?: unknown;
    language?: unknown;
    showOnLeaderboard?: unknown;
    aiConsent?: unknown;
    currentPin?: unknown;
    newPin?: unknown;
    removePin?: unknown;
  },
) {
  const me = await getStudentSelf(db, studentId);
  if (!me) throw new ServiceError(404, "not-found", "Account not found.");
  const sets: string[] = [];
  const vals: unknown[] = [studentId];
  const add = (c: string, v: unknown) => {
    vals.push(v);
    sets.push(`${c} = $${vals.length}`);
  };
  if (patch.nickname !== undefined)
    add(
      "nickname",
      patch.nickname === "" || patch.nickname === null
        ? null
        : cleanText(patch.nickname, 1, 30, "Nickname"),
    );
  if (patch.language !== undefined) add("language", cleanLang(patch.language));
  if (patch.showOnLeaderboard !== undefined)
    add("show_on_leaderboard", patch.showOnLeaderboard === true);
  if (patch.aiConsent !== undefined) add("ai_consent", patch.aiConsent === true);
  if (patch.newPin !== undefined || patch.removePin === true) {
    if (me.pinPolicy === "off")
      throw new ServiceError(400, "pin-off", "Your school does not use PINs.");
    if (me.hasPin) {
      const stored = (
        await db.query<{ pin_hash: string }>("SELECT pin_hash FROM students WHERE id = $1", [
          studentId,
        ])
      ).rows[0]!.pin_hash;
      const ok =
        typeof patch.currentPin === "string" &&
        isValidPin(patch.currentPin) &&
        (await verifySecret(patch.currentPin, stored));
      if (!ok) throw new ServiceError(403, "bad-pin", "Your current PIN is not right.");
    }
    if (patch.removePin === true) {
      if (me.pinPolicy === "required")
        throw new ServiceError(
          400,
          "pin-required",
          "Your school asks every student to have a PIN.",
        );
      add("pin_hash", null);
    } else add("pin_hash", await hashSecret(cleanPin(patch.newPin)));
  }
  if (sets.length === 0) return me;
  await db.query(`UPDATE students SET ${sets.join(", ")} WHERE id = $1`, vals);
  return getStudentSelf(db, studentId);
}

// ── staff operations ────────────────────────────────────────────────────────────────────────
export async function visibleStudent(db: Db, actor: Actor, studentId: string) {
  if (!actor.schoolId || actor.role === "platform_admin")
    throw new ServiceError(404, "not-found", "Student not found.");
  if (typeof studentId !== "string" || !/^[0-9a-f-]{36}$/i.test(studentId))
    throw new ServiceError(404, "not-found", "Student not found.");
  const r = await db.query<{
    id: string;
    school_id: string;
    class_id: string | null;
    status: StudentStatus;
    display_name: string;
  }>(
    "SELECT id, school_id, class_id, status, display_name FROM students WHERE id = $1 AND school_id = $2",
    [studentId, actor.schoolId],
  );
  const s = r.rows[0];
  if (!s || (actor.classIds && (!s.class_id || !actor.classIds.includes(s.class_id))))
    throw new ServiceError(404, "not-found", "Student not found.");
  return s;
}

export async function listStudents(
  db: Db,
  actor: Actor,
  f: { status?: string; classId?: string; q?: string; limit?: number; offset?: number },
) {
  if (!actor.schoolId || actor.role === "platform_admin")
    throw new ServiceError(403, "forbidden", "Only school staff can see students.");
  const q = f.q ? `%${f.q.replace(/[%_\\]/g, "\\$&").slice(0, 60)}%` : null;
  const r = await db.query(
    `SELECT st.id, st.display_name, st.nickname, st.age, st.language, st.status, st.id_hint, st.class_id, c.name AS class_name, c.grade,
            (st.pin_hash IS NOT NULL) AS has_pin, st.created_at, st.last_login_at,
            (SELECT count(*)::int FROM completions co WHERE co.student_id = st.id AND co.voided_at IS NULL) AS books_completed
       FROM students st LEFT JOIN classes c ON c.id = st.class_id
      WHERE st.school_id = $1 AND ($2::text IS NULL OR st.status = $2) AND ($3::uuid IS NULL OR st.class_id = $3)
        AND ($4::text IS NULL OR st.display_name ILIKE $4) AND ($5::uuid[] IS NULL OR st.class_id = ANY($5::uuid[]))
      ORDER BY st.status = 'pending' DESC, st.display_name LIMIT $6 OFFSET $7`,
    [
      actor.schoolId,
      f.status ?? null,
      f.classId ?? null,
      q,
      actor.classIds,
      Math.min(f.limit ?? 100, 200),
      f.offset ?? 0,
    ],
  );
  return r.rows;
}

export async function approveStudent(db: Db, actor: Actor, studentId: string, approve: boolean) {
  const s = await visibleStudent(db, actor, studentId);
  if (s.status !== "pending")
    throw new ServiceError(409, "not-pending", "This student is not waiting for approval.");
  await db.query("UPDATE students SET status = $2 WHERE id = $1", [
    studentId,
    approve ? "active" : "archived",
  ]);
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId: s.school_id,
    action: approve ? "student.approved" : "student.rejected",
    targetKind: "student",
    targetId: studentId,
  });
}

export async function updateStudentByStaff(
  db: Db,
  actor: Actor,
  studentId: string,
  patch: { classId?: unknown; name?: unknown; age?: unknown; language?: unknown },
) {
  const s = await visibleStudent(db, actor, studentId);
  const sets: string[] = [];
  const vals: unknown[] = [studentId];
  const add = (c: string, v: unknown) => {
    vals.push(v);
    sets.push(`${c} = $${vals.length}`);
  };
  if (patch.classId !== undefined) {
    const cid = await checkClass(db, s.school_id, patch.classId);
    if (actor.classIds && (!cid || !actor.classIds.includes(cid)))
      throw new ServiceError(403, "forbidden", "You can only move students into your own classes.");
    add("class_id", cid);
  }
  if (patch.name !== undefined) {
    const n = cleanText(patch.name, 1, 60, "Name");
    add("display_name", n);
    add("name_key", nameKey(n));
  }
  if (patch.age !== undefined) add("age", cleanAge(patch.age));
  if (patch.language !== undefined) add("language", cleanLang(patch.language));
  if (sets.length === 0) throw new ServiceError(400, "invalid", "Nothing to change.");
  await db.query(`UPDATE students SET ${sets.join(", ")} WHERE id = $1`, vals);
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId: s.school_id,
    action: "student.updated",
    targetKind: "student",
    targetId: studentId,
    detail: { keys: Object.keys(patch) },
  });
}

function requireVerified(v: unknown): void {
  if (v !== true)
    throw new ServiceError(
      400,
      "verify-required",
      "Confirm that you checked this student's identity first.",
    );
}

/** Lost ID: issues a brand-new ID (the old one stops working immediately) and signs the child out everywhere. */
export async function reissueAccess(
  db: Db,
  actor: Actor,
  studentId: string,
  input: { identityVerified: unknown; newPin?: unknown },
) {
  requireVerified(input.identityVerified);
  const s = await visibleStudent(db, actor, studentId);
  if (s.status === "archived")
    throw new ServiceError(409, "archived", "Restore this account first.");
  const pin = input.newPin ? cleanPin(input.newPin) : undefined;
  for (let i = 0; i < 6; i++) {
    const studentId2 = generateStudentId();
    try {
      await db.tx(async (t) => {
        await t.query(
          "UPDATE students SET id_hash = $2, id_hint = $3, failed_attempts = 0, locked_until = NULL WHERE id = $1",
          [studentId, hashStudentId(studentId2), studentId2.slice(-4)],
        );
        if (pin !== undefined)
          await t.query("UPDATE students SET pin_hash = $2 WHERE id = $1", [
            studentId,
            await hashSecret(pin),
          ]);
        await destroySubjectSessions(t, "student", studentId);
        await audit(t, {
          actorKind: "staff",
          actorId: actor.id,
          schoolId: s.school_id,
          action: "student.access_reissued",
          targetKind: "student",
          targetId: studentId,
          detail: { identityVerified: true, pinReset: pin !== undefined },
        });
      });
      return { studentId: studentId2 };
    } catch (e) {
      if (!(e instanceof Error) || !/unique|duplicate/i.test(e.message)) throw e;
    }
  }
  throw new ServiceError(500, "id-collision", "Could not create an ID. Please try again.");
}

export async function resetPin(
  db: Db,
  actor: Actor,
  studentId: string,
  input: { identityVerified: unknown; newPin?: unknown },
) {
  requireVerified(input.identityVerified);
  const s = await visibleStudent(db, actor, studentId);
  const sc = (
    await db.query<{ pin_policy: PinPolicy }>("SELECT pin_policy FROM schools WHERE id = $1", [
      s.school_id,
    ])
  ).rows[0]!;
  if (sc.pin_policy === "off")
    throw new ServiceError(400, "pin-off", "This school does not use PINs.");
  if (!input.newPin && sc.pin_policy === "required")
    throw new ServiceError(400, "pin-required", "This school requires a PIN. Enter a new one.");
  const hash = input.newPin ? await hashSecret(cleanPin(input.newPin)) : null;
  await db.query(
    "UPDATE students SET pin_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1",
    [studentId, hash],
  );
  await destroySubjectSessions(db, "student", studentId);
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId: s.school_id,
    action: "student.pin_reset",
    targetKind: "student",
    targetId: studentId,
    detail: { identityVerified: true, removed: !input.newPin },
  });
}

export async function setStudentStatus(
  db: Db,
  actor: Actor,
  studentId: string,
  status: "active" | "disabled" | "archived",
) {
  const s = await visibleStudent(db, actor, studentId);
  if (!["active", "disabled", "archived"].includes(status))
    throw new ServiceError(400, "invalid", "Unknown status.");
  await db.query("UPDATE students SET status = $2 WHERE id = $1", [studentId, status]);
  if (status !== "active") await destroySubjectSessions(db, "student", studentId);
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId: s.school_id,
    action: `student.${status}`,
    targetKind: "student",
    targetId: studentId,
    detail: { from: s.status },
  });
}
