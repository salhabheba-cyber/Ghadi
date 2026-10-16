import { guard, json } from "@/lib/api";
import { exportChildData } from "@/lib/repo/children";

export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const v = await guard(req, { mutating: false });
  if (v instanceof Response) return v;
  const data = await exportChildData(v.id, (await ctx.params).childId);
  if (!data) return json({ error: "not_found" }, 404);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="ghadi-child-data.json"', "cache-control": "no-store" },
  });
}
