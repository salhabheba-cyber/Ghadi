"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { normalizePhone, phoneSignInAvailable } from "@/lib/providers/sms";
import { mailAvailable } from "@/lib/providers/mail";
import { ForbiddenError, transitionContent } from "@/lib/repo/admin";
import { resolveSupportRequest } from "@/lib/repo/support";
import { recordManualPayment } from "@/lib/repo/manual-payments";
import { rateLimit } from "@/lib/rate-limit";
import { EntitlementError } from "@/lib/repo/billing";
import { submitDictation, submitReading } from "@/lib/repo/practice";
import { addItem, confirmItem, proposeFromText, removeItem, setStatus } from "@/lib/repo/agenda";
import { confirmUpload, deleteFamilyText, deleteUpload, retryUpload } from "@/lib/repo/uploads";
import type { DictationResult } from "@/lib/practice/dictation";
import { requireParent } from "@/lib/session";
import { ChildInput, ConsentInput, Locale } from "@/lib/schemas";
import { createChild, deleteAccount, deleteChild, deleteLearningData, getChildAccess, resetSkill, updateChild } from "@/lib/repo/children";

export interface FormState { error?: string }

const Creds = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(10).max(128), locale: Locale });

function authError(e: unknown, mode: "in" | "up"): string {
  if (e instanceof APIError) {
    const code = String((e.body as { code?: string } | undefined)?.code ?? "");
    if (e.status === 429 || e.statusCode === 429) return "rateLimited";
    if (mode === "in" && code === "EMAIL_NOT_VERIFIED") return "emailNotVerified";
    if (mode === "in") return "invalidCredentials"; // never reveal whether the email or the password was wrong
    if (code === "USER_ALREADY_EXISTS" || code.startsWith("USER_ALREADY_EXISTS")) return "emailTaken";
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") return "weakPassword";
  }
  return "generic";
}

export async function signUpAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = Creds.extend({ name: z.string().trim().min(1).max(80) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "invalidInput" };
  try {
    await auth.api.signUpEmail({ body: { name: p.data.name, email: p.data.email, password: p.data.password }, headers: await headers() });
  } catch (e) {
    return { error: authError(e, "up") };
  }
  redirect(mailAvailable() ? `/${p.data.locale}/sign-in?verify=1` : `/${p.data.locale}/parent`);
}

export async function signInAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = Creds.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "invalidInput" };
  try {
    await auth.api.signInEmail({ body: { email: p.data.email, password: p.data.password }, headers: await headers() });
  } catch (e) {
    return { error: authError(e, "in") };
  }
  redirect(`/${p.data.locale}/parent`);
}

export interface PhoneState { error?: string; sent?: boolean; phone?: string }

function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Step 1 of mobile sign-in/sign-up: send a one-time code. The same flow creates the account the first time. */
export async function sendPhoneCodeAction(_: PhoneState, fd: FormData): Promise<PhoneState> {
  const locale = Locale.safeParse(fd.get("locale"));
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  if (!locale.success || !phone) return { error: "invalidPhone" };
  if (!phoneSignInAvailable()) return { error: "smsUnavailable" };
  const h = await headers();
  // SMS costs money and can be abused ("SMS pumping"), so limit per number and per network address.
  if (!rateLimit(`otp:phone:${phone}`, 3, 10 * 60_000) || !rateLimit(`otp:ip:${clientIp(h)}`, 10, 10 * 60_000)) return { error: "rateLimited" };
  try {
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone }, headers: h });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "send otp failed", name: (e as Error)?.name }));
    return { error: "smsFailed" };
  }
  return { sent: true, phone };
}

/** Step 2: verify the code. Success signs the parent in (creating the account if this number is new). */
export async function verifyPhoneCodeAction(_: PhoneState, fd: FormData): Promise<PhoneState> {
  const locale = Locale.safeParse(fd.get("locale"));
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  const code = String(fd.get("code") ?? "").trim();
  if (!locale.success || !phone || !/^\d{6}$/.test(code)) return { error: "invalidCode", sent: true, phone: phone ?? undefined };
  try {
    await auth.api.verifyPhoneNumber({ body: { phoneNumber: phone, code }, headers: await headers() });
  } catch (e) {
    const status = e instanceof APIError ? (e.status as unknown as number | string) : 0;
    const tooMany = e instanceof APIError && String((e.body as { code?: string } | undefined)?.code ?? "").includes("TOO_MANY");
    return { error: tooMany || status === 429 ? "rateLimited" : "invalidCode", sent: true, phone };
  }
  redirect(`/${locale.data}/parent`);
}

