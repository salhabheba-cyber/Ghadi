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

/**
 * Pre-processes an image blob to improve OCR accuracy on real-world photos.
 *
 * Pipeline (all canvas-based, runs in the browser, no new dependencies):
 *  1. Draw the image to a canvas at 2× scale — gives Tesseract more pixels to work with.
 *  2. Convert each pixel to greyscale using the standard luminance formula.
 *  3. Boost contrast by stretching the histogram: compute per-channel min/max, then remap.
 *
 * This significantly helps with photos of printed text taken at an angle or in uneven lighting.
 */
async function preprocessImageForOcr(blob: Blob): Promise<Blob> {
  // Decode the image
  const bitmap = await createImageBitmap(blob);

  const SCALE = 2;
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * SCALE;
  canvas.height = bitmap.height * SCALE;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return blob; // Fallback: return original if canvas context unavailable

  // Draw at 2× — bilinear interpolation helps with softly-focused originals
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Grab raw pixel data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  // --- Pass 1: convert to greyscale ---
  // Use standard luminance coefficients (ITU-R BT.601)
  for (let i = 0; i < data.length; i += 4) {
    const grey = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    data[i] = grey;
    data[i + 1] = grey;
    data[i + 2] = grey;
    // alpha (data[i+3]) stays unchanged
  }

  // --- Pass 2: auto-contrast (histogram stretch on the R channel, same for G/B after greyscale) ---
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range > 0 && range < 255) {
    // Only stretch when there's meaningful headroom — skip near-white-on-white
    const scale = 255 / range;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.round((data[i]! - min) * scale);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Export as PNG (lossless — important for OCR accuracy)
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => {
      canvas.width = 0; // Free GPU memory
      canvas.height = 0;
      resolve(b ?? blob); // Fallback to original if toBlob fails
    }, "image/png");
  });
}

export async function ocrImage(
  blob: Blob,
  language: string,
  onProgress?: ProgressFn,
): Promise<ExtractionResult> {
  onProgress?.({ stage: "Preparing image" });
  // Pre-process: scale up, greyscale, auto-contrast — improves results on real-world photos
  const processedBlob = await preprocessImageForOcr(blob).catch(() => blob);

  const worker = await createWorkerFor(language, onProgress);
  try {
    const { data } = await worker.recognize(processedBlob);
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
