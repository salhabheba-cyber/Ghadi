import type { Db } from "../db/client";
import { generateJoinCode, normalizeJoinCode } from "../auth/crypto";
import { ServiceError, audit, cleanText } from "./core";
import type { Actor } from "./staff";

export type NameFormat = "first_name" | "first_initial" | "initials" | "nickname";
export const NAME_FORMATS: NameFormat[] = ["first_name", "first_initial", "initials", "nickname"];
export type PinPolicy = "off" | "optional" | "required";

export interface SchoolRow {
  id: string;
  name: string;
  slug: string;
  join_code: string;
  name_format: NameFormat;
  leaderboard_enabled: boolean;
  class_leaderboard_enabled: boolean;
  require_approval: boolean;
  pin_policy: PinPolicy;
  created_at: Date;
  archived_at: Date | null;
}

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "school";
}

export async function createSchool(db: Db, actor: Actor, nameIn: unknown): Promise<SchoolRow> {
  if (actor.role !== "platform_admin")
    throw new ServiceError(403, "forbidden", "Only the platform administrator can create schools.");
  const name = cleanText(nameIn, 2, 120, "School name");
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug =
      attempt === 0 ? slugify(name) : `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      const r = await db.query<SchoolRow>(
        "INSERT INTO schools (name, slug, join_code) VALUES ($1,$2,$3) RETURNING *",
        [name, slug, generateJoinCode()],
      );
      const school = r.rows[0]!;
      await audit(db, {
        actorKind: "staff",
        actorId: actor.id,
        schoolId: school.id,
        action: "school.created",
        targetKind: "school",
        targetId: school.id,
        detail: { name },
      });
      return school;
    } catch (e) {
      if (!(e instanceof Error) || !/duplicate key|unique/i.test(e.message)) throw e;
    }
  }
  throw new ServiceError(500, "slug-collision", "Could not create the school. Please try again.");
}

export async function getSchool(db: Db, schoolId: string): Promise<SchoolRow | null> {
  const r = await db.query<SchoolRow>("SELECT * FROM schools WHERE id = $1", [schoolId]);
  return r.rows[0] ?? null;
}

/** What a child sees after typing a join code: only what they need to sign up. */
export async function schoolByJoinCode(db: Db, code: unknown) {
  const norm = typeof code === "string" ? normalizeJoinCode(code) : null;
  const generic = new ServiceError(
    404,
    "bad-code",
    "That school code is not right. Ask your teacher for the code.",
  );
  if (!norm) throw generic;
  const r = await db.query<{
    id: string;
    name: string;
    require_approval: boolean;
    pin_policy: PinPolicy;
  }>(
    "SELECT id, name, require_approval, pin_policy FROM schools WHERE join_code = $1 AND archived_at IS NULL",
    [norm],
  );
  const s = r.rows[0];
  if (!s) throw generic;
  const classes = await db.query<{ id: string; name: string; grade: string }>(
    "SELECT id, name, grade FROM classes WHERE school_id = $1 AND archived_at IS NULL ORDER BY grade, name",
    [s.id],
  );
  return {
    id: s.id,
    name: s.name,
    requireApproval: s.require_approval,
    pinPolicy: s.pin_policy,
    classes: classes.rows,
  };
}

export function assertSchoolAdmin(actor: Actor, schoolId: string): void {
  if (actor.role === "school_admin" && actor.schoolId === schoolId) return;
  throw new ServiceError(404, "not-found", "School not found.");
}

export function assertSchoolStaff(actor: Actor, schoolId: string): void {
  if ((actor.role === "school_admin" || actor.role === "teacher") && actor.schoolId === schoolId)
    return;
  throw new ServiceError(404, "not-found", "School not found.");
}

export async function updateSchoolSettings(
  db: Db,
  actor: Actor,
  schoolId: string,
  patch: Record<string, unknown>,
): Promise<SchoolRow> {
  assertSchoolAdmin(actor, schoolId);
  const sets: string[] = [];
  const vals: unknown[] = [schoolId];
  const add = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (patch.name !== undefined) add("name", cleanText(patch.name, 2, 120, "School name"));
  if (patch.nameFormat !== undefined) {
    if (!NAME_FORMATS.includes(patch.nameFormat as NameFormat))
      throw new ServiceError(400, "invalid", "Unknown name format.");
    add("name_format", patch.nameFormat);
  }
  if (patch.leaderboardEnabled !== undefined)
    add("leaderboard_enabled", patch.leaderboardEnabled === true);
  if (patch.classLeaderboardEnabled !== undefined)
    add("class_leaderboard_enabled", patch.classLeaderboardEnabled === true);
  if (patch.requireApproval !== undefined) add("require_approval", patch.requireApproval === true);
  if (patch.pinPolicy !== undefined) {
    if (!["off", "optional", "required"].includes(patch.pinPolicy as string))
      throw new ServiceError(400, "invalid", "Unknown PIN policy.");
    add("pin_policy", patch.pinPolicy);
  }
  if (sets.length === 0) throw new ServiceError(400, "invalid", "Nothing to change.");
  const r = await db.query<SchoolRow>(
    `UPDATE schools SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
    vals,
  );
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId,
    action: "school.settings_changed",
    targetKind: "school",
    targetId: schoolId,
    detail: { keys: Object.keys(patch) },
  });
  return r.rows[0]!;
}

