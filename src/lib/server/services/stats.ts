import type { Db } from "../db/client";
import { ServiceError } from "./core";
import type { Actor } from "./staff";
import { assertSchoolStaff } from "./schools";

export async function schoolStats(db: Db, actor: Actor, schoolId: string) {
  assertSchoolStaff(actor, schoolId);
  const classIds = actor.classIds; // teachers see only their classes
  const scope = `s.school_id = $1 AND ($2::uuid[] IS NULL OR s.class_id = ANY($2::uuid[]))`;
  const [students, comps, active, langs, top, perMonth] = await Promise.all([
    db.query<{ status: string; n: number }>(
      `SELECT s.status, count(*)::int AS n FROM students s WHERE ${scope} GROUP BY s.status`,
      [schoolId, classIds],
    ),
    db.query<{ total: number; month: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE co.completed_at >= date_trunc('month', now()))::int AS month
         FROM completions co JOIN students s ON s.id = co.student_id WHERE ${scope} AND co.voided_at IS NULL`,
      [schoolId, classIds],
    ),
    db.query<{ n: number }>(
      `SELECT count(DISTINCT p.student_id)::int AS n FROM reading_progress p JOIN students s ON s.id = p.student_id
        WHERE ${scope} AND p.last_read_at > now() - interval '30 days'`,
      [schoolId, classIds],
    ),
    db.query<{ language: string; n: number }>(
      `SELECT b.language, count(*)::int AS n FROM completions co JOIN books b ON b.id = co.book_id JOIN students s ON s.id = co.student_id
        WHERE ${scope} AND co.voided_at IS NULL GROUP BY b.language`,
      [schoolId, classIds],
    ),
    db.query<{ title: string; language: string; n: number }>(
      `SELECT b.title, b.language, count(*)::int AS n FROM completions co JOIN books b ON b.id = co.book_id JOIN students s ON s.id = co.student_id
        WHERE ${scope} AND co.voided_at IS NULL GROUP BY b.title, b.language ORDER BY n DESC, b.title LIMIT 5`,
      [schoolId, classIds],
    ),
    db.query<{ month: string; n: number }>(
      `SELECT to_char(date_trunc('month', co.completed_at), 'YYYY-MM') AS month, count(*)::int AS n
         FROM completions co JOIN students s ON s.id = co.student_id
        WHERE ${scope} AND co.voided_at IS NULL AND co.completed_at > now() - interval '6 months' GROUP BY 1 ORDER BY 1`,
      [schoolId, classIds],
    ),
  ]);
  const byStatus = Object.fromEntries(students.rows.map((r) => [r.status, r.n]));
  const activeStudents = byStatus.active ?? 0;
  return {
    students: {
      active: activeStudents,
      pending: byStatus.pending ?? 0,
      disabled: byStatus.disabled ?? 0,
      archived: byStatus.archived ?? 0,
    },
    booksCompleted: comps.rows[0]?.total ?? 0,
    booksCompletedThisMonth: comps.rows[0]?.month ?? 0,
    activeReadersLast30Days: active.rows[0]?.n ?? 0,
    averageBooksPerStudent: activeStudents
      ? Math.round(((comps.rows[0]?.total ?? 0) / activeStudents) * 10) / 10
      : 0,
    byLanguage: langs.rows,
    topBooks: top.rows,
    perMonth: perMonth.rows,
  };
}

/** Platform-wide numbers only: counts, never names or reading histories of children. */
export async function platformStats(db: Db, actor: Actor) {
  if (actor.role !== "platform_admin")
    throw new ServiceError(
      403,
      "forbidden",
      "Only the platform administrator can see platform statistics.",
    );
  const [schools, students, comps, books, staff, week, perSchool] = await Promise.all([
    db.query<{ n: number }>("SELECT count(*)::int AS n FROM schools WHERE archived_at IS NULL"),
    db.query<{ status: string; n: number }>(
      "SELECT status, count(*)::int AS n FROM students GROUP BY status",
    ),
    db.query<{ n: number }>("SELECT count(*)::int AS n FROM completions WHERE voided_at IS NULL"),
    db.query<{ language: string; n: number }>(
      "SELECT language, count(*)::int AS n FROM books WHERE status = 'published' GROUP BY language",
    ),
    db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM staff WHERE role <> 'platform_admin' AND disabled_at IS NULL",
    ),
    db.query<{ n: number }>(
      "SELECT count(DISTINCT student_id)::int AS n FROM reading_progress WHERE last_read_at > now() - interval '7 days'",
    ),
    db.query(
      `SELECT sc.id, sc.name, sc.slug, sc.join_code, sc.archived_at, sc.created_at,
              (SELECT count(*)::int FROM students s WHERE s.school_id = sc.id AND s.status = 'active') AS students,
              (SELECT count(*)::int FROM students s WHERE s.school_id = sc.id AND s.status = 'pending') AS pending,
              (SELECT count(*)::int FROM completions co JOIN students s ON s.id = co.student_id WHERE s.school_id = sc.id AND co.voided_at IS NULL) AS books_completed,
              (SELECT count(*)::int FROM staff st WHERE st.school_id = sc.id AND st.role = 'school_admin' AND st.disabled_at IS NULL) AS admins
         FROM schools sc ORDER BY sc.archived_at NULLS FIRST, sc.name`,
    ),
  ]);
  const st = Object.fromEntries(students.rows.map((r) => [r.status, r.n]));
  return {
    schools: schools.rows[0]?.n ?? 0,
    students: {
      active: st.active ?? 0,
      pending: st.pending ?? 0,
      disabled: st.disabled ?? 0,
      archived: st.archived ?? 0,
    },
    booksCompleted: comps.rows[0]?.n ?? 0,
    activeReadersLast7Days: week.rows[0]?.n ?? 0,
    staff: staff.rows[0]?.n ?? 0,
    catalog: books.rows,
    perSchool: perSchool.rows,
  };
}

export async function auditLog(db: Db, actor: Actor, schoolId: string | null, limit = 100) {
  const sid = actor.role === "platform_admin" ? schoolId : actor.schoolId;
  if (actor.role === "teacher")
    throw new ServiceError(403, "forbidden", "Only administrators can see the activity log.");
  const r = await db.query(
    `SELECT a.id, a.at, a.actor_kind, a.action, a.target_kind, a.detail, st.name AS actor_name, sc.name AS school_name
       FROM audit_events a LEFT JOIN staff st ON st.id = a.actor_id LEFT JOIN schools sc ON sc.id = a.school_id
      WHERE ($1::uuid IS NULL OR a.school_id = $1) ORDER BY a.id DESC LIMIT $2`,
    [sid, Math.min(limit, 300)],
  );
  return r.rows;
}
