export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export type AllowedMime = "image/png" | "image/jpeg" | "application/pdf";

/** The type is decided by the file's own bytes, never by the filename or the browser-declared type. */
export function sniffMime(b: Buffer): AllowedMime | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

/** Display-only name: strips paths and control characters; the stored file never uses this as a path. */
export function safeDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 100) || "file";
}

export type UploadRejection = "empty" | "too_large" | "unsupported_type";
export function validateUpload(bytes: Buffer): { ok: true; mime: AllowedMime } | { ok: false; reason: UploadRejection } {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };
  const mime = sniffMime(bytes);
  return mime ? { ok: true, mime } : { ok: false, reason: "unsupported_type" };
}
