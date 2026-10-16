import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Locale } from "@/lib/schemas";

export interface Viewer {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function getViewer(): Promise<Viewer | null> {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const role = (s.user as { role?: string }).role ?? "parent";
  return { id: s.user.id, name: s.user.name, email: s.user.email, role };
}

/** Pages: redirect unauthenticated visitors to sign-in. */
export async function requireParent(locale: Locale): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/${locale}/sign-in`);
  return v;
}

/** Route handlers: return null so the handler can answer 401 itself. */
export async function viewerFromRequest(req: Request): Promise<Viewer | null> {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return null;
  return { id: s.user.id, name: s.user.name, email: s.user.email, role: (s.user as { role?: string }).role ?? "parent" };
}

/** CSRF defence for cookie-authenticated JSON endpoints: state-changing requests must come from our own origin. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
