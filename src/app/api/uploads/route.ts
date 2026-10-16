import { guard, json } from "@/lib/api";
import { EntitlementError } from "@/lib/repo/billing";
import { createUpload, processUpload } from "@/lib/repo/uploads";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/validate";

/** Multipart upload. Origin → auth → rate limit → size → content sniffing → quota, all before anything is stored. */
export async function POST(req: Request) {
  const v = await guard(req, { mutating: true });
  if (v instanceof Response) return v;
  if (!rateLimit(`upload:${v.id}`, 10, 10 * 60_000)) return json({ error: "rate_limited" }, 429);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: "too_large" }, 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "bad_request" }, 400); }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "bad_request" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: "too_large" }, 413);
  const childId = String(form.get("childId") ?? "") || null;
  try {
    const r = await createUpload(v.id, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, { language: String(form.get("language") ?? ""), childId });
    if (!r.ok) return json({ error: r.reason }, r.reason === "too_large" ? 413 : r.reason === "quota" ? 429 : 400);
    void processUpload(r.id);
    return json({ id: r.id }, 201);
  } catch (e) {
    if (e instanceof EntitlementError) return json({ error: "subscription_required" }, 402);
    console.error(JSON.stringify({ level: "error", msg: "upload failed", name: (e as Error)?.name }));
    return json({ error: "internal" }, 500);
  }
}