/** Always answers the same way so the form cannot be used to discover which emails have accounts. */
export async function forgotPasswordAction(_: FormState & { done?: boolean }, fd: FormData): Promise<FormState & { done?: boolean }> {
  const p = z.object({ email: z.string().trim().toLowerCase().email().max(254), locale: Locale }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "invalidInput" };
  if (!mailAvailable()) return { error: "mailUnavailable" };
  const h = await headers();
  if (!rateLimit(`reset:email:${p.data.email}`, 3, 15 * 60_000) || !rateLimit(`reset:ip:${clientIp(h)}`, 10, 15 * 60_000)) return { error: "rateLimited" };
  try {
    await auth.api.requestPasswordReset({ body: { email: p.data.email, redirectTo: `/${p.data.locale}/reset-password` }, headers: h });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "reset request failed", name: (e as Error)?.name }));
  }
  return { done: true };
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ token: z.string().min(10).max(200), password: z.string().min(10).max(128), locale: Locale }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "weakPassword" };
  try {
    await auth.api.resetPassword({ body: { newPassword: p.data.password, token: p.data.token }, headers: await headers() });
  } catch {
    return { error: "invalidToken" };
  }
  redirect(`/${p.data.locale}/sign-in?reset=1`);
}

export async function signOutAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  await auth.api.signOut({ headers: await headers() });
  redirect(`/${locale}`);
}

/** Local-development convenience only. Each click creates a fresh throwaway parent with random credentials. */
export async function demoEntryAction(fd: FormData) {
  if (process.env.NODE_ENV === "production" || process.env.GHADI_ENABLE_DEMO_ENTRY !== "true") redirect("/en");
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const id = randomUUID();
  await auth.api.signUpEmail({ body: { name: "Demo parent", email: `demo-${id}@ghadi.invalid`, password: randomUUID() + randomUUID() }, headers: await headers() });
  redirect(`/${locale}/parent`);
}

function parseChild(fd: FormData) {
  const child = ChildInput.safeParse(Object.fromEntries(fd));
  const consent = ConsentInput.safeParse({
    learningData: fd.get("consentLearning") === "on",
    aiDisclosure: fd.get("consentAi") === "on",
    microphone: fd.get("consentMic") === "on",
  });
  return { child, consent };
}

export async function createChildAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const { child, consent } = parseChild(fd);
  if (!child.success) return { error: "invalid" };
  if (!consent.success) return { error: "consent" };
  const created = await createChild(viewer.id, child.data, consent.data);
  redirect(`/${locale}/parent/children/${created.id}`);
}

export async function updateChildAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const child = ChildInput.safeParse(Object.fromEntries(fd));
  const childId = String(fd.get("childId") ?? "");
  if (!child.success) return { error: "invalid" };
  const ok = await updateChild(viewer.id, childId, child.data);
  if (!ok) return { error: "generic" };
  redirect(`/${locale}/parent/children/${childId}`);
}

export async function deleteLearningAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const childId = String(fd.get("childId") ?? "");
  await deleteLearningData(viewer.id, childId);
  redirect(`/${locale}/parent/children/${childId}`);
}

export async function resetSkillAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const childId = String(fd.get("childId") ?? "");
  await resetSkill(viewer.id, childId, String(fd.get("skillId") ?? ""));
  redirect(`/${locale}/parent/children/${childId}`);
}

/** The server re-checks the typed nickname; the dialog's disabled button is only a convenience. */
export async function deleteChildAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const childId = String(fd.get("childId") ?? "");
  const access = await getChildAccess(viewer.id, childId);
  if (!access || String(fd.get("confirm") ?? "").trim() !== access.child.displayName) redirect(`/${locale}/parent/children/${childId}`);
  await deleteChild(viewer.id, childId);
  redirect(`/${locale}/parent`);
}

export interface DictationState { error?: string; result?: DictationResult; expected?: string }

export async function submitDictationAction(_: DictationState, fd: FormData): Promise<DictationState> {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const childId = String(fd.get("childId") ?? ""), textId = String(fd.get("textId") ?? "");
  if (!rateLimit(`practice:${viewer.id}`, 60, 60_000)) return { error: "rateLimited" };
  try {
    const result = await submitDictation(viewer.id, childId, textId, fd.get("typed"));
    return result ? { result } : { error: "invalid" };
  } catch (e) {
    if (e instanceof EntitlementError) return { error: "subscription" };
    throw e;
  }
}

export interface ReadingState { error?: string; saved?: boolean }

export async function submitReadingAction(_: ReadingState, fd: FormData): Promise<ReadingState> {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const childId = String(fd.get("childId") ?? ""), textId = String(fd.get("textId") ?? "");
  let marks: unknown;
  try { marks = JSON.parse(String(fd.get("marks") ?? "[]")); } catch { return { error: "invalid" }; }
  if (!rateLimit(`practice:${viewer.id}`, 60, 60_000)) return { error: "rateLimited" };
  try {
    return (await submitReading(viewer.id, childId, textId, marks)) ? { saved: true } : { error: "invalid" };
  } catch (e) {
    if (e instanceof EntitlementError) return { error: "subscription" };
    throw e;
  }
}

