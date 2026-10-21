import { NextResponse, type NextRequest } from "next/server";
import { handleApi } from "@/lib/server/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const result = await handleApi(req, path.join("/"));
  const res = NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store", ...result.headers },
  });
  if (result.cookie) {
    const secure =
      req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
    res.cookies.set(result.cookie.name, result.cookie.value ?? "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: result.cookie.value === null ? 0 : result.cookie.maxAgeSec,
    });
  }
  return res;
}

export const GET = run;
export const POST = run;
export const PATCH = run;
export const PUT = run;
export const DELETE = run;
