import { describe, expect, it } from "vitest";
import {
  chapterText,
  percentForPages,
  percentOf,
  searchBook,
  validateBook,
  type Chapter,
} from "@/components/read/reader/model";

const chapters: Chapter[] = [
  { id: "a", title: "Début", blocks: [{ t: "p", x: "Le petit prince était très curieux." }] },
  {
    id: "b",
    title: "",
    blocks: [
      { t: "img", src: "/x.jpg" },
      { t: "p", x: "Éléphant dans un chapeau" },
    ],
  },
  { id: "c", title: "ج", blocks: [{ t: "p", x: "كَانَ الرَّجُلُ طَوِيلًا" }] },
];

describe("reading position maths", () => {
  it("reaches exactly 100% on the last picture-book page and never exceeds it", () => {
    expect(percentForPages(0, 10)).toBe(10);
    expect(percentForPages(9, 10)).toBe(100);
    expect(percentForPages(99, 10)).toBe(100);
    expect(percentForPages(-3, 10)).toBe(10);
    expect(percentForPages(0, 0)).toBe(0);
  });
  it("adds the scrolled fraction inside a chapter and clamps bad input", () => {
    expect(percentOf(0, 4, 0)).toBe(0);
    expect(percentOf(1, 4, 0.5)).toBe(37.5);
    expect(percentOf(3, 4, 1)).toBe(100);
    expect(percentOf(9, 4, 5)).toBe(100);
    expect(percentOf(-1, 4, -1)).toBe(0);
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe("in-book search", () => {
  it("ignores case and accents and reports the chapter", () => {
    const hits = searchBook(chapters, "elephant");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.chapter).toBe(1);
    expect(hits[0]!.snippet).toContain("Éléphant");
  });
  it("finds Arabic text regardless of diacritics", () => {
    expect(searchBook(chapters, "الرجل")).toEqual([expect.objectContaining({ chapter: 2 })]);
  });
  it("needs two characters, finds nothing for absent words, and caps the result list", () => {
    expect(searchBook(chapters, "a")).toEqual([]);
    expect(searchBook(chapters, "zzzz")).toEqual([]);
    const many: Chapter[] = [{ id: "m", title: "", blocks: [{ t: "p", x: "ab ".repeat(200) }] }];
    expect(searchBook(many, "ab", 10)).toHaveLength(10);
  });
  it("skips image blocks when building chapter text", () => {
    expect(chapterText(chapters[1]!)).toBe("Éléphant dans un chapeau");
  });
});

describe("book file validation", () => {
  it("accepts a well-formed file and keeps the right-to-left direction", () => {
    const b = validateBook({ v: 1, lang: "ar", dir: "rtl", layout: "pages", chapters });
    expect(b.dir).toBe("rtl");
    expect(b.layout).toBe("pages");
    expect(b.lang).toBe("ar");
  });
  it("rejects damaged files instead of showing a blank book", () => {
    expect(() => validateBook(null)).toThrow("damaged");
    expect(() => validateBook({ chapters: [] })).toThrow("damaged");
    expect(() => validateBook({ chapters: [{ id: "x" }] })).toThrow("damaged");
    expect(() => validateBook("<html>")).toThrow("damaged");
  });
});