export interface UploadReviewState { error?: string; created?: boolean }

export async function confirmUploadAction(_: UploadReviewState, fd: FormData): Promise<UploadReviewState> {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const r = await confirmUpload(viewer.id, String(fd.get("uploadId") ?? ""), {
    title: fd.get("title"), body: fd.get("body"), childId: fd.get("childId"), rightsConfirmed: fd.get("rights") === "on",
  });
  return r.ok ? { created: true } : { error: r.reason === "child_not_found" ? "child_not_found" : "invalid" };
}

export async function deleteUploadAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  await deleteUpload(viewer.id, String(fd.get("uploadId") ?? ""));
  redirect(`/${locale}/parent/uploads`);
}

export async function retryUploadAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const id = String(fd.get("uploadId") ?? "");
  await retryUpload(viewer.id, id);
  redirect(`/${locale}/parent/uploads/${id}`);
}

export async function deleteFamilyTextAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const childId = String(fd.get("childId") ?? "");
  await deleteFamilyText(viewer.id, childId, String(fd.get("textId") ?? ""));
  redirect(`/${locale}/parent/children/${childId}`);
}

export async function agendaAddAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const childId = String(fd.get("childId") ?? "");
  await addItem(viewer.id, childId, { title: fd.get("title"), dueOn: String(fd.get("dueOn") ?? "") || null });
  redirect(`/${locale}/parent/agenda?child=${childId}`);
}

export async function agendaProposeAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const childId = String(fd.get("childId") ?? "");
  const n = await proposeFromText(viewer.id, childId, fd.get("text"));
  redirect(`/${locale}/parent/agenda?child=${childId}&found=${n ?? 0}`);
}

export async function agendaConfirmAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const childId = String(fd.get("childId") ?? "");
  await confirmItem(viewer.id, String(fd.get("itemId") ?? ""), { title: fd.get("title"), dueOn: String(fd.get("dueOn") ?? "") || null });
  redirect(`/${locale}/parent/agenda?child=${childId}`);
}

export async function agendaStatusAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const childId = String(fd.get("childId") ?? "");
  await setStatus(viewer.id, String(fd.get("itemId") ?? ""), String(fd.get("status") ?? ""));
  redirect(`/${locale}/parent/agenda?child=${childId}`);
}

export async function agendaRemoveAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const childId = String(fd.get("childId") ?? "");
  await removeItem(viewer.id, String(fd.get("itemId") ?? ""));
  redirect(`/${locale}/parent/agenda?child=${childId}`);
}

export async function contentTransitionAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const kind = z.enum(["lesson", "practice_text"]).safeParse(fd.get("kind"));
  const to = z.enum(["draft", "in_review", "approved", "retired"]).safeParse(fd.get("to"));
  if (!kind.success || !to.success) redirect(`/${locale}/admin?error=invalid`);
  let result: string;
  try {
    result = await transitionContent(viewer.id, kind.data, String(fd.get("id") ?? ""), to.data);
  } catch (e) {
    if (e instanceof ForbiddenError) redirect(`/${locale}/admin`);
    throw e;
  }
  redirect(`/${locale}/admin${result === "ok" ? "" : `?error=${result}`}`);
}

export async function recordPaymentAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  let res;
  try {
    res = await recordManualPayment(viewer.id, String(fd.get("email") ?? ""), String(fd.get("reference") ?? ""));
  } catch (e) {
    if (e instanceof ForbiddenError) redirect(`/${locale}/admin`);
    throw e;
  }
  redirect(`/${locale}/admin?${res.ok ? `paid=${encodeURIComponent(res.periodEnd.toISOString().slice(0, 10))}` : `error=${res.error}`}`);
}

export async function deleteAccountAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  const ok = await deleteAccount(viewer.id, String(fd.get("confirm") ?? ""));
  if (!ok) redirect(`/${locale}/parent?deleteError=1`);
  try { await auth.api.signOut({ headers: await headers() }); } catch { /* session already removed with the account */ }
  redirect(`/${locale}`);
}

export async function resolveSupportAction(fd: FormData) {
  const locale = Locale.catch("en").parse(fd.get("locale"));
  const viewer = await requireParent(locale);
  try {
    await resolveSupportRequest(viewer.id, String(fd.get("id") ?? ""));
  } catch (e) {
    if (!(e instanceof ForbiddenError)) throw e;
  }
  redirect(`/${locale}/admin`);
}
