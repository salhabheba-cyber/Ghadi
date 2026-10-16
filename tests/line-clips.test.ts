import { beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db";
import { PHRASES } from "@/lib/teaching/phrases";
import { collectFixedLines, lineKey, normalizeLine } from "@/lib/teaching/line-clips";
import { ensureSeed } from "./helpers";

describe("lip-synced line clips", () => {
  it("keys depend on the exact words and the language, but not on whitespace", () => {
    expect(lineKey("en", "Hello  there")).toBe(lineKey("en", " Hello there "));
    expect(lineKey("en", "Hello there")).not.toBe(lineKey("en", "Hello there!"));
    expect(lineKey("en", "Hello")).not.toBe(lineKey("fr", "Hello"));
    expect(lineKey("en", "Hello")).toMatch(/^[0-9a-f]{14}$/);
    expect(normalizeLine("a\n b")).toBe("a b");
  });
  it("lists only fixed sentences: no child names, no scores", async () => {
    await ensureSeed();
    const rows = (await getPool().query(
      `SELECT v.language, v.content, coalesce(json_agg(a.spec ORDER BY a.position) FILTER (WHERE a.id IS NOT NULL),'[]') acts FROM lesson_versions v LEFT JOIN activities a ON a.lesson_version_id=v.id WHERE v.status='approved' AND v.language='en' GROUP BY v.id`)).rows;
    const lines = collectFixedLines(rows.map((r) => ({ language: r.language, content: r.content, activities: r.acts })), "en");
    expect(lines.length).toBeGreaterThan(20);
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
    for (const c of PHRASES.en.correct) expect(lines.some((l) => l.text === c)).toBe(true);
    expect(lines.some((l) => l.text === PHRASES.en.goodbye)).toBe(true);
    expect(lines.some((l) => /Hello Lina|You answered \d/.test(l.text))).toBe(false);
  });
});
