// @vitest-environment node
import { inflateSync } from "node:zlib";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildQuizDocx } from "@/lib/export/quiz-docx";
import { buildQuizPdf } from "@/lib/export/quiz-pdf";
import { buildQuizXlsx } from "@/lib/export/quiz-xlsx";
import {
  buildExportDoc,
  ExportError,
  type ExportContent,
  type ExportQuestion,
} from "@/lib/export/types";
import { POST } from "@/app/api/quiz/export/route";

const SECRET = "ZEBRAKEYSECRET";
const EXPL = "EXPLAINERSECRET";
const questions: ExportQuestion[] = [
  {
    type: "mcq",
    prompt: "Which pigment absorbs light in plants?",
    options: ["Keratin", SECRET, "Collagen", "Melanin"],
    correct: [SECRET],
    explanation: EXPL,
  },
  {
    type: "tf",
    prompt: "Water boils at 100C at sea level.",
    options: ["True", "False"],
    correct: ["True"],
    explanation: EXPL,
  },
  {
    type: "short",
    prompt: "Name the process plants use to make sugar.",
    correct: ["Photosynthesis"],
    explanation: EXPL,
  },
];

function doc(content: ExportContent, expl = true, language: "en" | "fr" | "ar" = "en") {
  return buildExportDoc({
    title: "Biology Quiz",
    questions,
    content,
    includeExplanations: expl,
    studentFields: true,
    studentName: "Sam",
    date: "21/10/2026",
    language,
    generatedAt: "2026-10-21T10:00:00Z",
  });
}

async function allText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  let out = Object.keys(zip.files).join("\n");
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name]!;
    if (!f.dir) out += "\n" + (await f.async("string"));
  }
  return out;
}
const hex = (s: string) => Buffer.from(s, "latin1").toString("hex").toUpperCase();
/** Concatenates the raw file and every inflated stream so text inside page content can be searched. */
function pdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  let out = raw;
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try {
      out += "\n" + inflateSync(buf.subarray(start, end)).toString("latin1");
    } catch {
      /* not a flate stream */
    }
  }
  return out;
}
const pdfHas = (buf: Buffer, s: string) => {
  const t = pdfText(buf);
  return t.includes(s) || t.toUpperCase().includes(hex(s));
};

describe("export projection", () => {
  it("quiz-only has no key and no answers in the data it hands to builders", () => {
    const d = doc("quiz");
    expect(d.key).toBeNull();
    expect(JSON.stringify(d)).not.toContain(EXPL);
    expect(JSON.stringify(d)).not.toContain("Photosynthesis");
    expect(JSON.stringify(d)).not.toContain('"correct"');
  });
  it("key-only has no question sheet; key matches questions", () => {
    const d = doc("key");
    expect(d.items).toBeNull();
    expect(d.key?.[0]?.answer).toBe(`B. ${SECRET}`);
    expect(d.key?.[1]?.answer).toBe("A. True");
    expect(d.key?.[2]?.answer).toBe("Photosynthesis");
  });
  it("explanations are only included on request", () => {
    expect(doc("quiz-and-key", false).key?.every((k) => !k.explanation)).toBe(true);
    expect(doc("quiz-and-key", true).key?.every((k) => k.explanation === EXPL)).toBe(true);
  });
  it("rejects an empty quiz", () => {
    expect(() =>
      buildExportDoc({
        title: "x",
        questions: [],
        content: "quiz",
        includeExplanations: false,
        studentFields: false,
        language: "en",
        generatedAt: "2026-10-21T10:00:00Z",
      }),
    ).toThrow(ExportError);
  });
});

describe("DOCX", () => {
  it("quiz-only is a valid docx with real styles and no answers", async () => {
    const t = await allText(await buildQuizDocx(doc("quiz")));
    expect(t).toContain("word/document.xml");
    expect(t).toContain("Biology Quiz");
    expect(t).toContain("w:pStyle");
    expect(t).toContain("PAGE");
    expect(t).not.toContain(EXPL);
    expect(t).not.toContain("Answer Key");
    expect(t).not.toContain("Photosynthesis");
  });
  it("quiz+key puts the key after a page break", async () => {
    const t = await allText(await buildQuizDocx(doc("quiz-and-key")));
    expect(t).toContain("Answer Key");
    expect(t).toContain(EXPL);
    expect(t).toContain("w:pageBreakBefore");
  });
  it("key-only has no questions section", async () => {
    const t = await allText(await buildQuizDocx(doc("key")));
    expect(t).toContain("Answer Key");
    expect(t).not.toContain("Which pigment absorbs");
  });
});

