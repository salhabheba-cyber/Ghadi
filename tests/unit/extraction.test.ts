// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { layoutPageText, type PdfTextItem } from "@/lib/document-processing/pdf-layout";
import { transcribeBatches, type PostImages } from "@/lib/document-processing/vision-extract";
import { htmlToStudyText } from "@/lib/document-processing/html-extract";
import { transcriptionToText, type Transcription } from "@/lib/ai/vision";

const item = (str: string, x: number, y: number, size = 12, width?: number): PdfTextItem => ({
  str,
  transform: [size, 0, 0, size, x, y],
  width: width ?? str.length * size * 0.5,
  height: size,
});

describe("PDF reading order (text layer)", () => {
  it("reads single-column lines top to bottom regardless of stream order", () => {
    const text = layoutPageText(
      [item("second line", 50, 680), item("first line", 50, 700), item("third line", 50, 660)],
      600,
    );
    expect(text).toBe("first line\nsecond line\nthird line");
  });

  it("keeps an exponent attached to its base instead of dropping it on its own line", () => {
    const text = layoutPageText(
      [item("Evaluate x", 50, 700), item("2", 111, 705, 8), item(" + 1", 116, 700)],
      600,
    );
    expect(text).toContain("x^2");
    expect(text.split("\n")).toHaveLength(1);
  });

  it("does not merge two columns into one line", () => {
    const items: PdfTextItem[] = [];
    for (let i = 0; i < 10; i++) {
      const y = 700 - i * 20;
      items.push(item(`Left question ${i + 1} text`, 50, y, 12, 170));
      items.push(item(`Right question ${i + 11} text`, 330, y, 12, 180));
    }
    const lines = layoutPageText(items, 600).split("\n").filter(Boolean);
    const firstRight = lines.findIndex((l) => l.startsWith("Right question 11"));
    const lastLeft = lines.findLastIndex((l) => l.startsWith("Left"));
    expect(lastLeft).toBeLessThan(firstRight);
    expect(lines.some((l) => /Left.*Right/.test(l))).toBe(false);
    expect(lines.filter((l) => l.startsWith("Left"))).toHaveLength(10);
  });

  it("separates paragraphs and rejoins hyphenated words", () => {
    const text = layoutPageText(
      [item("photo-", 50, 700), item("synthesis is key", 50, 686), item("New paragraph", 50, 640)],
      600,
    );
    expect(text).toBe(
      "photosynthesis is key\n\nNew paragraph".replace(
        "photosynthesis is key",
        "photosynthesis is key",
      ),
    );
  });
});

describe("DOCX/HTML structure", () => {
  it("keeps superscripts, subscripts, tables and numbered lists", () => {
    const text = htmlToStudyText(
      "<h1>Chem</h1><p>Water is H<sub>2</sub>O and area is r<sup>2</sup>.</p>" +
        "<ol><li>First step</li><li>Second step</li></ol>" +
        "<table><tr><td>Stage</td><td>Where</td></tr><tr><td>Light</td><td>Thylakoid</td></tr></table>",
    );
    expect(text).toContain("H_2O");
    expect(text).toContain("r^2");
    expect(text).toMatch(/1\.\s*First step/);
    expect(text).toMatch(/2\.\s*Second step/);
    expect(text).toMatch(/Stage\s*\|\s*Where/);
    expect(text).toMatch(/Light\s*\|\s*Thylakoid/);
  });
});

const transcription = (pages: number[], extra: Partial<Transcription["pages"][number]> = {}) =>
  ({
    pages: pages.map((page) => ({
      page,
      unreadable: false,
      blocks: [
        { kind: "question", number: "1", text: "Simplify 3/4 + 2/3.", uncertain: false },
        { kind: "question", number: "2", text: "Solve x^2 − 9 = 0.", uncertain: false },
      ],
      ...extra,
    })),
    issues: [],
  }) as Transcription;

describe("vision transcription batches", () => {
  it("sends at most four pages per request, keeps page numbers and order, and loses nothing", async () => {
    const calls: number[][] = [];
    const post: PostImages = async (images) => {
      calls.push(images.map((i) => i.page));
      return { transcription: transcription(images.map((i) => i.page)) };
    };
    const images = Array.from({ length: 9 }, (_, i) => ({
      page: i + 1,
      dataUrl: "data:image/jpeg;base64,AAAA",
    }));
    const r = await transcribeBatches(images, post);
    expect(calls).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9]]);
    const markers = [...r.text.matchAll(/--- Page (\d+) ---/g)].map((m) => Number(m[1]));
    expect(markers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.text).toContain("1. Simplify 3/4 + 2/3.");
    expect(r.text).toContain("2. Solve x^2 − 9 = 0.");
    expect(r.pageCount).toBe(9);
    // Always tells the learner the text was machine-read.
    expect(r.warnings[0]).toMatch(/read from the image by OpenAI/);
  });

  it("reports unclear and unreadable parts instead of hiding them", async () => {
    const post: PostImages = async () => ({
      transcription: {
        pages: [
          {
            page: 1,
            unreadable: false,
            blocks: [{ kind: "question", number: "3", text: "Find [?] + 4", uncertain: true }],
          },
          { page: 2, unreadable: true, blocks: [] },
        ],
        issues: ["Page 2 is too blurry"],
      } as Transcription,
    });
    const r = await transcribeBatches(
      [
        { page: 1, dataUrl: "data:image/jpeg;base64,AAAA" },
        { page: 2, dataUrl: "data:image/jpeg;base64,AAAA" },
      ],
      post,
    );
    expect(r.text).toContain("Find [?] + 4 [unclear]");
    expect(r.text).toContain("[This page could not be read]");
    expect(r.warnings.join(" ")).toMatch(/1 of 1 parts as unclear/);
    expect(r.warnings.join(" ")).toMatch(/1 page\(s\) could not be read/);
    expect(r.warnings.join(" ")).toMatch(/too blurry/);
  });

  it("stops and surfaces the error when a batch fails; nothing partial is returned", async () => {
    const post = vi
      .fn<PostImages>()
      .mockResolvedValueOnce({ transcription: transcription([1, 2, 3, 4]) })
      .mockRejectedValueOnce(new Error("OpenAI rate limit"));
    const images = Array.from({ length: 6 }, (_, i) => ({
      page: i + 1,
      dataUrl: "data:image/jpeg;base64,AAAA",
    }));
    await expect(transcribeBatches(images, post)).rejects.toThrow(/rate limit/);
  });

  it("honours cancellation between batches", async () => {
    const ctrl = new AbortController();
    const post: PostImages = async (images) => {
      ctrl.abort();
      return { transcription: transcription(images.map((i) => i.page)) };
    };
    const images = Array.from({ length: 6 }, (_, i) => ({
      page: i + 1,
      dataUrl: "data:image/jpeg;base64,AAAA",
    }));
    await expect(transcribeBatches(images, post, { signal: ctrl.signal })).rejects.toThrow(
      /cancelled/,
    );
  });

  it("transcriptionToText labels figures and flags uncertain items", () => {
    const t = transcriptionToText({
      pages: [
        {
          page: 1,
          unreadable: false,
          blocks: [
            { kind: "heading", text: "Geometry", uncertain: false },
            { kind: "figure", text: "A right triangle labelled 3, 4, 5", uncertain: false },
          ],
        },
      ],
      issues: [],
    } as Transcription);
    expect(t).toBe("--- Page 1 ---\n## Geometry\n[Figure: A right triangle labelled 3, 4, 5]");
  });
});
