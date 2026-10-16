import { getPool } from "@/lib/db";

/** Liveness + database reachability for the hosting platform. Reveals no configuration or user data. */
export async function GET() {
  try {
    await getPool().query("SELECT 1");
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
