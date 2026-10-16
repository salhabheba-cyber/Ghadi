import { describe, expect, it } from "vitest";
import { compareDictation } from "@/lib/practice/dictation";

const kinds = (a: string, b: string, l: "en" | "fr" | "ar" = "en") => compareDictation(a, b, l).items.map((i) => i.kind);

describe("dictation comparison", () => {
  it("perfect copy", () => {
    const r = compareDictation("The cat sat on a mat.", "The cat sat on a mat.");
    expect(r.accuracy).toBe(1);
    expect(r.items.every((i) => i.kind === "correct" && !i.capitalDiff && !i.punctDiff)).toBe(true);
  });
  it("separates spelling from capitals and punctuation", () => {
    const r = compareDictation("The cat sat.", "the cat sat");
    expect(r.accuracy).toBe(1);
    expect(r.capitalNotes).toBe(1);
    expect(r.punctuationNotes).toBe(1);
  });
  it("finds misspellings, missing and extra words", () => {
    expect(kinds("a red bird can fly", "a red brid can fly")).toEqual(["correct", "correct", "misspelled", "correct", "correct"]);
    expect(kinds("a red bird can fly", "a red bird fly")).toEqual(["correct", "correct", "correct", "missing", "correct"]);
    expect(kinds("a red bird", "a red little bird")).toEqual(["correct", "correct", "extra", "correct"]);
  });
  it("a completely different word is 'wrong', not a misspelling", () => {
    expect(kinds("I like milk", "I like bread")).toEqual(["correct", "correct", "wrong"]);
  });
  it("empty input: everything missing, accuracy 0, no crash", () => {
    const r = compareDictation("one two", "");
    expect(r.accuracy).toBe(0);
    expect(r.items.map((i) => i.kind)).toEqual(["missing", "missing"]);
    expect(compareDictation("", "").accuracy).toBe(0);
  });
  it("French accents are spelling (é ≠ e) but case is not", () => {
    expect(kinds("Le chat dort", "le chat dort", "fr")).toEqual(["correct", "correct", "correct"]);
    expect(kinds("été", "ete", "fr")).toEqual(["misspelled"]);
  });
  it("Arabic: diacritics and alef variants do not count as errors", () => {
    expect(kinds("القِطَّةُ تشرب الحليب", "القطة تشرب الحليب", "ar")).toEqual(["correct", "correct", "correct"]);
    expect(kinds("أنا", "انا", "ar")).toEqual(["correct"]);
  });
});
