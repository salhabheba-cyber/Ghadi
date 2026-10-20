import { DocumentProcessingError } from "./files";
import { htmlToStudyText } from "./html-extract";
import { normalizeText } from "@/lib/study/text";

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  warnings: string[];
}

export type ProgressFn = (info: { stage: string; fraction?: number }) => void;

/* --------------------------------- Plain text --------------------------------- */

/** Decodes bytes as text, handling BOMs. Returns null if the data looks binary. */
export function decodeTextBytes(bytes: Uint8Array): { text: string; warning?: string } | null {
  let text: string;
  let warning: string | undefined;
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
  else if (bytes[0] === 0xfe && bytes[1] === 0xff)
    text = new TextDecoder("utf-16be").decode(bytes.subarray(2));
  else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("windows-1252").decode(bytes);
      warning =
        "This file is not valid UTF-8, so it was read as Windows-1252. Some characters may look wrong.";
    }
  }
  text = text.replace(/^﻿/, "");
  const sample = text.slice(0, 20_000);
  let control = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) control++;
  }
  if (sample.length > 0 && control / sample.length > 0.05) return null;
  return { text, warning };
}

export function extractPlainText(buffer: ArrayBuffer): ExtractionResult {
  const decoded = decodeTextBytes(new Uint8Array(buffer));
  if (!decoded) throw new DocumentProcessingError("This file does not contain readable text.");
  return { text: normalizeText(decoded.text), warnings: decoded.warning ? [decoded.warning] : [] };
}

/* ------------------------------------ PDF ------------------------------------ */

export const MAX_PDF_PAGES = 500;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }
  return pdfjs;
}

export async function extractPdf(
  buffer: ArrayBuffer,
  onProgress?: ProgressFn,
): Promise<ExtractionResult> {
  const pdfjs = await loadPdfjs();
  const warnings: string[] = [];
  // pdf.js 6 no longer uses eval/new Function for fonts, so no eval-related option is needed.
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), enableXfa: false });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => undefined);
    const name = (error as { name?: string }).name;
    if (name === "PasswordException") {
      throw new DocumentProcessingError(
        "This PDF is password protected. Remove the password and try again.",
      );
    }
    throw new DocumentProcessingError("This PDF could not be read. It may be damaged.");
  }

  const total = pdf.numPages;
  const pages = Math.min(total, MAX_PDF_PAGES);
  if (total > MAX_PDF_PAGES)
    warnings.push(`Only the first ${MAX_PDF_PAGES} of ${total} pages were read.`);

  const parts: string[] = [];
  try {
    for (let i = 1; i <= pages; i++) {
      onProgress?.({ stage: `Reading page ${i} of ${pages}`, fraction: i / pages });
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        if ("str" in item) {
          line += item.str;
          if (item.hasEOL) line += "\n";
        }
      }
      parts.push(line.trim());
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }

  const text = normalizeText(parts.join("\n\n"));
  return { text, pageCount: total, warnings };
}

/** True when a PDF produced almost no text per page, which usually means a scan. */
export function looksScanned(text: string, pageCount: number): boolean {
  return pageCount > 0 && text.replace(/\s/g, "").length / pageCount < 25;
}

/* ----------------------------------- DOCX ------------------------------------ */

export async function extractDocx(buffer: ArrayBuffer): Promise<ExtractionResult> {
  const mod = await import("mammoth/mammoth.browser");
  const mammoth = (mod as { default?: typeof mod.default }).default ?? mod.default;
  try {
    const result = await mammoth.convertToHtml(
      { arrayBuffer: buffer },
      // Skip embedding images: only text is needed.
      { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) },
    );
    const text = normalizeText(htmlToStudyText(result.value));
    const warnings = result.messages
      .filter((m) => m.type === "warning")
      .slice(0, 3)
      .map((m) => m.message);
    return { text, warnings };
  } catch {
    throw new DocumentProcessingError(
      "This Word document could not be read. It may be damaged or password protected.",
    );
  }
}

/* ----------------------------------- PPTX ------------------------------------ */

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
export const MAX_SLIDES = 500;
const MAX_XML_CHARS = 5_000_000;

export function slideTextFromXml(xml: string): string {
  if (xml.length > MAX_XML_CHARS) return "";
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return "";
  const paragraphs = Array.from(doc.getElementsByTagNameNS(A_NS, "p"));
  return paragraphs
    .map((p) =>
      Array.from(p.getElementsByTagNameNS(A_NS, "t"))
        .map((t) => t.textContent ?? "")
        .join(""),
    )
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

export async function extractPptx(
  buffer: ArrayBuffer,
  onProgress?: ProgressFn,
): Promise<ExtractionResult> {
  const { default: JSZip } = await import("jszip");
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocumentProcessingError(
      "This PowerPoint file could not be opened. It may be damaged or password protected.",
    );
  }
  const slideNames = Object.keys(zip.files)
    .map((name) => ({ name, n: /^ppt\/slides\/slide(\d+)\.xml$/.exec(name)?.[1] }))
    .filter((x): x is { name: string; n: string } => x.n !== undefined)
    .sort((a, b) => Number(a.n) - Number(b.n));
  if (slideNames.length === 0)
    throw new DocumentProcessingError("No slides were found in this PowerPoint file.");

  const warnings: string[] = [];
  if (slideNames.length > MAX_SLIDES)
    warnings.push(`Only the first ${MAX_SLIDES} of ${slideNames.length} slides were read.`);
  const slides = slideNames.slice(0, MAX_SLIDES);

  const parts: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i] as { name: string; n: string };
    onProgress?.({
      stage: `Reading slide ${i + 1} of ${slides.length}`,
      fraction: (i + 1) / slides.length,
    });
    const xml = await zip.file(slide.name)?.async("string");
    const body = xml ? slideTextFromXml(xml) : "";

    let notes = "";
    const relsXml = await zip.file(`ppt/slides/_rels/slide${slide.n}.xml.rels`)?.async("string");
    const notesTarget = relsXml
      ? /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(relsXml)?.[1]
      : undefined;
    if (notesTarget) {
      const notesXml = await zip.file(`ppt/notesSlides/${notesTarget}`)?.async("string");
      notes = notesXml ? slideTextFromXml(notesXml) : "";
    }
    const section = [`## Slide ${i + 1}`, body, notes ? `Speaker notes: ${notes}` : ""]
      .filter(Boolean)
      .join("\n");
    parts.push(section);
  }
  return { text: normalizeText(parts.join("\n\n")), pageCount: slides.length, warnings };
}