describe("XLSX", () => {
  it("quiz-only has one sheet and no answers anywhere in the package", async () => {
    const buf = await buildQuizXlsx(doc("quiz"));
    const t = await allText(buf);
    expect(t).toContain("worksheets/sheet1.xml");
    expect(t).not.toContain("worksheets/sheet2.xml");
    expect(t).not.toContain("Answer Key");
    expect(t).not.toContain(EXPL);
    expect(t).not.toContain("Photosynthesis");
    expect(t).toContain("autoFilter");
    expect(t).toContain('state="frozen"');
    expect(t).toContain("wrapText");
  });
  it("quiz+key adds a separate Answer Key sheet", async () => {
    const t = await allText(await buildQuizXlsx(doc("quiz-and-key")));
    expect(t).toContain("worksheets/sheet2.xml");
    expect(t).toContain("Answer Key");
    expect(t).toContain(EXPL);
  });
});

describe("PDF", () => {
  it("is A4, paginated, and quiz-only leaks nothing", async () => {
    const buf = await buildQuizPdf(doc("quiz"));
    const pdf = await PDFDocument.load(buf);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(pdfHas(buf, "Which pigment")).toBe(true);
    expect(pdfHas(buf, "Photosynthesis")).toBe(false);
    expect(pdfHas(buf, EXPL)).toBe(false);
    expect(pdfHas(buf, "Answer Key")).toBe(false);
  });
  it("quiz+key starts the key on a new page", async () => {
    const buf = await buildQuizPdf(doc("quiz-and-key"));
    const pdf = await PDFDocument.load(buf);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(pdfHas(buf, "Answer Key")).toBe(true);
    expect(pdfHas(buf, "Photosynthesis")).toBe(true);
  });
  it("many questions paginate without error", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      ...questions[0]!,
      prompt: `Question ${i} ${"word ".repeat(30)}`,
    }));
    const d = buildExportDoc({
      title: "Big",
      questions: many,
      content: "quiz",
      includeExplanations: false,
      studentFields: false,
      language: "en",
      generatedAt: "2026-10-21T10:00:00Z",
    });
    const pdf = await PDFDocument.load(await buildQuizPdf(d));
    expect(pdf.getPageCount()).toBeGreaterThan(3);
  });
  it("refuses Arabic with an actionable error instead of a broken file", async () => {
    await expect(buildQuizPdf(doc("quiz", false, "ar"))).rejects.toThrow(/Word|Excel/);
  });
});

describe("POST /api/quiz/export", () => {
  const call = (body: unknown) =>
    POST(
      new Request("http://localhost/api/quiz/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const base = { title: "Bio", questions, includeExplanations: true };

  it.each([
    ["pdf", "application/pdf"],
    ["docx", "wordprocessingml"],
    ["xlsx", "spreadsheetml"],
  ] as const)("%s download", async (format, mime) => {
    const res = await call({ ...base, format, content: "quiz" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(mime);
    expect(res.headers.get("content-disposition")).toContain(`.${format}`);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(500);
    if (format === "pdf") expect(pdfHas(buf, EXPL)).toBe(false);
    else expect(await allText(buf)).not.toContain(EXPL);
  });
  it("Arabic PDF returns 422 JSON, not a file", async () => {
    const res = await call({
      ...base,
      format: "pdf",
      content: "quiz",
      language: "Modern Standard Arabic",
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/Word|Excel/);
  });
  it("rejects bad input", async () => {
    expect((await call({ ...base, format: "exe" })).status).toBe(400);
    expect((await call({ ...base, format: "pdf", questions: [] })).status).toBe(400);
  });
});
