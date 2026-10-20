import type { DocumentKind } from "@/lib/validation/schemas";
import { formatBytes } from "@/lib/utils";

export class DocumentProcessingError extends Error {
  constructor(
    message: string,
    readonly code?: "needs-ocr",
  ) {
    super(message);
    this.name = "DocumentProcessingError";
  }
}

const MB = 1024 * 1024;

export const FILE_LIMITS: Record<Exclude<DocumentKind, "paste" | "url" | "youtube">, number> = {
  txt: 5 * MB,
  md: 5 * MB,
  pdf: 50 * MB,
  docx: 25 * MB,
  pptx: 50 * MB,
  image: 15 * MB,
};

const EXTENSIONS: Record<string, keyof typeof FILE_LIMITS> = {
  txt: "txt",
  text: "txt",
  md: "md",
  markdown: "md",
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  bmp: "image",
  gif: "image",
};

export const SUPPORTED_FORMATS_LABEL =
  "PDF, DOCX, PPTX, TXT, Markdown, and images (PNG, JPG, WebP, BMP, GIF)";
export const FILE_INPUT_ACCEPT =
  ".pdf,.docx,.pptx,.txt,.text,.md,.markdown,.png,.jpg,.jpeg,.webp,.bmp,.gif";

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base || "Untitled document";
}

type Sniff = (bytes: Uint8Array) => boolean;
const startsWith = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

const MAGIC: Partial<Record<keyof typeof FILE_LIMITS, Sniff>> = {
  pdf: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  docx: (b) => startsWith(b, [0x50, 0x4b]), // PK zip container
  pptx: (b) => startsWith(b, [0x50, 0x4b]),
};

const IMAGE_SIGNATURES: number[][] = [
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF
  [0x42, 0x4d], // BMP
  [0x52, 0x49, 0x46, 0x46], // RIFF (WebP)
];

/**
 * Checks extension, size and file signature before any parsing. Throws DocumentProcessingError with a
 * message suitable for display. Returns the detected kind.
 */
export async function validateFile(
  file: Pick<File, "name" | "size" | "slice">,
): Promise<keyof typeof FILE_LIMITS> {
  const ext = extensionOf(file.name);
  const kind = EXTENSIONS[ext];
  if (!kind) {
    if (ext === "doc" || ext === "ppt" || ext === "xls" || ext === "xlsx") {
      throw new DocumentProcessingError(
        `“.${ext}” files are not supported. Save the file as ${ext.startsWith("d") ? ".docx" : ext.startsWith("p") ? ".pptx" : "a PDF or text file"} and try again.`,
      );
    }
    throw new DocumentProcessingError(
      `“${file.name}” is not a supported file type. Supported formats: ${SUPPORTED_FORMATS_LABEL}.`,
    );
  }
  if (file.size === 0) throw new DocumentProcessingError(`“${file.name}” is empty.`);
  const limit = FILE_LIMITS[kind];
  if (file.size > limit) {
    throw new DocumentProcessingError(
      `“${file.name}” is ${formatBytes(file.size)}, which is over the ${formatBytes(limit)} limit for this file type.`,
    );
  }
  const head = new Uint8Array(await readBlobBuffer(file.slice(0, 16)));
  const sniff = MAGIC[kind];
  if (sniff && !sniff(head)) {
    throw new DocumentProcessingError(
      `“${file.name}” does not look like a real .${ext} file (its contents do not match its extension).`,
    );
  }
  if (kind === "image" && !IMAGE_SIGNATURES.some((sig) => startsWith(head, sig))) {
    throw new DocumentProcessingError(`“${file.name}” does not look like a real image file.`);
  }
  return kind;
}

export const OCR_LANGUAGES: { code: string; label: string }[] = [
  { code: "eng", label: "English" },
  { code: "ara", label: "Arabic" },
  { code: "fra", label: "French" },
  { code: "spa", label: "Spanish" },
  { code: "deu", label: "German" },
];

/** Reads a Blob as an ArrayBuffer; falls back to FileReader where Blob#arrayBuffer is missing (older browsers, jsdom). */
export function readBlobBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsArrayBuffer(blob);
  });
}
