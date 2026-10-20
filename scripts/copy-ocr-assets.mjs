// Copies the OCR engine (worker, WebAssembly core) and English language data from node_modules into
// public/ocr so Ghadi can run OCR without contacting any CDN. Generated files are git-ignored.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "ocr");
const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`, { paths: [root] }));

const tesseract = pkgDir("tesseract.js");
const core = pkgDir("tesseract.js-core");
const eng = pkgDir("@tesseract.js-data/eng");

mkdirSync(path.join(out, "lang"), { recursive: true });

const files = [
  [path.join(tesseract, "dist", "worker.min.js"), "worker.min.js"],
  // LSTM-only cores (what Ghadi uses). The browser picks the best variant for the CPU.
  ...readdirSync(core)
    .filter((f) => /^tesseract-core(-relaxedsimd|-simd)?-lstm\.wasm\.js$/.test(f))
    .map((f) => [path.join(core, f), f]),
  [path.join(eng, "4.0.0_best_int", "eng.traineddata.gz"), path.join("lang", "eng.traineddata.gz")],
];

for (const [from, to] of files) {
  if (!existsSync(from)) throw new Error(`OCR asset missing: ${from}`);
  copyFileSync(from, path.join(out, to));
}
console.log(`Copied ${files.length} OCR files to public/ocr`);
