// @vitest-environment node
import { describe, expect, it } from "vitest";
import { testDb, makeSchool } from "./helpers";
import { CATALOG } from "@/lib/books/catalog";

describe("database", () => {
  it("migrates, seeds the catalogue and creates a school", async () => {
    const db = await testDb();
    const n = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM books");
    expect(n.rows[0]!.n).toBe(CATALOG.length);
    const { school } = await makeSchool(db);
    expect(school.join_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });
});
