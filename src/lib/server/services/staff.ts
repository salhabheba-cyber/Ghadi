import { timingSafeEqual } from "node:crypto";
import type { Db } from "../db/client";
import { hashSecret, hashToken, newToken, verifySecret } from "../auth/crypto";
import { ServiceError, audit, cleanText, destroySubjectSessions } from "./core";

export type StaffRole = "platform_admin" | "school_admin" | "teacher";

export interface Actor {
  id: string;
  role: StaffRole;
  name: string;
  email: string;
  schoolId: string | null;
  /** null = every class in the school; otherwise only these classes. */
  classIds: string[] | null;
}

const MIN_PASSWORD = 10;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function cleanEmail(input: unknown): string {
  const e = cleanText(input, 3, 254, "Email").toLowerCase();
  if (!EMAIL.test(e)) throw new ServiceError(400, "invalid", "Please enter a valid email address.");
  return e;
}

export function checkPassword(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD || pw.length > 200) {
    throw new ServiceError(
      400,
      "weak-password",
      `Use a password with at least ${MIN_PASSWORD} characters.`,
    );
  }
  return pw;
}

export async function loadActor(db: Db, staffId: string): Promise<Actor | null> {
  const r = await db.query<{
    id: string;
    role: StaffRole;
    name: string;
    email: string;
    school_id: string | null;
  }>("SELECT id, role, name, email, school_id FROM staff WHERE id = $1 AND disabled_at IS NULL", [
    staffId,
  ]);
  const s = r.rows[0];
  if (!s) return null;
  let classIds: string[] | null = null;
  if (s.role === "teacher") {
    const c = await db.query<{ class_id: string }>(
      "SELECT class_id FROM staff_classes WHERE staff_id = $1",
      [s.id],
    );
    classIds = c.rows.map((x) => x.class_id);
  }
  return { id: s.id, role: s.role, name: s.name, email: s.email, schoolId: s.school_id, classIds };
}

/** First-run creation of the platform administrator. Needs GHADI_SETUP_TOKEN (set by the host; never typed in chat). */
export async function bootstrapPlatformAdmin(
  db: Db,
  input: { setupToken: unknown; email: unknown; name: unknown; password: unknown },
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  const expected = env.GHADI_SETUP_TOKEN;
  if (!expected || expected.length < 16) {
    throw new ServiceError(
      503,
      "setup-disabled",
      "Admin setup is not enabled. Set GHADI_SETUP_TOKEN (16+ characters) on the server.",
    );
  }
  const given = typeof input.setupToken === "string" ? input.setupToken : "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new ServiceError(403, "bad-setup-token", "That setup token is not correct.");
  const email = cleanEmail(input.email);
  const name = cleanText(input.name, 1, 120, "Name");
  const password = checkPassword(input.password);
  return db.tx(async (t) => {
    await t.query("SELECT pg_advisory_xact_lock(74610002)");
    const exists = await t.query("SELECT 1 FROM staff WHERE role = 'platform_admin' LIMIT 1");
    if (exists.rowCount > 0)
      throw new ServiceError(409, "already-set-up", "A platform administrator already exists.");
    const r = await t.query<{ id: string }>(
      "INSERT INTO staff (school_id, email, name, role, password_hash) VALUES (NULL,$1,$2,'platform_admin',$3) RETURNING id",
      [email, name, await hashSecret(password)],
    );
    const id = r.rows[0]!.id;
    await audit(t, {
      actorKind: "system",
      action: "platform_admin.created",
      targetKind: "staff",
      targetId: id,
    });
    return id;
  });
}

export async function platformAdminExists(db: Db): Promise<boolean> {
  const r = await db.query("SELECT 1 FROM staff WHERE role = 'platform_admin' LIMIT 1");
  return r.rowCount > 0;
}

