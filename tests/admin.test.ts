import { beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db";
import { ForbiddenError, canTransition, listContent, staffRole, transitionContent } from "@/lib/repo/admin";
import { listLessonsForChild } from "@/lib/repo/curriculum";
import { ensureSeed, makeParent } from "./helpers";

async function withRole(role: string) {
  const u = await makeParent(role);
  await getPool().query(`UPDATE "user" SET role=$2 WHERE id=$1`, [u.id, role]);
  return u;
}
const firstText = async () => (await getPool().query<{ id: string }>(`SELECT id FROM practice_texts WHERE status='approved' LIMIT 1`)).rows[0]!.id;

describe("content administration", () => {
  beforeAll(ensureSeed);

  it("a parent has no staff role and cannot list or change content", async () => {
    const p = await makeParent("plain");
    expect(await staffRole(p.id)).toBeNull();
    await expect(listContent(p.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(transitionContent(p.id, "practice_text", await firstText(), "retired")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("workflow edges are enforced", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("in_review", "approved")).toBe(true);
    expect(canTransition("approved", "draft")).toBe(false);
  });

  it("an editor can send back but cannot approve or retire; an admin can, and it is audited", async () => {
    const ed = await withRole("content_editor"), ad = await withRole("admin");
    const id = await firstText();
    expect(await transitionContent(ed.id, "practice_text", id, "retired")).toBe("needs_admin");
    expect(await transitionContent(ed.id, "practice_text", id, "draft")).toBe("invalid_transition"); // approved -> draft not allowed
    expect(await transitionContent(ad.id, "practice_text", id, "retired")).toBe("ok");
    expect(await transitionContent(ed.id, "practice_text", id, "draft")).toBe("ok");
    expect(await transitionContent(ed.id, "practice_text", id, "in_review")).toBe("ok");
    expect(await transitionContent(ed.id, "practice_text", id, "approved")).toBe("needs_admin");
    expect(await transitionContent(ad.id, "practice_text", id, "approved")).toBe("ok");
    const a = await getPool().query(`SELECT count(*)::int AS n FROM audit_events WHERE action='content.transition' AND actor_id=$1`, [ad.id]);
    expect(a.rows[0].n).toBe(2);
    expect(await transitionContent(ad.id, "practice_text", "not-a-uuid", "retired")).toBe("not_found");
  });

  it("approving a lesson records who and when; retired lessons disappear from children", async () => {
    const ad = await withRole("admin");
    const row = (await getPool().query<{ id: string }>(`SELECT id FROM lesson_versions WHERE status='approved' LIMIT 1`)).rows[0]!;
    const before = (await listLessonsForChild({ lessonLanguage: "en", ageBand: "3-5" })).length;
    expect(await transitionContent(ad.id, "lesson", row.id, "retired")).toBe("ok");
    expect((await listLessonsForChild({ lessonLanguage: "en", ageBand: "3-5" })).length).toBe(before - 1);
    expect(await transitionContent(ad.id, "lesson", row.id, "draft")).toBe("ok");
    expect(await transitionContent(ad.id, "lesson", row.id, "in_review")).toBe("ok");
    expect(await transitionContent(ad.id, "lesson", row.id, "approved")).toBe("ok");
    const v = (await getPool().query(`SELECT approved_by, approved_at FROM lesson_versions WHERE id=$1`, [row.id])).rows[0];
    expect(v.approved_by).toBe(ad.id);
    expect(v.approved_at).not.toBeNull();
    expect((await listLessonsForChild({ lessonLanguage: "en", ageBand: "3-5" })).length).toBe(before);
  });
});
