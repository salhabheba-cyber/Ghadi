import { rateLimit } from "@/lib/rate-limit";
import { EntitlementError } from "@/lib/repo/billing";
import { SessionError } from "@/lib/repo/sessions";
import { isSameOrigin, viewerFromRequest, type Viewer } from "@/lib/session";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Order matters: origin (CSRF) → authentication → rate limit. Returns the viewer or a ready-made error Response. */
export async function guard(req: Request, opts: { mutating: boolean }): Promise<Viewer | Response> {
  if (opts.mutating && !isSameOrigin(req)) return json({ error: "forbidden_origin" }, 403);
  const viewer = await viewerFromRequest(req);
  if (!viewer) return json({ error: "unauthenticated" }, 401);
  if (!rateLimit(`api:${viewer.id}`, 120, 60_000)) return json({ error: "rate_limited" }, 429);
  return viewer;
}

const STATUS: Record<SessionError["code"], number> = { not_found: 404, invalid_state: 409, wrong_activity: 409, no_hints: 409, bad_answer: 400 };

export function errorResponse(e: unknown): Response {
  if (e instanceof EntitlementError) return json({ error: "subscription_required" }, 402);
  if (e instanceof SessionError) return json({ error: e.code }, STATUS[e.code]);
  console.error(JSON.stringify({ level: "error", msg: "unhandled api error", name: (e as Error)?.name })); // no message/stack: may contain PII
  return json({ error: "internal" }, 500);
}
