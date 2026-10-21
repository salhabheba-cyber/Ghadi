import { DocumentProcessingError } from "./files";
import type { ExtractionResult, ProgressFn } from "./extractors";
import {
  MAX_VISION_DATA_URL_CHARS,
  MAX_VISION_IMAGES_PER_REQUEST,
  transcriptionSchema,
  transcriptionToText,
  transcriptionUncertainty,
  type Transcription,
} from "@/lib/ai/vision";
import { normalizeText } from "@/lib/study/text";

/**
 * Reads photos and scanned pages with OpenAI's vision model through Ghadi's server (/api/ai/vision).
 * Only called after the user chose "read with OpenAI" and agreed to send the image. Nothing here
 * decides what the content means: it only collects a faithful transcription, page by page.
 */

/** Pages read per scanned PDF. Longer documents are cut with an explicit warning, never silently. */
export const VISION_MAX_PDF_PAGES = 40;

export interface PageImage {
  page: number;
  dataUrl: string;
}

export type PostImages = (
  images: PageImage[],
  signal?: AbortSignal,
) => Promise<{ transcription: Transcription; model?: string }>;

/** Sends one batch to the server. Maps every failure to a message the learner can act on. */
export const postImages: PostImages = async (images, signal) => {
  let res: Response;
  try {
    res = await fetch("/api/ai/vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images, consent: true }),
      signal,
    });
  } catch {
    if (signal?.aborted) throw new DocumentProcessingError("Reading the images was cancelled.");
    throw new DocumentProcessingError(
      "Could not reach Ghadi's server to read the image. Check your connection and try again.",
    );
  }
  const body = (await res.json().catch(() => null)) as {
    transcription?: unknown;
    model?: string;
    error?: { message?: string };
  } | null;
  if (!res.ok || !body?.transcription) {
    throw new DocumentProcessingError(
      body?.error?.message ?? `OpenAI could not read the image (HTTP ${res.status}).`,
    );
  }
  const parsed = transcriptionSchema.safeParse(body.transcription);
  if (!parsed.success) {
    throw new DocumentProcessingError("OpenAI's reading of the image was not in a usable format.");
  }
  return { transcription: parsed.data, model: body.model };
};

/**
 * Transcribes page images in small batches, keeping page numbers and order, and merges the results.
 * Pure with respect to the browser (the network call is injected), so it is unit-tested directly.
 */
export async function transcribeBatches(
  images: PageImage[],
  post: PostImages,
  options: { onProgress?: ProgressFn; signal?: AbortSignal } = {},
): Promise<ExtractionResult & { uncertain: number; blocks: number }> {
  const pages: Transcription["pages"] = [];
  const issues: string[] = [];
  let uncertain = 0;
  let blocks = 0;
  for (let i = 0; i < images.length; i += MAX_VISION_IMAGES_PER_REQUEST) {
    if (options.signal?.aborted)
      throw new DocumentProcessingError("Reading the images was cancelled.");
    const batch = images.slice(i, i + MAX_VISION_IMAGES_PER_REQUEST);
    options.onProgress?.({
      stage: `OpenAI is reading page${batch.length > 1 ? "s" : ""} ${batch[0]!.page}${batch.length > 1 ? `–${batch.at(-1)!.page}` : ""} of ${images.at(-1)!.page}`,
      fraction: i / images.length,
    });
    const { transcription } = await post(batch, options.signal);
    pages.push(...transcription.pages);
    issues.push(...transcription.issues);
    const u = transcriptionUncertainty(transcription);
    uncertain += u.uncertain;
    blocks += u.blocks;
  }
  const merged: Transcription = {
    pages: pages.sort((a, b) => a.page - b.page),
    issues,
  } as Transcription;
  const text = normalizeText(transcriptionToText(merged));
  const warnings = [
    "Text was read from the image by OpenAI. It can still contain mistakes: compare it with your original before studying.",
  ];
  if (uncertain > 0)
    warnings.push(
      `OpenAI marked ${uncertain} of ${blocks} parts as unclear. They are labelled [unclear] in the text: correct them if you can.`,
    );
  const unreadablePages = pages.filter((p) => p.unreadable || p.blocks.length === 0).length;
  if (unreadablePages > 0)
    warnings.push(`${unreadablePages} page(s) could not be read. A clearer picture may help.`);
  for (const issue of Array.from(new Set(issues)).slice(0, 3)) warnings.push(issue);
  return {
    text,
    pageCount: images.length,
    warnings,
    uncertain,
    blocks,
  };
}

/* --------------------------- browser-only rendering --------------------------- */

const MAX_SIDE = 1800;

/** Draws a bitmap/canvas to a JPEG data URL under the server's size limit, shrinking until it fits. */
async function toJpegDataUrl(source: ImageBitmap | HTMLCanvasElement): Promise<string> {
  const w = source.width;
  const h = source.height;
  let scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  for (let attempt = 0; attempt < 5; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new DocumentProcessingError("This browser cannot prepare images for reading.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.88 - attempt * 0.08);
    canvas.width = 0;
    canvas.height = 0;
    if (url.length <= MAX_VISION_DATA_URL_CHARS) return url;
    scale *= 0.8;
  }
  throw new DocumentProcessingError("This image is too large to send. Use a smaller photo.");
}

export async function visionImage(
  file: Blob,
  options: { onProgress?: ProgressFn; signal?: AbortSignal; post?: PostImages } = {},
) {
  options.onProgress?.({ stage: "Preparing image" });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new DocumentProcessingError("This image could not be opened.");
  }
  const dataUrl = await toJpegDataUrl(bitmap);
  bitmap.close();
  return transcribeBatches([{ page: 1, dataUrl }], options.post ?? postImages, options);
}

export async function visionPdf(
  buffer: ArrayBuffer,
  options: { onProgress?: ProgressFn; signal?: AbortSignal; post?: PostImages } = {},
) {
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
    throw new DocumentProcessingError("This PDF could not be read. It may be damaged.");
  });
  const total = pdf.numPages;
  const pages = Math.min(total, VISION_MAX_PDF_PAGES);
  const images: PageImage[] = [];
  try {
    for (let n = 1; n <= pages; n++) {
      options.onProgress?.({ stage: `Preparing page ${n} of ${pages}`, fraction: (n - 1) / pages });
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(3, MAX_SIDE / Math.max(base.width, base.height)),
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      images.push({ page: n, dataUrl: await toJpegDataUrl(canvas) });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  const result = await transcribeBatches(images, options.post ?? postImages, options);
  if (total > pages) {
    result.warnings.unshift(`Only the first ${pages} of ${total} pages were read.`);
  }
  return { ...result, pageCount: total };
}
