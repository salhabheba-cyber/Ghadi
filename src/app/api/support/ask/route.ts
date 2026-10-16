import { json } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/session";
import { findAnswer } from "@/lib/support/kb";
import { Locale } from "@/lib/schemas";
import { z } from "zod";

const Body = z.object({ message: z.string().trim().min(1).max(500), locale: Locale.catch("en") });

/** Stateless help bot: nothing is stored. Works for visitors and signed-in parents alike. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: "forbidden_origin" }, 403);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`support:ask:${ip}`, 30, 60_000)) return json({ error: "rate_limited" }, 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const hit = findAnswer(body.data.message);
  return json(hit ? { answer: hit.answer[body.data.locale], id: hit.id } : { answer: null });
}
