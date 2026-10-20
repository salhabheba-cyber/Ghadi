import { describe, expect, it } from "vitest";
import { BackupError, parseBackup } from "@/lib/storage/backup";
import { csvCell, deckToCsv, safeFileName, toCsv } from "@/lib/export";
import { BACKUP_SCHEMA_VERSION } from "@/lib/validation/schemas";

const iso = "2026-06-01T10:00:00.000Z";
const emptyBackup = (extra: Record<string, unknown> = {}) => ({
  app: "ghadi",
  schemaVersion: BACKUP_SCHEMA_VERSION,
  exportedAt: iso,
  data: {
    documents: [],
    notes: [],
    quizzes: [],
    attempts: [],
    decks: [],
    cards: [],
    reviews: [],
    collections: [],
  },
  ...extra,
});

describe("backup files are untrusted input", () => {
  it("accepts a well-formed empty backup", () => {
    expect(parseBackup(JSON.stringify(emptyBackup())).data.documents).toEqual([]);
  });

  it("is not affected by prototype-pollution payloads", () => {
    const text = JSON.stringify(emptyBackup()).replace(
      '"app":"ghadi"',
      '"app":"ghadi","__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}}',
    );
    const parsed = parseBackup(text);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(parsed, "polluted")).toBe(false);
    expect(JSON.stringify(parsed)).not.toContain("polluted");
  });

  it("strips unknown fields instead of storing them", () => {
    const b = emptyBackup();
    (b.data.documents as unknown[]).push({
      id: "d1",
      title: "T",
      kind: "txt",
      text: "hello",
      wordCount: 1,
      extractionMethod: "text",
      status: "ready",
      warnings: [],
      tags: [],
      createdAt: iso,
      updatedAt: iso,
      injected: "<script>alert(1)</script>",
      __proto__: { x: 1 },
    });
    const doc = parseBackup(JSON.stringify(b)).data.documents[0] as Record<string, unknown>;
    expect(doc.injected).toBeUndefined();
    expect(doc.title).toBe("T");
  });

  it("rejects wrong types, missing markers, future versions and non-JSON with clear errors", () => {
    const cases: [string, RegExp][] = [
      ["not json", /not valid JSON/],
      ["[]", /not a Ghadi backup/],
      ["null", /not a Ghadi backup/],
      [JSON.stringify({ app: "other" }), /not a Ghadi backup/],
      [JSON.stringify(emptyBackup({ schemaVersion: "1" })), /schema version/],
      [JSON.stringify(emptyBackup({ schemaVersion: 0 })), /schema version/],
      [JSON.stringify(emptyBackup({ schemaVersion: 999 })), /newer version/],
      [JSON.stringify(emptyBackup({ data: "nope" })), /damaged or incompatible/],
      [JSON.stringify(emptyBackup({ exportedAt: "yesterday" })), /damaged or incompatible/],
    ];
    for (const [text, message] of cases) {
      expect(() => parseBackup(text), text.slice(0, 40)).toThrow(BackupError);
      expect(() => parseBackup(text)).toThrow(message);
    }
  });

  it("rejects records that break length and shape limits", () => {
    const b = emptyBackup();
    (b.data.documents as unknown[]).push({
      id: "x".repeat(500),
      title: "T",
      kind: "exe",
      text: "",
      wordCount: -1,
      extractionMethod: "text",
      status: "ready",
      warnings: [],
      tags: [],
      createdAt: iso,
      updatedAt: iso,
    });
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/damaged or incompatible/);
  });
});

describe("CSV export neutralises spreadsheet formula injection", () => {
  it("prefixes cells that a spreadsheet would execute", () => {
    for (const evil of [
      '=HYPERLINK("http://evil","x")',
      "+1+1",
      "-2+3",
      "@SUM(A1)",
      "\t=1",
      "\r=1",
    ]) {
      const cell = csvCell(evil);
      expect(cell.startsWith(`"'`), evil).toBe(true);
    }
  });
  it("escapes quotes and flattens line breaks", () => {
    expect(csvCell('say "hi"\nnow')).toBe('"say ""hi"" now"');
  });
  it("applies to every cell of a deck export", () => {
    const csv = deckToCsv([{ front: "=cmd|' /C calc'!A0", back: "ok", explanation: "+evil" }]);
    expect(csv).toContain(`"'=cmd`);
    expect(csv).toContain(`"'+evil"`);
    expect(toCsv([["a", "b"]])).toBe('"a","b"\r\n');
  });
});

describe("download file names", () => {
  it("cannot contain path separators or traversal", () => {
    for (const evil of ["../../etc/passwd", "..\\..\\windows\\system32", "a/b\\c", 'CON:*?"<>|']) {
      const name = safeFileName(evil, "md");
      expect(name, evil).not.toMatch(/[\\/:*?"<>|]/);
      expect(name).toMatch(/\.md$/);
      expect(name.startsWith(".")).toBe(false);
    }
  });
  it("never produces a hidden file or a Windows device name", () => {
    expect(safeFileName("../../etc/passwd", "md")).toBe("etcpasswd.md");
    expect(safeFileName(".bashrc", "md")).toBe("bashrc.md");
    expect(safeFileName("CON", "md")).toBe("ghadi.md");
    expect(safeFileName("lpt1", "csv")).toBe("ghadi.csv");
    expect(safeFileName("Photosynthesis — notes", "md")).toBe("Photosynthesis-notes.md");
  });
  it("falls back to a default and limits length", () => {
    expect(safeFileName("///", "csv")).toBe("ghadi.csv");
    expect(safeFileName("x".repeat(500), "md").length).toBeLessThanOrEqual(83);
  });
});
