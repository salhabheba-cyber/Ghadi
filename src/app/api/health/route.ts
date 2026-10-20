import { jsonOk } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight health check used by Railway and other platform health probes. */
export function GET() {
  return jsonOk({ ok: true, ts: new Date().toISOString() });
}
