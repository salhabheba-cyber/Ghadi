import fs from "node:fs";
import { Pool } from "pg";
import { collectFixedLines, type LessonForLines } from "../src/lib/teaching/line-clips";

// Usage: pnpm lines:export   (needs DATABASE_URL)
// Writes docs/teacher-lines.json: every fixed sentence to render as a lip-synced clip, named <key>.mp4.
// Then reports which clips are still missing from public/teacher/lines/.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const rows = (await pool.query(
  `SELECT v.language, v.content, coalesce(json_agg(json_build_object('spec', a.spec) ORDER BY a.position) FILTER (WHERE a.id IS NOT NULL), '[]') AS acts
     FROM lesson_versions v LEFT JOIN activities a ON a.lesson_version_id = v.id
    WHERE v.status = 'approved' GROUP BY v.id`,
)).rows;
const lessons: LessonForLines[] = rows.map((r) => ({
  language: r.language, content: r.content,
  activities: (r.acts as { spec: { prompt: string; explanation: string; hints: string[] } }[]).map((a) => a.spec),
}));
const lines = ["en", "fr", "ar"].flatMap((lang) => {
  const ls = lessons.filter((l) => l.language === lang);
  return ls.length ? collectFixedLines(ls, lang as "en" | "fr" | "ar") : [];
});
fs.writeFileSync("docs/teacher-lines.json", JSON.stringify(lines, null, 2));
const have = new Set(fs.existsSync("public/teacher/lines") ? fs.readdirSync("public/teacher/lines").filter((f) => f.endsWith(".mp4")).map((f) => f.replace(/\.mp4$/, "")) : []);
fs.mkdirSync("public/teacher/lines", { recursive: true });
fs.writeFileSync("public/teacher/lines/manifest.json", JSON.stringify({ keys: [...have].sort() }));
const missing = lines.filter((l) => !have.has(l.key));
console.log(`${lines.length} fixed lines, ${lines.length - missing.length} clips present, ${missing.length} missing. List: docs/teacher-lines.json`);
await pool.end();
