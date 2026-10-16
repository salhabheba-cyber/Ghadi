import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface OcrWord { text: string; conf: number }
export interface OcrResult { provider: string; text: string; words: OcrWord[]; meanConfidence: number | null }
export interface OcrProvider { readonly name: string; supports(lang: string): Promise<boolean>; recognize(bytes: Buffer, mime: string, lang: string): Promise<OcrResult> }

/** Words below this confidence are flagged for the parent to double-check. OCR is never treated as ground truth. */
export const UNCERTAIN_BELOW = 70;
const LANG: Record<string, string> = { en: "eng", fr: "fra", ar: "ara" };

/** Local Tesseract (no third-party service, nothing leaves the server). Needs `tesseract` (+ language packs) and `pdftoppm` for PDFs. */
const tesseract: OcrProvider = {
  name: "tesseract",
  async supports(lang) {
    try {
      const { stdout } = await run("tesseract", ["--list-langs"], { timeout: 10_000 });
      return stdout.split("\n").map((s) => s.trim()).includes(LANG[lang] ?? "");
    } catch { return false; }
  },
  async recognize(bytes, mime, lang) {
    const dir = await mkdtemp(path.join(tmpdir(), "ghadi-ocr-"));
    try {
      const images: string[] = [];
      if (mime === "application/pdf") {
        await writeFile(path.join(dir, "in.pdf"), bytes);
        // first 3 pages at 200 dpi; arguments are passed as an array (no shell)
        await run("pdftoppm", ["-r", "200", "-f", "1", "-l", "3", "-png", path.join(dir, "in.pdf"), path.join(dir, "page")], { timeout: 60_000 });
        for (const f of (await readdir(dir)).filter((f) => f.startsWith("page") && f.endsWith(".png")).sort()) images.push(path.join(dir, f));
      } else {
        const p = path.join(dir, mime === "image/png" ? "in.png" : "in.jpg");
        await writeFile(p, bytes);
        images.push(p);
      }
      if (images.length === 0) throw new Error("no_pages");
      const words: OcrWord[] = [];
      const lines: string[] = [];
      for (const img of images) {
        const { stdout } = await run("tesseract", [img, "stdout", "-l", LANG[lang] ?? "eng", "--psm", "6", "tsv"], { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
        let line = -1, cur: string[] = [];
        for (const row of stdout.split("\n").slice(1)) {
          const c = row.split("\t");
          if (c.length < 12 || c[0] !== "5") continue;
          const text = (c[11] ?? "").trim();
          const conf = parseFloat(c[10] ?? "-1");
          if (!text) continue;
          const key = Number(c[2]) * 1000 + Number(c[4]);
          if (key !== line && cur.length) { lines.push(cur.join(" ")); cur = []; }
          line = key; cur.push(text); words.push({ text, conf });
        }
        if (cur.length) lines.push(cur.join(" "));
      }
      const mean = words.length ? words.reduce((a, w) => a + Math.max(0, w.conf), 0) / words.length : null;
      return { provider: "tesseract", text: lines.join("\n"), words, meanConfidence: mean };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};

export function getOcrProvider(): OcrProvider | null {
  return process.env.OCR_PROVIDER === "tesseract" ? tesseract : null;
}
export const ocrAvailable = () => getOcrProvider() !== null;
