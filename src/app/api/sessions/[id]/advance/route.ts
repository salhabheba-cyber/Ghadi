import { errorResponse, guard, json } from "@/lib/api";
import { advanceSession } from "@/lib/repo/sessions";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await guard(req, { mutating: true });
  if (v instanceof Response) return v;
  try {
    return json({ view: await advanceSession(v.id, (await ctx.params).id) });
  } catch (e) {
    return errorResponse(e);
  }
}
