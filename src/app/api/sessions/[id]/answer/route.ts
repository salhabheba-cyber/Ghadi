import { z } from "zod";
import { errorResponse, guard, json } from "@/lib/api";
import { submitAnswer } from "@/lib/repo/sessions";

const Body = z.object({ activityId: z.string().uuid(), answer: z.unknown() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await guard(req, { mutating: true });
  if (v instanceof Response) return v;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  try {
    return json(await submitAnswer(v.id, (await ctx.params).id, body.data.activityId, body.data.answer));
  } catch (e) {
    return errorResponse(e);
  }
}