const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function staffLogin(db: Db, emailIn: unknown, password: unknown): Promise<string> {
  const generic = new ServiceError(401, "bad-login", "Email or password is not correct.");
  if (typeof emailIn !== "string" || typeof password !== "string" || password.length > 200)
    throw generic;
  const email = emailIn.trim().toLowerCase();
  const r = await db.query<{
    id: string;
    password_hash: string;
    failed_attempts: number;
    locked_until: Date | null;
    disabled_at: Date | null;
    school_archived: Date | null;
  }>(
    `SELECT s.id, s.password_hash, s.failed_attempts, s.locked_until, s.disabled_at, sc.archived_at AS school_archived
       FROM staff s LEFT JOIN schools sc ON sc.id = s.school_id WHERE s.email = $1`,
    [email],
  );
  const row = r.rows[0];
  if (!row) {
    await verifySecret(password, DUMMY_HASH); // keep timing similar
    throw generic;
  }
  if (row.locked_until && row.locked_until > new Date()) {
    throw new ServiceError(429, "locked", "Too many wrong passwords. Try again in 15 minutes.");
  }
  const ok = await verifySecret(password, row.password_hash);
  if (!ok) {
    const fails = row.failed_attempts + 1;
    if (fails >= 5) {
      await db.query(
        "UPDATE staff SET failed_attempts = 0, locked_until = now() + interval '15 minutes' WHERE id = $1",
        [row.id],
      );
    } else {
      await db.query("UPDATE staff SET failed_attempts = $2 WHERE id = $1", [row.id, fails]);
    }
    throw generic;
  }
  if (row.disabled_at || row.school_archived) throw generic;
  await db.query("UPDATE staff SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [
    row.id,
  ]);
  return row.id;
}

export async function createInvite(
  db: Db,
  actor: Actor,
  input: { email: unknown; name: unknown; role: unknown; schoolId?: unknown; classIds?: unknown },
): Promise<{ token: string; expiresAt: Date }> {
  const email = cleanEmail(input.email);
  const name = cleanText(input.name, 1, 120, "Name");
  const role =
    input.role === "teacher" ? "teacher" : input.role === "school_admin" ? "school_admin" : null;
  if (!role) throw new ServiceError(400, "invalid", "Choose teacher or school administrator.");
  let schoolId: string;
  if (actor.role === "platform_admin") {
    if (role !== "school_admin")
      throw new ServiceError(
        403,
        "forbidden",
        "Platform administrators invite school administrators; school administrators invite teachers.",
      );
    if (typeof input.schoolId !== "string")
      throw new ServiceError(400, "invalid", "Choose a school.");
    schoolId = input.schoolId;
  } else if (actor.role === "school_admin" && actor.schoolId) {
    schoolId = actor.schoolId;
  } else throw new ServiceError(403, "forbidden", "You cannot invite staff.");
  const school = await db.query("SELECT 1 FROM schools WHERE id = $1 AND archived_at IS NULL", [
    schoolId,
  ]);
  if (school.rowCount === 0) throw new ServiceError(404, "not-found", "School not found.");
  const taken = await db.query("SELECT 1 FROM staff WHERE email = $1", [email]);
  if (taken.rowCount > 0)
    throw new ServiceError(409, "email-taken", "That email already has an account.");
  let classIds: string[] = [];
  if (role === "teacher" && Array.isArray(input.classIds)) {
    classIds = input.classIds.filter((c): c is string => typeof c === "string");
    const ok = await db.query(
      "SELECT id FROM classes WHERE school_id = $1 AND id = ANY($2::uuid[])",
      [schoolId, classIds],
    );
    if (ok.rowCount !== classIds.length)
      throw new ServiceError(400, "invalid", "A class does not belong to this school.");
  }
  const token = newToken();
  const r = await db.query<{ expires_at: Date }>(
    `INSERT INTO staff_invites (token_hash, school_id, email, name, role, class_ids, expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6, now() + interval '7 days', $7) RETURNING expires_at`,
    [hashToken(token), schoolId, email, name, role, classIds, actor.id],
  );
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId,
    action: "staff.invited",
    targetKind: "invite",
    detail: { role, email },
  });
  return { token, expiresAt: r.rows[0]!.expires_at };
}

export async function inviteInfo(
  db: Db,
  token: string,
): Promise<{ email: string; name: string; role: string; schoolName: string }> {
  const r = await db.query<{ email: string; name: string; role: string; school_name: string }>(
    `SELECT i.email, i.name, i.role, s.name AS school_name FROM staff_invites i JOIN schools s ON s.id = i.school_id
      WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > now()`,
    [hashToken(token)],
  );
  const row = r.rows[0];
  if (!row)
    throw new ServiceError(404, "invite-invalid", "This invitation is not valid or has expired.");
  return { email: row.email, name: row.name, role: row.role, schoolName: row.school_name };
}

