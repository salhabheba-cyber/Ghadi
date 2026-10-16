import { errorResponse, guard, json } from "@/lib/api";
import { getSessionView } from "@/lib/repo/sessions";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await guard(req, { mutating: false });
  if (v instanceof Response) return v;
  try {
    const view = await getSessionView(v.id, (await ctx.params).id);
    return view ? json({ view }) : json({ error: "not_found" }, 404);
  } catch (e) {
    return errorResponse(e);
  }
}
