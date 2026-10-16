import { getPool } from "@/lib/db";
import { isUuid } from "@/lib/repo/util";
import { AGE_RANGE, LessonContent, type AgeBand, type Locale } from "@/lib/schemas";

export interface LessonSummary {
  lessonId: string;
  versionId: string;
  slug: string;
  title: string;
  language: Locale;
  ageMin: number;
  ageMax: number;
  version: number;
  unitTitle: string;
  bookTitle: string;
  curriculumName: string;
  region: string;
  domains: string[];
  objectives: { code: string; description: string }[];
  licenseId: string;
  licenseName: string;
  sourceTitle: string;
  jurisdiction: string;
  alignmentNote: string;
  activityCount: number;
}

export interface LessonFilter {
  q?: string;
  domain?: string;
}

const BASE = `
  SELECT DISTINCT ON (l.id)
    l.id AS lesson_id, v.id AS version_id, l.slug, v.title, v.language, v.age_min, v.age_max, v.version,
    u.title AS unit_title, b.title AS book_title, c.name AS curriculum_name, c.region, c.alignment_note,
    lic.id AS license_id, lic.name AS license_name, s.title AS source_title, s.jurisdiction,
    COALESCE((SELECT json_agg(json_build_object('code', o.code, 'description', o.description) ORDER BY o.code)
              FROM learning_objectives o WHERE o.lesson_version_id = v.id), '[]') AS objectives,
    COALESCE((SELECT array_agg(DISTINCT sk.domain) FROM learning_objectives o JOIN skills sk ON sk.id = o.skill_id
              WHERE o.lesson_version_id = v.id), '{}') AS domains,
    (SELECT count(*)::int FROM activities a WHERE a.lesson_version_id = v.id) AS activity_count
  FROM lessons l
  JOIN lesson_versions v ON v.lesson_id = l.id AND v.status = 'approved'
  JOIN units u ON u.id = l.unit_id
  JOIN books b ON b.id = u.book_id
  JOIN curricula c ON c.id = b.curriculum_id AND c.status = 'published'
  JOIN licenses lic ON lic.id = v.license_id
  JOIN content_sources s ON s.id = v.source_id
  WHERE v.language = $1 AND v.age_min <= $3 AND v.age_max >= $2`;

interface Row {
  lesson_id: string; version_id: string; slug: string; title: string; language: Locale; age_min: number; age_max: number; version: number;
  unit_title: string; book_title: string; curriculum_name: string; region: string; alignment_note: string; license_id: string;
  license_name: string; source_title: string; jurisdiction: string; objectives: { code: string; description: string }[];
  domains: string[]; activity_count: number;
}
const toSummary = (r: Row): LessonSummary => ({
  lessonId: r.lesson_id, versionId: r.version_id, slug: r.slug, title: r.title, language: r.language, ageMin: r.age_min, ageMax: r.age_max,
  version: r.version, unitTitle: r.unit_title, bookTitle: r.book_title, curriculumName: r.curriculum_name, region: r.region,
  domains: r.domains, objectives: r.objectives, licenseId: r.license_id, licenseName: r.license_name, sourceTitle: r.source_title,
  jurisdiction: r.jurisdiction, alignmentNote: r.alignment_note, activityCount: r.activity_count,
});

/** Only APPROVED, published content in the child's lesson language and age band is ever returned. */
export async function listLessonsForChild(child: { lessonLanguage: Locale; ageBand: AgeBand }, f: LessonFilter = {}): Promise<LessonSummary[]> {
  const [min, max] = AGE_RANGE[child.ageBand];
  const r = await getPool().query<Row>(`${BASE} ORDER BY l.id, v.version DESC`, [child.lessonLanguage, min, max]);
  let rows = r.rows.map(toSummary);
  if (f.q?.trim()) {
    const q = f.q.trim().toLowerCase();
    rows = rows.filter((l) => l.title.toLowerCase().includes(q) || l.objectives.some((o) => o.description.toLowerCase().includes(q)));
  }
  if (f.domain) rows = rows.filter((l) => l.domains.includes(f.domain!));
  return rows.sort((a, b) => a.unitTitle.localeCompare(b.unitTitle) || a.title.localeCompare(b.title));
}

export async function getLessonForChild(child: { lessonLanguage: Locale; ageBand: AgeBand }, lessonId: string): Promise<LessonSummary | null> {
  if (!isUuid(lessonId)) return null;
  const all = await listLessonsForChild(child);
  return all.find((l) => l.lessonId === lessonId) ?? null;
}

export async function listDomains(child: { lessonLanguage: Locale; ageBand: AgeBand }): Promise<string[]> {
  const all = await listLessonsForChild(child);
  return [...new Set(all.flatMap((l) => l.domains))].sort();
}

export async function getLessonContent(versionId: string) {
  const r = await getPool().query<{ content: unknown }>("SELECT content FROM lesson_versions WHERE id=$1 AND status='approved'", [versionId]);
  if (!r.rows[0]) return null;
  return LessonContent.parse(r.rows[0].content);
}
