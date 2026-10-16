import { guard, json } from "@/lib/api";
import { getUploadBytes } from "@/lib/repo/uploads";

/** Private file access: only the owner, never cached, never sniffed, and scripts in a PDF cannot run in our origin. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await guard(req, { mutating: false });
  if (v instanceof Response) return v;
  const f = await getUploadBytes(v.id, (await ctx.params).id);
  if (!f) return json({ error: "not_found" }, 404);
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.mime,
      "content-disposition": "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    },
  });
}
