import { DocumentProcessingError } from "./files";
import type { ExtractionResult, ProgressFn } from "./extractors";
import { normalizeText } from "@/lib/study/text";

/**
 * Optional OCR using the open-source Tesseract engine (tesseract.js, Apache-2.0).
 * English OCR is fully local (bundled engine + data). Other languages download their data file from a
 * CDN on first use, which the UI asks the user to approve first. The document is never uploaded.
 */

export const OCR_MAX_PDF_PAGES = 30;

/**
 * The OCR engine (worker + WebAssembly core) and English language data ship with Ghadi under /ocr
 * (copied from node_modules by scripts/copy-ocr-assets.mjs), so English OCR never contacts a CDN.
 * Other languages download their data file once from jsDelivr, and only after the user agrees.
 */
export const BUNDLED_OCR_LANGUAGES: readonly string[] = ["eng"];
export const isBundledOcrLanguage = (lang: string) => BUNDLED_OCR_LANGUAGES.includes(lang);

async function createWorkerFor(language: string, onProgress?: ProgressFn) {
  const { createWorker } = await import("tesseract.js");
  const abs = (p: string) => new URL(p, window.location.origin).href;
  try {
    return await createWorker(language, 1, {
      workerPath: abs("/ocr/worker.min.js"),
      corePath: abs("/ocr/"),
      // Same-origin worker script (not a blob), so worker-src 'self' is enough.
      workerBlobURL: false,
      ...(isBundledOcrLanguage(language) ? { langPath: abs("/ocr/lang") } : {}),
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text")
          onProgress?.({ stage: "Recognising text", fraction: m.progress });
        else onProgress?.({ stage: m.status.replace(/^\w/, (c) => c.toUpperCase()) });
      },
    });
  } catch {
    throw new DocumentProcessingError(
      isBundledOcrLanguage(language)
        ? "The OCR engine could not start. If you run Ghadi from source, run `npm run ocr:assets` once."
        : "The OCR engine could not start. This language needs a one-time data download, so check your internet connection and try again.",
    );
  }
}

export async function ocrImage(
  blob: Blob,
  language: string,
  onProgress?: ProgressFn,
): Promise<ExtractionResult> {
  const worker = await createWorkerFor(language, onProgress);
  try {
    const { data } = await worker.recognize(blob);
    const text = normalizeText(data.text);
    return {
      text,
      warnings: text
        ? [
            "Text was read with OCR and may contain mistakes. Check it before generating study material.",
          ]
        : [],
    };
  } finally {
    await worker.terminate();
  }
}

export async function ocrPdf(
  buffer: ArrayBuffer,
  language: string,
  onProgress?: ProgressFn,
): Promise<ExtractionResult> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), enableXfa: false });
  const pdf = await task.promise.catch(async () => {
    await task.destroy().catch(() => undefined);
    throw new DocumentProcessingError("This PDF could not be read for OCR. It may be damaged.");
  });
  const pages = Math.min(pdf.numPages, OCR_MAX_PDF_PAGES);
  const warnings = [
    "Text was read with OCR and may contain mistakes. Check it before generating study material.",
  ];
  if (pdf.numPages > pages)
    warnings.push(`OCR was limited to the first ${pages} of ${pdf.numPages} pages.`);

  const worker = await createWorkerFor(language, onProgress);
  const parts: string[] = [];
  try {
    for (let i = 1; i <= pages; i++) {
      onProgress?.({ stage: `Recognising page ${i} of ${pages}`, fraction: (i - 1) / pages });
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const { data } = await worker.recognize(canvas);
      parts.push(data.text.trim());
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await worker.terminate();
    await task.destroy();
  }
  return { text: normalizeText(parts.join("\n\n")), pageCount: pdf.numPages, warnings };
}
