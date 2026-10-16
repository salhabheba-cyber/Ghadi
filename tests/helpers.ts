import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { createChild } from "@/lib/repo/children";
import { seedCurriculum } from "@/lib/seed/seed";
import type { ChildInput } from "@/lib/schemas";

export const PASSWORD = "correct-horse-battery";

export async function makeParent(label = "p") {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const res = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: `Parent ${label}` } });
  return { id: res.user.id, email };
}

export const childInput = (over: Partial<ChildInput> = {}): ChildInput => ({
  displayName: "Sami", ageBand: "3-5", uiLocale: "en", lessonLanguage: "en", explanationLanguage: "en", sessionMinutes: 10, ...over,
});
export const consent = { learningData: true as const, aiDisclosure: true as const, microphone: false };

export async function makeChild(guardianId: string, over: Partial<ChildInput> = {}) {
  return createChild(guardianId, childInput(over), consent);
}

export async function ensureSeed() {
  await seedCurriculum(getPool());
}

export async function lessonBySlug(childId: string, slug: string) {
  const r = await getPool().query<{ id: string }>("SELECT id FROM lessons WHERE slug=$1", [slug]);
  return r.rows[0]!.id;
}

/** Deep-scan any JSON value for forbidden keys (used to prove answers never reach the client). */
export function findKeys(value: unknown, forbidden: string[], path = "$"): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) value.forEach((v, i) => hits.push(...findKeys(v, forbidden, `${path}[${i}]`)));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (forbidden.includes(k)) hits.push(`${path}.${k}`);
      hits.push(...findKeys(v, forbidden, `${path}.${k}`));
    }
  }
  return hits;
}
