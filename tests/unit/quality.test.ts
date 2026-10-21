import { describe, expect, it } from "vitest";
import { analyzeTextQuality, isUsableForGeneration, wordLike } from "@/lib/study/quality";

const OCR_GARBAGE = `BD 0
SAREE ESS CX CK < < ' <
KY, 34 Vk \\ Wx j vi > /, / / ¢ Sa X5 /
pe
AA - .
Vy. 2) What did the mouse and the rabbit promise Bird?
Bn R \\ 0 1 | ' A Be bod i | c
Sa K 1 | i {| 1 Wf
. L ! ; | | afl Uhl] 4 o | T Re | £ p
7 PV PI VEYA D0 [Sk W hh Fava FIR | \\§ C11 DCJ /
Q
5 0
EE ea a RRR
XL
FF
CAN
PK 3) What is the theme of the story? |
S$ —— j J 7 1
= vor ao : { - JEL | = | 4
> <> Ihe Theme of The Slory [9 (run trie 04S Ne 1p CUCL olhner
5%
J
\\ FFF`;

const CLEAN = `Photosynthesis is the process by which plants convert light energy into chemical energy.
Chlorophyll absorbs sunlight in the chloroplasts of leaf cells.
The Calvin cycle uses carbon dioxide and water to make glucose.`;

describe("wordLike", () => {
  it("accepts real words in several scripts and ignores numbers", () => {
    for (const w of ["photosynthesis", "Bird?", "l'énergie", "الخلية", "a"])
      expect(wordLike(w)).toBe(true);
    expect(wordLike("2024")).toBeNull();
    expect(wordLike("3.5%")).toBeNull();
  });
  it("rejects noise tokens", () => {
    for (const w of ["CX", "Vk", "X5", "04S", "<", "hhFava", "$"]) expect(wordLike(w)).toBe(false);
  });
});

describe("analyzeTextQuality", () => {
  it("marks the real OCR garbage from a worksheet photo as poor and blocks generation", () => {
    const q = analyzeTextQuality(OCR_GARBAGE);
    expect(q.level).toBe("poor");
    expect(isUsableForGeneration(q)).toBe(false);
    expect(q.noisyLines).toBeGreaterThan(10);
    expect(q.examples.length).toBeGreaterThan(0);
  });
  it("keeps the readable question lines when cleaning", () => {
    const q = analyzeTextQuality(OCR_GARBAGE);
    expect(q.cleaned).toContain("What did the mouse and the rabbit promise Bird?");
    expect(q.cleaned).not.toContain("SAREE ESS");
  });
  it("accepts clean prose", () => {
    const q = analyzeTextQuality(CLEAN);
    expect(q.level).toBe("good");
    expect(isUsableForGeneration(q)).toBe(true);
    expect(q.noisyLines).toBe(0);
  });
  it("treats a tiny or empty text as unusable", () => {
    expect(analyzeTextQuality("").level).toBe("poor");
    expect(analyzeTextQuality("hi there").level).toBe("poor");
  });
  it("does not penalise Arabic or French", () => {
    expect(
      analyzeTextQuality("الخلية هي الوحدة الأساسية للحياة في جميع الكائنات الحية").level,
    ).toBe("good");
    expect(
      analyzeTextQuality(
        "La photosynthèse transforme l'énergie lumineuse en énergie chimique dans les feuilles.",
      ).level,
    ).toBe("good");
  });
});
