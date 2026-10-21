import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANGS, dirOf, tr, type StrKey } from "@/lib/read/strings";
import { CATALOG as catalog } from "@/lib/books/catalog";

describe("interface text", () => {
  const source = readFileSync(path.join(process.cwd(), "src/lib/read/strings.ts"), "utf8");
  const keys = [...source.matchAll(/^ {2}([a-zA-Z0-9]+): \{/gm)].map((m) => m[1] as StrKey);

  it("has an entry for every key in English, French and Arabic", () => {
    expect(keys.length).toBeGreaterThan(150);
    for (const k of keys)
      for (const l of LANGS) expect(tr(l, k).trim().length, `${k}/${l}`).toBeGreaterThan(0);
  });
  it("uses Arabic script for Arabic text (no accidental English fallbacks)", () => {
    const latinOnly = keys.filter(
      (k) =>
        !/[؀-ۿ]/.test(tr("ar", k)) && !["appTagline"].includes(k) && tr("ar", k) === tr("en", k),
    );
    expect(latinOnly).toEqual([]);
  });
  it("lays Arabic out right-to-left and French and English left-to-right", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("fr")).toBe("ltr");
    expect(dirOf("en")).toBe("ltr");
  });
});

describe("book library data", () => {
  it("has every book's text file inside Ghadi", () => {
    const files = new Set(readdirSync(path.join(process.cwd(), "public/books")));
    const missing = catalog.filter((b) => !files.has(b.contentPath.replace("/books/", "")));
    expect(missing.map((b) => b.slug)).toEqual([]);
  });
  it("records source, license and attribution for every book", () => {
    for (const b of catalog) {
      expect(b.sourceUrl, b.slug).toMatch(/^https:\/\//);
      expect(b.licenseUrl, b.slug).toMatch(/^https:\/\//);
      expect(b.license.length, b.slug).toBeGreaterThan(1);
      expect(b.attribution.length, b.slug).toBeGreaterThan(5);
    }
  });
  it("covers all three languages and every age band it claims", () => {
    const langs = new Set(catalog.map((b) => b.language));
    expect([...langs].sort()).toEqual(["ar", "en", "fr"]);
    for (const b of catalog) {
      expect(b.ageMin).toBeLessThanOrEqual(b.ageMax);
      expect(b.ageMin).toBeGreaterThanOrEqual(3);
      expect(b.ageMax).toBeLessThanOrEqual(18);
    }
  });
  it("gives Arabic books a right-to-left text file", () => {
    for (const b of catalog.filter((x) => x.language === "ar").slice(0, 10)) {
      const f = JSON.parse(readFileSync(path.join(process.cwd(), "public", b.contentPath), "utf8"));
      expect(f.dir, b.slug).toBe("rtl");
    }
  });
});
