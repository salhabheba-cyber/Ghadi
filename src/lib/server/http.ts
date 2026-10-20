import { NextResponse } from "next/server";

export function jsonError(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

export function jsonOk(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Reads a JSON body with a hard size cap. Returns null if the body is too large or not valid JSON. */
export async function readJsonLimited(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; message: string }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, message: "The request is too large." };
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, status: 413, message: "The request is too large." };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, message: "The request body is not valid JSON." };
  }
}

/**
 * Rejects cross-site browser requests to state-changing endpoints (CSRF defence in depth, on top of
 * requiring a JSON content type, which forces a CORS preflight for cross-origin callers).
 * Browsers always send Sec-Fetch-Site and Origin on cross-site POSTs; non-browser clients usually send neither.
 */
export function sameOriginOrNull(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** True when the request declares a JSON body. Plain forms (text/plain, urlencoded, multipart) are refused. */
export function isJsonRequest(request: Request): boolean {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return type === "application/json";
}
