import { createPglite, prepareDb, type Db } from "@/lib/server/db/client";
import { createSchool } from "@/lib/server/services/schools";
import {
  loadActor,
  bootstrapPlatformAdmin,
  createInvite,
  acceptInvite,
  type Actor,
} from "@/lib/server/services/staff";
import { createClass } from "@/lib/server/services/schools";

let shared: Promise<Db> | null = null;
/** One in-process Postgres (PGlite) per test file: real SQL, real constraints, no mocks. */
export function testDb(): Promise<Db> {
  shared ??= createPglite().then(prepareDb);
  return shared;
}

export const SETUP_ENV = { GHADI_SETUP_TOKEN: "test-setup-token-123456" };

export async function platformAdmin(db: Db, email = "root@example.org"): Promise<Actor> {
  const id = await bootstrapPlatformAdmin(
    db,
    {
      setupToken: SETUP_ENV.GHADI_SETUP_TOKEN,
      email,
      name: "Root",
      password: "correct horse battery",
    },
    SETUP_ENV,
  ).catch(async () => {
    const r = await db.query<{ id: string }>(
      "SELECT id FROM staff WHERE role='platform_admin' LIMIT 1",
    );
    return r.rows[0]!.id;
  });
  return (await loadActor(db, id))!;
}

let n = 0;
export async function makeSchool(db: Db, name = `School ${++n}`) {
  const root = await platformAdmin(db);
  const school = await createSchool(db, root, name);
  const inv = await createInvite(db, root, {
    email: `admin${n}-${Math.random().toString(36).slice(2, 6)}@example.org`,
    name: "Head",
    role: "school_admin",
    schoolId: school.id,
  });
  const adminId = await acceptInvite(db, inv.token, "a-long-password-1");
  const admin = (await loadActor(db, adminId))!;
  const cls = (await createClass(db, admin, school.id, { name: "3A", grade: "Grade 3" })) as {
    id: string;
  };
  return { school, admin, classId: cls.id, root };
}

import { registerStudent, loginStudent } from "@/lib/server/services/students";
import { openBook, savePosition, startCheck, answerCheck } from "@/lib/server/services/reading";

let k = 0;
export async function makeStudent(
  db: Db,
  s: {
    joinCode: string;
    classId?: string;
    name?: string;
    age?: number;
    language?: string;
    pin?: string;
  },
) {
  k++;
  const name = s.name ?? `Student${k} Family${k}`;
  const r = await registerStudent(db, {
    joinCode: s.joinCode,
    name,
    classId: s.classId,
    age: s.age ?? 8,
    language: s.language ?? "en",
    pin: s.pin,
  });
  const { id } = await loginStudent(db, r.studentId, s.pin);
  return { id, studentId: r.studentId, name };
}

/** The honest path to a completion: open, read to the end, spend the time, pass the check. */
export async function finishBook(
  db: Db,
  studentId: string,
  slug: string,
): Promise<{ completed: boolean }> {
  const o = await openBook(db, studentId, slug);
  await savePosition(db, studentId, o.book.id, { locator: { chapter: 0 }, percent: 100 });
  await db.query(
    "UPDATE reading_progress SET active_seconds = 100000 WHERE student_id = $1 AND book_id = $2",
    [studentId, o.book.id],
  );
  const check = await startCheck(db, studentId, slug, { rand: () => 0.42 });
  const row = await db.query<{ questions: { answer: number }[] }>(
    "SELECT questions FROM completion_checks WHERE id = $1",
    [check.checkId],
  );
  const res = await answerCheck(
    db,
    studentId,
    check.checkId,
    row.rows[0]!.questions.map((q) => q.answer),
  );
  return { completed: res.completed };
}
