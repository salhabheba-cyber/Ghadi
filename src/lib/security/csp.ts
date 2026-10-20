/**
 * Content-Security-Policy builder. Pure and unit-tested; the per-request nonce is created in
 * src/proxy.ts.
 *
 * - Scripts: same-origin files plus Next.js's own inline scripts, which carry the per-request nonce.
 *   There is NO 'unsafe-inline' and NO 'unsafe-eval' in production, and no third-party script host.
 *   'wasm-unsafe-eval' is required to run WebAssembly (PDF.js and the OCR engine); it does not allow JS eval.
 * - Styles: stylesheets are same-origin (nonce for framework styles). Inline style="" attributes
 *   (used for chart bar heights) are allowed via style-src-attr only; <style> elements are not.
 * - connect-src: this origin, localhost (the optional Ollama provider), and jsDelivr for OCR language
 *   DATA of languages other than English (data only; the user is asked first). English OCR is bundled.
 */
export function buildCsp(nonce: string, opts: { isDev?: boolean } = {}): string {
  const dev = opts.isDev === true;
  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-inline'" : ""}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "connect-src 'self' http://localhost:* http://127.0.0.1:* https://cdn.jsdelivr.net",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ];
  return directives.join("; ");
}

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