export async function rotateJoinCode(db: Db, actor: Actor, schoolId: string): Promise<string> {
  assertSchoolAdmin(actor, schoolId);
  const code = generateJoinCode();
  await db.query("UPDATE schools SET join_code = $2 WHERE id = $1", [schoolId, code]);
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId,
    action: "school.join_code_rotated",
    targetKind: "school",
    targetId: schoolId,
  });
  return code;
}

export async function setSchoolArchived(
  db: Db,
  actor: Actor,
  schoolId: string,
  archived: boolean,
): Promise<void> {
  if (actor.role !== "platform_admin")
    throw new ServiceError(
      403,
      "forbidden",
      "Only the platform administrator can archive schools.",
    );
  const r = await db.query(
    "UPDATE schools SET archived_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1",
    [schoolId, archived],
  );
  if (r.rowCount === 0) throw new ServiceError(404, "not-found", "School not found.");
  if (archived)
    await db.query(
      "DELETE FROM sessions WHERE (kind='student' AND subject_id IN (SELECT id FROM students WHERE school_id=$1)) OR (kind='staff' AND subject_id IN (SELECT id FROM staff WHERE school_id=$1))",
      [schoolId],
    );
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId,
    action: archived ? "school.archived" : "school.restored",
    targetKind: "school",
    targetId: schoolId,
  });
}

// ── classes ──────────────────────────────────────────────────────────────────────────────────
export async function createClass(
  db: Db,
  actor: Actor,
  schoolId: string,
  input: { name: unknown; grade?: unknown },
) {
  assertSchoolAdmin(actor, schoolId);
  const name = cleanText(input.name, 1, 80, "Class name");
  const grade =
    input.grade === undefined || input.grade === "" ? "" : cleanText(input.grade, 0, 40, "Grade");
  try {
    const r = await db.query(
      "INSERT INTO classes (school_id, name, grade) VALUES ($1,$2,$3) RETURNING id, name, grade",
      [schoolId, name, grade],
    );
    const c = r.rows[0] as { id: string };
    await audit(db, {
      actorKind: "staff",
      actorId: actor.id,
      schoolId,
      action: "class.created",
      targetKind: "class",
      targetId: c.id,
      detail: { name, grade },
    });
    return r.rows[0];
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message))
      throw new ServiceError(409, "class-exists", "A class with that name already exists.");
    throw e;
  }
}

export async function updateClass(
  db: Db,
  actor: Actor,
  schoolId: string,
  classId: string,
  patch: { name?: unknown; grade?: unknown; archived?: unknown },
) {
  assertSchoolAdmin(actor, schoolId);
  const own = await db.query("SELECT 1 FROM classes WHERE id = $1 AND school_id = $2", [
    classId,
    schoolId,
  ]);
  if (own.rowCount === 0) throw new ServiceError(404, "not-found", "Class not found.");
  if (patch.name !== undefined)
    await db.query("UPDATE classes SET name = $2 WHERE id = $1", [
      classId,
      cleanText(patch.name, 1, 80, "Class name"),
    ]);
  if (patch.grade !== undefined)
    await db.query("UPDATE classes SET grade = $2 WHERE id = $1", [
      classId,
      cleanText(patch.grade, 0, 40, "Grade"),
    ]);
  if (patch.archived !== undefined)
    await db.query(
      "UPDATE classes SET archived_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1",
      [classId, patch.archived === true],
    );
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId,
    action: "class.updated",
    targetKind: "class",
    targetId: classId,
    detail: { keys: Object.keys(patch) },
  });
}