export async function acceptInvite(db: Db, token: string, password: unknown): Promise<string> {
  const pw = checkPassword(password);
  return db.tx(async (t) => {
    const r = await t.query<{
      id: string;
      school_id: string;
      email: string;
      name: string;
      role: StaffRole;
      class_ids: string[];
    }>(
      `SELECT id, school_id, email, name, role, class_ids FROM staff_invites
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
      [hashToken(token)],
    );
    const inv = r.rows[0];
    if (!inv)
      throw new ServiceError(404, "invite-invalid", "This invitation is not valid or has expired.");
    const taken = await t.query("SELECT 1 FROM staff WHERE email = $1", [inv.email]);
    if (taken.rowCount > 0)
      throw new ServiceError(409, "email-taken", "That email already has an account.");
    const s = await t.query<{ id: string }>(
      "INSERT INTO staff (school_id, email, name, role, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [inv.school_id, inv.email, inv.name, inv.role, await hashSecret(pw)],
    );
    const staffId = s.rows[0]!.id;
    for (const c of inv.class_ids)
      await t.query(
        "INSERT INTO staff_classes (staff_id, class_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [staffId, c],
      );
    await t.query("UPDATE staff_invites SET used_at = now() WHERE id = $1", [inv.id]);
    await audit(t, {
      actorKind: "staff",
      actorId: staffId,
      schoolId: inv.school_id,
      action: "staff.joined",
      targetKind: "staff",
      targetId: staffId,
      detail: { role: inv.role },
    });
    return staffId;
  });
}

export async function listStaff(db: Db, actor: Actor, schoolId: string | null) {
  const sid = actor.role === "platform_admin" ? schoolId : actor.schoolId;
  if (actor.role === "teacher")
    throw new ServiceError(403, "forbidden", "Only administrators can see staff.");
  const r = await db.query(
    `SELECT s.id, s.name, s.email, s.role, s.school_id, s.disabled_at, s.created_at,
            COALESCE((SELECT array_agg(class_id) FROM staff_classes WHERE staff_id = s.id), '{}') AS class_ids
       FROM staff s WHERE ($1::uuid IS NULL OR s.school_id = $1) AND s.role <> 'platform_admin' ORDER BY s.created_at`,
    [sid],
  );
  return r.rows;
}

export async function setStaffDisabled(
  db: Db,
  actor: Actor,
  staffId: string,
  disabled: boolean,
): Promise<void> {
  const r = await db.query<{ school_id: string; role: StaffRole }>(
    "SELECT school_id, role FROM staff WHERE id = $1",
    [staffId],
  );
  const target = r.rows[0];
  const allowed =
    target &&
    target.role !== "platform_admin" &&
    staffId !== actor.id &&
    (actor.role === "platform_admin" ||
      (actor.role === "school_admin" && actor.schoolId === target.school_id));
  if (!allowed || !target) throw new ServiceError(404, "not-found", "Staff member not found.");
  await db.query(
    "UPDATE staff SET disabled_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1",
    [staffId, disabled],
  );
  if (disabled) await destroySubjectSessions(db, "staff", staffId);
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId: target.school_id,
    action: disabled ? "staff.disabled" : "staff.enabled",
    targetKind: "staff",
    targetId: staffId,
  });
}

export async function setTeacherClasses(
  db: Db,
  actor: Actor,
  staffId: string,
  classIds: string[],
): Promise<void> {
  if (actor.role !== "school_admin" || !actor.schoolId)
    throw new ServiceError(403, "forbidden", "Only school administrators can assign classes.");
  const t = await db.query(
    "SELECT 1 FROM staff WHERE id = $1 AND school_id = $2 AND role = 'teacher'",
    [staffId, actor.schoolId],
  );
  if (t.rowCount === 0) throw new ServiceError(404, "not-found", "Teacher not found.");
  const ok = await db.query(
    "SELECT id FROM classes WHERE school_id = $1 AND id = ANY($2::uuid[])",
    [actor.schoolId, classIds],
  );
  if (ok.rowCount !== classIds.length)
    throw new ServiceError(400, "invalid", "A class does not belong to this school.");
  await db.tx(async (tx) => {
    await tx.query("DELETE FROM staff_classes WHERE staff_id = $1", [staffId]);
    for (const c of classIds)
      await tx.query("INSERT INTO staff_classes (staff_id, class_id) VALUES ($1,$2)", [staffId, c]);
    await audit(tx, {
      actorKind: "staff",
      actorId: actor.id,
      schoolId: actor.schoolId,
      action: "teacher.classes_set",
      targetKind: "staff",
      targetId: staffId,
      detail: { classIds },
    });
  });
}
