// @vitest-environment node
import { describe, expect, it } from "vitest";
import { makeSchool, makeStudent, testDb } from "./helpers";
import { createClass, updateSchoolSettings } from "@/lib/server/services/schools";
import { createInvite, acceptInvite, loadActor } from "@/lib/server/services/staff";
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
} from "@/lib/server/services/students";
import { generateStudentId, normalizeStudentId } from "@/lib/server/auth/crypto";
import { createSession, resolveSession } from "@/lib/server/services/core";

describe("student IDs", () => {
  it("are random, well-formed, and normalise forgiving input", () => {
    const ids = new Set(Array.from({ length: 500 }, generateStudentId));
    expect(ids.size).toBe(500);
    for (const id of ids)
      expect(id).toMatch(/^GH-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
    const one = [...ids][0]!;
    expect(normalizeStudentId(one.toLowerCase().replace(/-/g, " "))).toBe(one);
    expect(normalizeStudentId(one.replace("GH-", ""))).toBe(one);
    expect(normalizeStudentId("GH-1234")).toBeNull();
    expect(normalizeStudentId("GH-0000-IIII-OOOO")).toBeNull();
  });
});

describe("registration", () => {
  it("registers with a school code, assigns school and class, and stores only a hash of the ID", async () => {
    const db = await testDb();
    const { school, classId } = await makeSchool(db);
    const r = await registerStudent(db, {
      joinCode: school.join_code,
      name: "  Layla   Haddad ",
      classId,
      age: 7,
      language: "ar",
    });
    expect(r.studentId).toMatch(/^GH-/);
    expect(r.status).toBe("active");
    const row = (
      await db.query<Record<string, unknown>>("SELECT * FROM students WHERE school_id=$1", [
        school.id,
      ])
    ).rows[0]!;
    expect(row.class_id).toBe(classId);
    expect(row.display_name).toBe("Layla Haddad");
    expect(JSON.stringify(row)).not.toContain(r.studentId);
    expect(row.id_hint).toBe(r.studentId.slice(-4));
    expect(row.pin_hash).toBeNull();
  });

  it("creates many students with unique IDs", async () => {
    const db = await testDb();
    const { school } = await makeSchool(db);
    const ids = new Set<string>();
    for (let i = 0; i < 25; i++)
      ids.add(
        (
          await registerStudent(db, {
            joinCode: school.join_code,
            name: `Kid Number${i}`,
            age: 9,
            language: "en",
          })
        ).studentId,
      );
    expect(ids.size).toBe(25);
  });

  it("rejects wrong codes, bad ages, languages, names and foreign classes", async () => {
    const db = await testDb();
    const a = await makeSchool(db);
    const b = await makeSchool(db);
    const ok = { joinCode: a.school.join_code, name: "Sami Khoury", age: 9, language: "fr" };
    await expect(registerStudent(db, { ...ok, joinCode: "AAAA-AAAA" })).rejects.toMatchObject({
      code: "bad-code",
    });
    await expect(registerStudent(db, { ...ok, joinCode: "nonsense" })).rejects.toMatchObject({
      code: "bad-code",
    });
    await expect(registerStudent(db, { ...ok, age: 2 })).rejects.toMatchObject({ code: "invalid" });
    await expect(registerStudent(db, { ...ok, age: 40 })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(registerStudent(db, { ...ok, age: "abc" })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(registerStudent(db, { ...ok, language: "de" })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(registerStudent(db, { ...ok, name: "" })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(registerStudent(db, { ...ok, name: "x".repeat(200) })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(registerStudent(db, { ...ok, classId: b.classId })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(registerStudent(db, { ...ok, pin: "12" })).rejects.toMatchObject({
      code: "invalid-pin",
    });
  });

  it("blocks likely duplicates but allows the same name in another class or when staff confirm", async () => {
    const db = await testDb();
    const { school, admin, classId } = await makeSchool(db);
    const other = (await createClass(db, admin, school.id, { name: "3B", grade: "Grade 3" })) as {
      id: string;
    };
    const base = { joinCode: school.join_code, name: "Nour Saad", classId, age: 8, language: "ar" };
    await registerStudent(db, base);
    await expect(registerStudent(db, { ...base, name: "nour  SAAD" })).rejects.toMatchObject({
      status: 409,
      code: "possible-duplicate",
    });
    await expect(registerStudent(db, { ...base, classId: other.id })).resolves.toBeTruthy();
    await expect(
      createStudentByStaff(db, admin, { name: "Nour Saad", classId, age: 8, language: "ar" }),
    ).rejects.toMatchObject({ code: "possible-duplicate" });
    await expect(
      createStudentByStaff(db, admin, {
        name: "Nour Saad",
        classId,
        age: 8,
        language: "ar",
        force: true,
      }),
    ).resolves.toBeTruthy();
  });

  it("honours approval and PIN policies", async () => {
    const db = await testDb();
    const { school, admin, classId } = await makeSchool(db);
    await updateSchoolSettings(db, admin, school.id, {
      requireApproval: true,
      pinPolicy: "required",
    });
    const base = {
      joinCode: school.join_code,
      name: "Omar Aziz",
      classId,
      age: 10,
      language: "en",
    };
    await expect(registerStudent(db, base)).rejects.toMatchObject({ code: "pin-required" });
    const r = await registerStudent(db, { ...base, pin: "4321" });
    expect(r.status).toBe("pending");
    await expect(loginStudent(db, r.studentId, "4321")).rejects.toMatchObject({ code: "pending" });
    const pending = await listStudents(db, admin, { status: "pending" });
    expect(pending).toHaveLength(1);
    await approveStudent(db, admin, (pending[0] as { id: string }).id, true);
    await expect(loginStudent(db, r.studentId, "4321")).resolves.toBeTruthy();
  });
});

describe("login and recovery", () => {
  it("accepts the ID typed loosely, and gives one generic error for every failure", async () => {
    const db = await testDb();
    const { school } = await makeSchool(db);
    const s = await makeStudent(db, { joinCode: school.join_code, pin: "1111" });
    const loose = s.studentId.toLowerCase().replace(/-/g, "");
    await expect(loginStudent(db, loose, "1111")).resolves.toEqual({ id: s.id });
    const unknown = await loginStudent(db, "GH-2222-3333-4444", "1111").catch((e) => e);
    const wrongPin = await loginStudent(db, s.studentId, "9999").catch((e) => e);
    const noPin = await loginStudent(db, s.studentId, undefined).catch((e) => e);
    expect(unknown.code).toBe("bad-login");
    expect(wrongPin.code).toBe("bad-login");
    expect(noPin.code).toBe("bad-login");
    expect(unknown.message).toBe(wrongPin.message);
  });

  it("locks the account after five wrong PINs, even for the right PIN", async () => {
    const db = await testDb();
    const { school } = await makeSchool(db);
    const s = await makeStudent(db, { joinCode: school.join_code, pin: "2468" });
    for (let i = 0; i < 5; i++)
      await expect(loginStudent(db, s.studentId, "0000")).rejects.toMatchObject({
        code: "bad-login",
      });
    await expect(loginStudent(db, s.studentId, "2468")).rejects.toMatchObject({ code: "locked" });
  });

  it("lets a verified teacher reissue access: the old ID dies, sessions end, and it is audited", async () => {
    const db = await testDb();
    const { school, admin, classId } = await makeSchool(db);
    const s = await makeStudent(db, { joinCode: school.join_code, classId, pin: "1357" });
    const token = await createSession(db, "student", s.id, 30);
    await expect(reissueAccess(db, admin, s.id, { identityVerified: false })).rejects.toMatchObject(
      { code: "verify-required" },
    );
    const fresh = await reissueAccess(db, admin, s.id, { identityVerified: true, newPin: "8642" });
    expect(fresh.studentId).not.toBe(s.studentId);
    await expect(loginStudent(db, s.studentId, "1357")).rejects.toMatchObject({
      code: "bad-login",
    });
    await expect(loginStudent(db, fresh.studentId, "1357")).rejects.toMatchObject({
      code: "bad-login",
    });
    await expect(loginStudent(db, fresh.studentId, "8642")).resolves.toEqual({ id: s.id });
    expect(await resolveSession(db, "student", token)).toBeNull();
    const ev = await db.query<{ detail: { identityVerified: boolean } }>(
      "SELECT detail FROM audit_events WHERE action = 'student.access_reissued'",
    );
    expect(ev.rows.at(-1)!.detail.identityVerified).toBe(true);
  });

  it("resets a forgotten PIN and clears a lockout", async () => {
    const db = await testDb();
    const { school, admin, classId } = await makeSchool(db);
    const s = await makeStudent(db, { joinCode: school.join_code, classId, pin: "1212" });
    for (let i = 0; i < 5; i++) await loginStudent(db, s.studentId, "0000").catch(() => undefined);
    await resetPin(db, admin, s.id, { identityVerified: true, newPin: "3434" });
    await expect(loginStudent(db, s.studentId, "3434")).resolves.toEqual({ id: s.id });
  });

  it("lets students manage their own PIN, nickname and privacy, but not remove a required PIN", async () => {
    const db = await testDb();
    const { school, admin } = await makeSchool(db);
    const s = await makeStudent(db, { joinCode: school.join_code });
    await updateStudentSelf(db, s.id, { newPin: "5555" });
    expect((await getStudentSelf(db, s.id))!.hasPin).toBe(true);
    await expect(
      updateStudentSelf(db, s.id, { newPin: "6666", currentPin: "0000" }),
    ).rejects.toMatchObject({ code: "bad-pin" });
    await updateStudentSelf(db, s.id, { newPin: "6666", currentPin: "5555" });
    await updateStudentSelf(db, s.id, { nickname: "Star", showOnLeaderboard: false });
    const me = (await getStudentSelf(db, s.id))!;
    expect(me.nickname).toBe("Star");
    expect(me.showOnLeaderboard).toBe(false);
    await updateSchoolSettings(db, admin, school.id, { pinPolicy: "required" });
    await expect(
      updateStudentSelf(db, s.id, { removePin: true, currentPin: "6666" }),
    ).rejects.toMatchObject({ code: "pin-required" });
  });

  it("does not log in disabled or archived students", async () => {
    const db = await testDb();
    const { school, admin, classId } = await makeSchool(db);
    const s = await makeStudent(db, { joinCode: school.join_code, classId });
    await setStudentStatus(db, admin, s.id, "disabled");
    await expect(loginStudent(db, s.studentId, undefined)).rejects.toMatchObject({
      code: "inactive",
    });
    expect(await getStudentSelf(db, s.id)).toBeNull();
    await setStudentStatus(db, admin, s.id, "active");
    await expect(loginStudent(db, s.studentId, undefined)).resolves.toBeTruthy();
  });
});

describe("school isolation and staff scope", () => {
  it("staff of one school cannot see or change another school's students", async () => {
    const db = await testDb();
    const a = await makeSchool(db);
    const b = await makeSchool(db);
    const sa = await makeStudent(db, { joinCode: a.school.join_code, classId: a.classId });
    await expect(visibleStudent(db, b.admin, sa.id)).rejects.toMatchObject({ status: 404 });
    await expect(setStudentStatus(db, b.admin, sa.id, "disabled")).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      reissueAccess(db, b.admin, sa.id, { identityVerified: true }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      updateStudentByStaff(db, b.admin, sa.id, { name: "Hacked" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      updateStudentByStaff(db, a.admin, sa.id, { classId: b.classId }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(
      (await listStudents(db, b.admin, {})).some((x) => (x as { id: string }).id === sa.id),
    ).toBe(false);
    await expect(
      updateSchoolSettings(db, b.admin, a.school.id, { name: "Mine now" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("platform admins manage schools but cannot read student records", async () => {
    const db = await testDb();
    const a = await makeSchool(db);
    const s = await makeStudent(db, { joinCode: a.school.join_code, classId: a.classId });
    await expect(visibleStudent(db, a.root, s.id)).rejects.toMatchObject({ status: 404 });
    await expect(listStudents(db, a.root, {})).rejects.toMatchObject({ status: 403 });
  });

  it("teachers only see and add students in their own classes", async () => {
    const db = await testDb();
    const { school, admin, classId } = await makeSchool(db);
    const other = (await createClass(db, admin, school.id, { name: "4C" })) as { id: string };
    const inv = await createInvite(db, admin, {
      email: "t1@example.org",
      name: "Teacher One",
      role: "teacher",
      classIds: [classId],
    });
    const teacher = (await loadActor(db, await acceptInvite(db, inv.token, "teacher-password-1")))!;
    const mine = await makeStudent(db, { joinCode: school.join_code, classId });
    const theirs = await makeStudent(db, { joinCode: school.join_code, classId: other.id });
    const seen = (await listStudents(db, teacher, {})).map((x) => (x as { id: string }).id);
    expect(seen).toContain(mine.id);
    expect(seen).not.toContain(theirs.id);
    await expect(visibleStudent(db, teacher, theirs.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      createStudentByStaff(db, teacher, {
        name: "New Kid",
        classId: other.id,
        age: 8,
        language: "en",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createStudentByStaff(db, teacher, { name: "New Kid", classId, age: 8, language: "en" }),
    ).resolves.toBeTruthy();
    await expect(updateSchoolSettings(db, teacher, school.id, { name: "x" })).rejects.toMatchObject(
      { status: 404 },
    );
  });
});