export async function listClasses(db: Db, actor: Actor, schoolId: string) {
  assertSchoolStaff(actor, schoolId);
  const r = await db.query(
    `SELECT c.id, c.name, c.grade, c.archived_at,
            (SELECT count(*)::int FROM students s WHERE s.class_id = c.id AND s.status = 'active') AS students
       FROM classes c WHERE c.school_id = $1 AND ($2::uuid[] IS NULL OR c.id = ANY($2::uuid[])) ORDER BY c.archived_at NULLS FIRST, c.grade, c.name`,
    [schoolId, actor.classIds],
  );
  return r.rows;
}

// ── challenges and prizes ────────────────────────────────────────────────────────────────────
export async function saveChallenge(
  db: Db,
  actor: Actor,
  schoolId: string,
  input: { id?: unknown; name: unknown; startsOn: unknown; endsOn: unknown; prizes?: unknown },
) {
  assertSchoolAdmin(actor, schoolId);
  const name = cleanText(input.name, 1, 100, "Challenge name");
  const date = (v: unknown, label: string) => {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))
      throw new ServiceError(400, "invalid", `${label} must be a date (YYYY-MM-DD).`);
    return v;
  };
  const startsOn = date(input.startsOn, "Start date");
  const endsOn = date(input.endsOn, "End date");
  if (endsOn < startsOn)
    throw new ServiceError(400, "invalid", "The end date must be on or after the start date.");
  const prizes: Record<string, string> = {};
  if (input.prizes && typeof input.prizes === "object") {
    for (const [rank, text] of Object.entries(input.prizes as Record<string, unknown>)) {
      if (!/^[1-5]$/.test(rank)) continue;
      if (typeof text === "string" && text.trim())
        prizes[rank] = cleanText(text, 1, 120, `Prize for rank ${rank}`);
    }
  }
  if (typeof input.id === "string") {
    const r = await db.query(
      "UPDATE challenges SET name=$3, starts_on=$4, ends_on=$5, prizes=$6 WHERE id=$1 AND school_id=$2 RETURNING id",
      [input.id, schoolId, name, startsOn, endsOn, JSON.stringify(prizes)],
    );
    if (r.rowCount === 0) throw new ServiceError(404, "not-found", "Challenge not found.");
    await audit(db, {
      actorKind: "staff",
      actorId: actor.id,
      schoolId,
      action: "challenge.updated",
      targetKind: "challenge",
      targetId: input.id,
    });
    return { id: input.id };
  }
  const r = await db.query<{ id: string }>(
    "INSERT INTO challenges (school_id, name, starts_on, ends_on, prizes) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [schoolId, name, startsOn, endsOn, JSON.stringify(prizes)],
  );
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId,
    action: "challenge.created",
    targetKind: "challenge",
    targetId: r.rows[0]!.id,
  });
  return { id: r.rows[0]!.id };
}

export async function archiveChallenge(db: Db, actor: Actor, schoolId: string, id: string) {
  assertSchoolAdmin(actor, schoolId);
  const r = await db.query(
    "UPDATE challenges SET archived_at = now() WHERE id = $1 AND school_id = $2",
    [id, schoolId],
  );
  if (r.rowCount === 0) throw new ServiceError(404, "not-found", "Challenge not found.");
  await audit(db, {
    actorKind: "staff",
    actorId: actor.id,
    schoolId,
    action: "challenge.archived",
    targetKind: "challenge",
    targetId: id,
  });
}

export async function listChallenges(db: Db, schoolId: string) {
  const r = await db.query(
    "SELECT id, name, starts_on::text AS starts_on, ends_on::text AS ends_on, prizes FROM challenges WHERE school_id = $1 AND archived_at IS NULL ORDER BY starts_on DESC",
    [schoolId],
  );
  return r.rows;
}
