import type { DocumentKind, StudyDocument } from "@/lib/validation/schemas";
import { MAX_DOCUMENT_CHARS } from "@/lib/validation/schemas";
import { countWords, newId, nowIso, truncate } from "@/lib/utils";
import { normalizeText, validateSourceQuality } from "@/lib/study/text";
import {
  DocumentProcessingError,
  extensionOf,
  titleFromFileName,
  validateFile,
  readBlobBuffer,
} from "./files";
import {
  extractDocx,
  extractPdf,
  extractPlainText,
  extractPptx,
  looksScanned,
  type ProgressFn,
} from "./extractors";
import { ocrImage, ocrPdf } from "./ocr";

export interface ProcessedDocument {
  title: string;
  kind: DocumentKind;
  text: string;
  pageCount?: number;
  extractionMethod: StudyDocument["extractionMethod"];
  status: StudyDocument["status"];
  warnings: string[];
  sourceName?: string;
  sourceUrl?: string;
  sizeBytes?: number;
}

export interface ProcessOptions {
  onProgress?: ProgressFn;
  /** Set only after the user agreed to let the OCR engine download language data. */
  ocr?: { language: string };
}

function finish(
  p: Omit<ProcessedDocument, "status"> & { status?: StudyDocument["status"] },
): ProcessedDocument {
  const warnings = [...p.warnings];
  let text = p.text;
  if (text.length > MAX_DOCUMENT_CHARS) {
    text = text.slice(0, MAX_DOCUMENT_CHARS);
    warnings.push(
      `The text was cut to the first ${MAX_DOCUMENT_CHARS.toLocaleString()} characters.`,
    );
  }

  // If a status was explicitly set upstream (e.g. "needs-ocr"), preserve it unchanged.
  if (p.status && p.status !== "ready") {
    return { ...p, text, warnings, status: p.status };
  }

  const hasText = text.trim().length > 0;
  if (!hasText) return { ...p, text, warnings, status: "empty" };

  // Run source quality validation before marking the document as study-ready.
  // This catches garbled PDFs, encoding corruption, and metadata-only content
  // before any heuristic or AI generator has a chance to produce nonsense.
  const quality = validateSourceQuality(text);
  if (!quality.ok) {
    return {
      ...p,
      text,
      warnings: [
        ...warnings,
        quality.reason ??
          "We couldn't extract readable text from this document. Try uploading a text-based PDF, another supported format, or a clearer scan.",
      ],
      status: "empty",
    };
  }

  return { ...p, text, warnings, status: "ready" };
}

/**
 * Extracts text from a user-selected file. Everything runs in the browser; nothing is uploaded.
 * The file is validated (type, size, signature) before it is parsed.
 */
export async function processFile(
  file: File,
  options: ProcessOptions = {},
): Promise<ProcessedDocument> {
  const kind = await validateFile(file);
  const buffer = await readBlobBuffer(file);
  const base = {
    title: titleFromFileName(file.name),
    sourceName: truncate(file.name, 300),
    sizeBytes: file.size,
  };
  options.onProgress?.({ stage: "Reading file" });

  switch (kind) {
    case "txt":
    case "md": {
      const r = extractPlainText(buffer);
      return finish({
        ...base,
        kind,
        text: r.text,
        extractionMethod: "text",
        warnings: r.warnings,
      });
    }
    case "docx": {
      const r = await extractDocx(buffer);
      return finish({
        ...base,
        kind,
        text: r.text,
        extractionMethod: "docx",
        warnings: r.warnings,
      });
    }
    case "pptx": {
      const r = await extractPptx(buffer, options.onProgress);
      return finish({
        ...base,
        kind,
        text: r.text,
        pageCount: r.pageCount,
        extractionMethod: "pptx",
        warnings: r.warnings,
      });
    }
    case "pdf": {
      const r = await extractPdf(buffer, options.onProgress);
      if (looksScanned(r.text, r.pageCount ?? 0)) {
        if (options.ocr) {
          const o = await ocrPdf(buffer, options.ocr.language, options.onProgress);
          return finish({
            ...base,
            kind,
            text: o.text,
            pageCount: o.pageCount ?? r.pageCount,
            extractionMethod: "ocr",
            warnings: [...r.warnings, ...o.warnings],
          });
        }
        return finish({
          ...base,
          kind,
          text: r.text,
          pageCount: r.pageCount,
          extractionMethod: "pdf-text",
          status: "needs-ocr",
          warnings: [
            ...r.warnings,
            "This PDF contains little or no selectable text. It is probably a scan. Use “Run OCR” to read it with the optional OCR engine.",
          ],
        });
      }
      return finish({
        ...base,
        kind,
        text: r.text,
        pageCount: r.pageCount,
        extractionMethod: "pdf-text",
        warnings: r.warnings,
      });
    }
    case "image": {
      if (!options.ocr) {
        throw new DocumentProcessingError(
          "Reading text from an image needs the optional OCR engine. Allow OCR and choose a language, then try again.",
          "needs-ocr",
        );
      }
      const o = await ocrImage(file, options.ocr.language, options.onProgress);
      return finish({ ...base, kind, text: o.text, extractionMethod: "ocr", warnings: o.warnings });
    }
  }
}

