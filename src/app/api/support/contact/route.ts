import { json } from "@/lib/api";
import { getMailProvider } from "@/lib/providers/mail";
import { rateLimit } from "@/lib/rate-limit";
import { ContactInput, createSupportRequest } from "@/lib/repo/support";
import { isSameOrigin, viewerFromRequest } from "@/lib/session";

/** A visitor chooses to message the team. Stored with their email so the team can reply; shown in the admin dashboard. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: "forbidden_origin" }, 403);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`support:contact:${ip}`, 5, 60 * 60_000)) return json({ error: "rate_limited" }, 429);
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (raw && typeof raw.website === "string" && raw.website !== "") return json({ ok: true }); // honeypot: bots fill hidden fields
  const body = ContactInput.safeParse(raw);
  if (!body.success) return json({ error: "bad_request" }, 400);
  const viewer = await viewerFromRequest(req);
  await createSupportRequest(body.data, viewer?.id ?? null);
  // Best-effort email to the owner when a mail service is configured. The dashboard is the source of truth.
  const to = process.env.CONTACT_EMAIL, mail = getMailProvider();
  if (to && mail) {
    mail.send({ to, subject: "GHADI: a family wants to contact you", text: `From: ${body.data.email}\n\n${body.data.message}` }).catch(() => {});
  }
  return json({ ok: true });
}
