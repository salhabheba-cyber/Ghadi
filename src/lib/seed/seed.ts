import type { Pool, PoolClient } from "pg";
import { ActivitySpec, LessonContent } from "@/lib/schemas";
import { SEED_LESSONS, SEED_SKILLS } from "@/lib/seed/data";
import { SEED_TEXTS } from "@/lib/seed/practice";

/** Idempotent: re-running only adds what's missing. Every record is validated with zod before insert. */
export async function seedCurriculum(pool: Pool): Promise<{ lessonsAdded: number }> {
  const client: PoolClient = await pool.connect();
  let lessonsAdded = 0;
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO licenses (id, name, notes) VALUES ('ghadi-original','Original GHADI sample content',
       'Authored for GHADI. Final license and ownership terms must be set by the content owner before public release.')
       ON CONFLICT (id) DO NOTHING`,
    );
    let sourceId = (await client.query("SELECT id FROM content_sources WHERE title = 'GHADI original pilot samples'")).rows[0]?.id as string | undefined;
    if (!sourceId) {
      sourceId = (await client.query(
        `INSERT INTO content_sources (title, author, license_id, jurisdiction, notes)
         VALUES ('GHADI original pilot samples','GHADI team (draft)','ghadi-original','international',
         'Original sample lessons; not from any textbook. Not reviewed by an education specialist.') RETURNING id`,
      )).rows[0].id as string;
    }
    for (const s of SEED_SKILLS) {
      await client.query("INSERT INTO skills (id, domain, name_en) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING", [s.id, s.domain, s.name_en]);
    }
    let curriculumId = (await client.query("SELECT id FROM curricula WHERE slug='ghadi-early-years-samples'")).rows[0]?.id as string | undefined;
    if (!curriculumId) {
      curriculumId = (await client.query(
        `INSERT INTO curricula (slug, name, region, language, source_id, status, alignment_note)
         VALUES ('ghadi-early-years-samples','GHADI Early Years — original samples','International','en',$1,'published',
         'Original sample lessons. NOT aligned to any national curriculum; alignment has not been reviewed.') RETURNING id`, [sourceId],
      )).rows[0].id as string;
    }
    let bookId = (await client.query("SELECT id FROM books WHERE curriculum_id=$1 AND slug='early-foundations-1'", [curriculumId])).rows[0]?.id as string | undefined;
    if (!bookId) {
      bookId = (await client.query(
        `INSERT INTO books (curriculum_id, slug, title, grade, subject, language, age_min, age_max)
         VALUES ($1,'early-foundations-1','Early Foundations 1','Pre-K (ages 3–5)','Foundations','en',3,5) RETURNING id`, [curriculumId],
      )).rows[0].id as string;
    }
    const unitIds: Record<number, string> = {};
    for (const [pos, title] of [[1, "Colours and shapes"], [2, "Numbers and sounds"]] as const) {
      let id = (await client.query("SELECT id FROM units WHERE book_id=$1 AND position=$2", [bookId, pos])).rows[0]?.id as string | undefined;
      if (!id) id = (await client.query("INSERT INTO units (book_id, title, position) VALUES ($1,$2,$3) RETURNING id", [bookId, title, pos])).rows[0].id as string;
      unitIds[pos] = id;
    }
    for (const l of SEED_LESSONS) {
      if ((await client.query("SELECT 1 FROM lessons WHERE slug=$1", [l.slug])).rowCount) continue;
      const content = LessonContent.parse(l.content);
      const lessonId = (await client.query("INSERT INTO lessons (unit_id, slug, position) VALUES ($1,$2,$3) RETURNING id", [unitIds[l.unit], l.slug, l.position])).rows[0].id as string;
      const approved = l.status === "approved";
      const versionId = (await client.query(
        `INSERT INTO lesson_versions (lesson_id, version, title, language, age_min, age_max, status, source_id, license_id, content, approved_by, approved_at)
         VALUES ($1,1,$2,$3,3,5,$4,$5,'ghadi-original',$6,$7,$8) RETURNING id`,
        [lessonId, l.title, l.language, l.status, sourceId, JSON.stringify(content), approved ? "seed-script (developer approval; editorial review pending)" : null, approved ? new Date() : null],
      )).rows[0].id as string;
      const objectiveIds: Record<string, string> = {};
      for (const o of l.objectives) {
        objectiveIds[o.code] = (await client.query(
          "INSERT INTO learning_objectives (lesson_version_id, code, description, skill_id) VALUES ($1,$2,$3,$4) RETURNING id",
          [versionId, o.code, o.description, o.skill],
        )).rows[0].id as string;
      }
      let pos = 0;
      for (const a of l.activities) {
        const spec = ActivitySpec.parse(a.spec);
        await client.query(
          "INSERT INTO activities (lesson_version_id, position, kind, objective_id, skill_id, spec) VALUES ($1,$2,$3,$4,$5,$6)",
          [versionId, pos++, spec.kind, objectiveIds[a.objective], a.skill, JSON.stringify(spec)],
        );
      }
      lessonsAdded++;
    }
    for (const t of SEED_TEXTS) {
      await client.query(
        `INSERT INTO practice_texts (slug, kind, language, title, body, status, source_id, license_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ghadi-original') ON CONFLICT (slug) DO NOTHING`,
        [t.slug, t.kind, t.language, t.title, t.body, t.status, sourceId],
      );
    }
    await client.query("COMMIT");
    return { lessonsAdded };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