/** Re-runs OCR for a stored scanned document's original file. */
export async function runOcrOnFile(
  file: File,
  language: string,
  onProgress?: ProgressFn,
): Promise<ProcessedDocument> {
  return processFile(file, { onProgress, ocr: { language } });
}

export function processPastedText(title: string, text: string): ProcessedDocument {
  const clean = normalizeText(text);
  return finish({
    title: title.trim() || firstLineTitle(clean),
    kind: "paste",
    text: clean,
    extractionMethod: "paste",
    warnings: [],
  });
}

function firstLineTitle(text: string): string {
  const line =
    text
      .split("\n")
      .find((l) => l.trim())
      ?.replace(/^#+\s*/, "")
      .trim() ?? "";
  return truncate(line, 80) || "Pasted text";
}

export interface UrlImportResponse {
  kind: "url" | "youtube";
  title: string;
  text: string;
  finalUrl: string;
  captionLanguage?: string;
  autoGenerated?: boolean;
}

export class UrlImportError extends Error {}

/** Asks Ghadi's server to fetch a public web page or YouTube captions (SSRF-protected). */
export async function importFromUrl(url: string, signal?: AbortSignal): Promise<ProcessedDocument> {
  let res: Response;
  try {
    res = await fetch("/api/import/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
  } catch {
    throw new UrlImportError(
      "Could not reach Ghadi's server to fetch that address. URL import needs the Ghadi server to be running.",
    );
  }
  const body = (await res.json().catch(() => null)) as
    (UrlImportResponse & { error?: { message?: string } }) | null;
  if (!res.ok || !body || typeof body.text !== "string") {
    throw new UrlImportError(body?.error?.message ?? `The import failed (HTTP ${res.status}).`);
  }
  const warnings: string[] = [];
  if (body.kind === "youtube") {
    warnings.push(
      body.autoGenerated
        ? "These captions were generated automatically by YouTube and may contain errors."
        : "These are the video's published captions.",
    );
  }
  return finish({
    title: truncate(body.title, 200),
    kind: body.kind,
    text: normalizeText(body.text),
    extractionMethod: body.kind === "youtube" ? "transcript" : "html",
    warnings,
    sourceUrl: body.finalUrl,
  });
}

export function toStudyDocument(
  p: ProcessedDocument,
  extra: { collectionId?: string; id?: string; createdAt?: string } = {},
): StudyDocument {
  const now = nowIso();
  return {
    id: extra.id ?? newId(),
    title: truncate(p.title, 200) || "Untitled document",
    kind: p.kind,
    sourceName: p.sourceName,
    sourceUrl: p.sourceUrl,
    sizeBytes: p.sizeBytes,
    text: p.text,
    wordCount: countWords(p.text),
    pageCount: p.pageCount,
    extractionMethod: p.extractionMethod,
    status: p.status,
    warnings: p.warnings.slice(0, 20),
    tags: [],
    collectionId: extra.collectionId,
    createdAt: extra.createdAt ?? now,
    updatedAt: now,
  };
}

export { extensionOf };
