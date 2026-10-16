/**
 * End-to-end smoke test over HTTP against a RUNNING server (no browser needed):
 *   pnpm build && pnpm start   # in one terminal
 *   pnpm smoke                 # in another (BASE_URL / DATABASE_URL via env)
 * It submits the real forms (server actions), uses real session cookies, and cleans up its own users.
 * It reads correct answers from the database ONLY to drive the lesson; the browser never receives them.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ORIGIN = new URL(BASE).origin;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  -> ${detail}` : ""}`);
  if (!ok) failures++;
};

class Client {
  jar = new Map<string, string>();
  cookie = () => [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  async req(path: string, init: RequestInit & { origin?: boolean } = {}) {
    const headers = new Headers(init.headers);
    if (this.jar.size) headers.set("cookie", this.cookie());
    if (init.origin !== false && init.method && init.method !== "GET") headers.set("origin", ORIGIN);
    const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(";");
      const i = pair!.indexOf("=");
      const name = pair!.slice(0, i), value = pair!.slice(i + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(sc) || value === "") this.jar.delete(name); else this.jar.set(name, value);
    }
    return res;
  }
  /** Fetch a page, copy every hidden input (this carries Next's server-action fields), add ours, and POST it back. */
  async submit(path: string, fields: Record<string, string>, opts: { formContains?: string } = {}) {
    const html = await (await this.req(path)).text();
    const forms = html.match(/<form[\s\S]*?<\/form>/g) ?? [];
    // Pages contain several forms (e.g. the header's sign-out). Pick by marker, else the form that owns most of our fields.
    const score = (f: string) => Object.keys(fields).filter((k) => f.includes(`name="${k}"`)).length;
    const candidates = forms.filter((f) => f.includes("$ACTION"));
    const form = opts.formContains
      ? candidates.find((f) => f.includes(opts.formContains!))
      : [...candidates].sort((a, b) => score(b) - score(a))[0];
    if (!form) throw new Error(`no matching form on ${path}`);
    const fd = new FormData();
    for (const tag of form.match(/<input[^>]*type="hidden"[^>]*>/g) ?? []) {
      const name = /name="([^"]*)"/.exec(tag)?.[1], value = /value="([^"]*)"/.exec(tag)?.[1] ?? "";
      if (name) fd.set(name, decode(value));
    }
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return this.req(path, { method: "POST", body: fd });
  }
}
const decode = (s: string) => s.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
const text = async (r: Response) => decode(await r.text());

async function main() {
  const emailA = `smoke-a-${randomUUID().slice(0, 8)}@smoke.invalid`;
  const emailB = `smoke-b-${randomUUID().slice(0, 8)}@smoke.invalid`;
  const password = "smoke-test-password-1";
  const anon = new Client(), A = new Client(), B = new Client();

  try {
    // ---- public surface ----
    let r = await anon.req("/", { headers: { "accept-language": "fr-FR,fr;q=0.9" } });
    check("root redirects by Accept-Language", r.status === 307 && r.headers.get("location")?.endsWith("/fr") === true);
    const ar = await text(await anon.req("/ar"));
    check("Arabic page is RTL with lang=ar", /<html lang="ar" dir="rtl">/.test(ar));
    check("Arabic page flags the draft translation", ar.includes("ترجمة أولية"));
    const en = await text(await anon.req("/en"));
    check("landing states what is real (demo teacher, no AI model)", en.includes("scripted demo") && en.includes("No AI model"));
    r = await anon.req("/en/parent");
    check("protected page redirects anonymous users to sign-in", r.status === 307 && r.headers.get("location")?.includes("/en/sign-in") === true);

    // ---- sign up / sign in ----
    r = await A.submit("/en/sign-up", { name: "Parent A", email: emailA, password });
    check("sign-up form succeeds and redirects to the parent area", r.status === 303 && r.headers.get("location")?.endsWith("/en/parent") === true, `${r.status} ${r.headers.get("location")}`);
    check("session cookie is set HttpOnly", A.jar.size > 0);
    const weak = await text(await new Client().submit("/en/sign-up", { name: "X", email: `w-${randomUUID().slice(0, 6)}@smoke.invalid`, password: "short" }));
    check("short password is rejected with a visible message", weak.includes("check the highlighted fields") || weak.includes("at least 10"));
    const bad = await text(await new Client().submit("/en/sign-in", { email: emailA, password: "wrong-password-999" }));
    check("wrong password shows a generic error", bad.includes("Email or password is not correct"));

    // ---- parent dashboard & child profile ----
    let page = await text(await A.req("/en/parent"));
    check("dashboard greets the parent and shows an empty state", page.includes("Welcome, Parent A") && page.includes("No child profile yet"));
    check("dashboard lists unavailable features honestly", page.includes("Not available yet"));
    check("new parent is on a 7-day free trial", page.includes("Free trial: 7 days left"));
    const billing = await text(await A.req("/en/parent/billing"));
    const whish = process.env.WHISH_NUMBER?.trim();
    check("billing page shows US$5/month and the 7-day trial", billing.includes("$5.00 per month") && billing.includes("7-day free trial"));
    check(whish ? "billing page shows the Whish payment instructions and the confirm-by-hand note" : "billing page says payments are not connected", whish ? billing.includes(whish) && billing.includes("We confirm payments by hand") : billing.includes("Payments are not connected"));
    check("there is never an automatic card-charge button", !/<button[^>]*>Subscribe/.test(billing) || /<button[^>]*disabled[^>]*>Subscribe/.test(billing));
    const signIn = await text(await new Client().req("/en/sign-in"));
    check("sign-in offers email and says mobile sign-in is unavailable without an SMS service", signIn.includes("Use your email") && signIn.includes("no SMS service is connected"));

    const childFields = { locale: "en", displayName: "Sami", ageBand: "3-5", uiLocale: "en", lessonLanguage: "en", explanationLanguage: "en", sessionMinutes: "10" };
    const noConsent = await text(await A.submit("/en/parent/children/new", { ...childFields, consentLearning: "on" }));
    check("profile cannot be created without both required consents", noConsent.includes("two required consent boxes"));
    r = await A.submit("/en/parent/children/new", { ...childFields, consentLearning: "on", consentAi: "on" });
    const childPath = r.headers.get("location") ?? "";
    const childId = childPath.split("/").pop() ?? "";
    check("profile is created with consent", r.status === 303 && /\/en\/parent\/children\/[0-9a-f-]{36}$/.test(childPath), `${r.status} ${childPath}`);
    page = await text(await A.req(childPath));
    check("child page shows nickname, empty progress and consent records", page.includes("Sami") && page.includes("No practice yet") && page.includes("learning data"));

    // ---- student library ----
    const home = await text(await A.req(`/en/learn/${childId}`));
    for (const t of ["Colours around us", "Counting to five", "Shapes", "The sound sss"]) check(`library lists "${t}"`, home.includes(t));
    check("unreviewed French/Arabic drafts are NOT offered", !home.includes("Compter") && !home.includes("العد حتى"));
    check("library shows source, license and an honest alignment note", home.includes("Original GHADI sample content") && /not aligned/i.test(home));
    const searched = await text(await A.req(`/en/learn/${childId}?q=shape`));
    check("library search filters lessons", searched.includes("Shapes") && !searched.includes("Counting to five"));

    // ---- lesson session ----
    const lessonId = (await pool.query<{ id: string }>("SELECT id FROM lessons WHERE slug='colours-red-blue-yellow'")).rows[0]!.id;
    const lessonHtml = await text(await A.req(`/en/learn/${childId}/lesson/${lessonId}`));
    check("lesson page discloses the AI/demo teacher", lessonHtml.includes("computer program, not a person") && lessonHtml.includes("No AI model is connected"));
    check("lesson HTML does not contain answer keys", !/correctOptionIds|correctValue|"spec"/.test(lessonHtml));
    const sessionId = (await pool.query<{ id: string }>("SELECT id FROM learning_sessions WHERE child_id=$1", [childId])).rows[0]!.id;

    // ---- API security ----
    r = await anon.req(`/api/sessions/${sessionId}/advance`, { method: "POST", origin: false });
    check("API rejects a request with no Origin (CSRF) → 403", r.status === 403);
    r = await anon.req(`/api/sessions/${sessionId}/advance`, { method: "POST" });
    check("API rejects unauthenticated requests → 401", r.status === 401);
    r = await B.submit("/en/sign-up", { name: "Parent B", email: emailB, password });
    check("second parent signs up", r.status === 303);
    r = await B.req(`/api/sessions/${sessionId}/advance`, { method: "POST" });
    check("another parent cannot drive this session → 404", r.status === 404);
    r = await B.req(`/api/children/${childId}/export`);
    check("another parent cannot export this child → 404", r.status === 404);
    check("another parent gets 404 on the child's pages", (await B.req(`/en/parent/children/${childId}`)).status === 404 && (await B.req(`/en/learn/${childId}`)).status === 404);
    r = await A.req(`/api/sessions/${sessionId}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: "not json" });
    check("malformed answer payload → 400", r.status === 400);

    // ---- play the whole lesson through the API ----
    const call = async (path: string, body: unknown = {}) =>
      A.req(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (x) => ({ status: x.status, json: JSON.parse(await x.text()) }));
    let view = (await call(`/api/sessions/${sessionId}/advance`)).json.view;
    let guard = 0;
    while (view.state !== "completion" && guard++ < 40) {
      if (view.state === "guided_practice" || view.state === "independent_attempt") {
        const spec = (await pool.query("SELECT spec FROM activities WHERE id=$1", [view.activity.id])).rows[0].spec;
        const res = await call(`/api/sessions/${sessionId}/answer`, { activityId: view.activity.id, answer: spec.kind === "choice" ? { optionIds: spec.correctOptionIds } : { value: spec.correct } });
        if (res.status !== 200) { check("answer accepted", false, JSON.stringify(res)); break; }
        view = res.json.view;
      } else view = (await call(`/api/sessions/${sessionId}/advance`)).json.view;
    }
    check("lesson completes through explanation, practice, recap", view.state === "completion" && view.done === true, view.state);
    check("recap summary reflects stored attempts (4/4)", (await pool.query("SELECT count(*)::int n FROM attempts WHERE child_id=$1 AND is_correct", [childId])).rows[0].n === 4);

    // ---- progress, export ----
    page = await text(await A.req(childPath));
    check("progress shows the practised skill and honest limits", page.includes("Recognise basic colours") && page.includes("not a test, a diagnosis"));
    check("four correct answers are still labelled by evidence, not 'mastered'", !/mastered/i.test(page));
    r = await A.req(`/api/children/${childId}/export`);
    const exp = JSON.parse(await r.text());
    check("export returns the child's data as a JSON download", r.status === 200 && /attachment/.test(r.headers.get("content-disposition") ?? "") && exp.attempts.length === 4);
    check("export contains no other child's data", exp.profile.id === childId);

    // ---- practice, uploads, agenda, report, staff gate, legal drafts ----
    const dict = await (await A.req(`/en/learn/${childId}/dictation`)).text();
    check("dictation list renders and says typing only", /dictation/i.test(dict));
    const reading = await A.req(`/en/learn/${childId}/reading`);
    check("reading practice list renders", reading.status === 200);
    const up = await (await A.req("/en/parent/uploads")).text();
    check("uploads page renders, is review-first and says files are private", up.includes("you check and correct it") && up.includes("private to your account"));
    const ag = await (await A.req(`/en/parent/agenda?child=${childId}`)).text();
    check("agenda page says nothing is added until confirmed", ag.includes("Nothing is added to the plan until you confirm"));
    const rep = await A.req(`/en/parent/children/${childId}/report`);
    check("parent report renders", rep.status === 200);
    check("another parent cannot open this child's report → 404", (await B.req(`/en/parent/children/${childId}/report`)).status === 404);
    const adm = await (await A.req("/en/admin")).text();
    check("a parent sees 'content staff only' on the admin page and no content table", adm.includes("content staff only") && !adm.includes("Content library"));
    check("anonymous visitors are redirected away from admin", (await new Client().req("/en/admin")).status === 307);
    for (const pth of ["/en/privacy", "/en/terms"]) {
      const t = await (await A.req(pth)).text();
      check(`${pth} is clearly labelled as a draft pending legal review`, t.includes("not yet reviewed by a lawyer"));
    }

    // ---- help bot and admin dashboard ----
    const askUrl = `${BASE}/api/support/ask`;
    let sr = await fetch(askUrl, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ message: "how do I pay", locale: "en" }) });
    const askBody = await sr.json();
    check("help bot answers a payment question from the knowledge base", sr.status === 200 && /Whish/.test(askBody.answer ?? ""));
    sr = await fetch(askUrl, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ message: "zzz qqq", locale: "en" }) });
    check("help bot admits when it does not know (answer is null)", (await sr.json()).answer === null);
    sr = await fetch(askUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "hi", locale: "en" }) });
    check("help bot rejects cross-origin posts", sr.status === 403);
    sr = await fetch(`${BASE}/api/support/contact`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email: "v@smoke.invalid", message: "My payment is not confirmed", locale: "en" }) });
    check("a visitor can message the team", sr.status === 200 && (await pool.query("SELECT 1 FROM support_requests WHERE email='v@smoke.invalid'")).rowCount === 1);
    sr = await fetch(`${BASE}/api/support/contact`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email: "bot@smoke.invalid", message: "spam spam spam", website: "http://x" }) });
    check("honeypot submissions are silently dropped", (await pool.query("SELECT 1 FROM support_requests WHERE email='bot@smoke.invalid'")).rowCount === 0);
    check("help button is on the page", (await (await A.req("/en/parent")).text()).includes("Help"));
    check("a parent cannot see the support inbox or stats", !(await (await A.req("/en/admin")).text()).includes("Messages from families"));

    // ---- privacy controls: parent correction, deletion ----
    r = await A.submit(childPath, { locale: "en", childId, skillId: "color-recognition" }, { formContains: 'name="skillId"' });
    check("parent can clear one skill's record", r.status === 303 && (await pool.query("SELECT 1 FROM skill_evidence WHERE child_id=$1", [childId])).rowCount === 0);
    r = await A.submit(childPath, { locale: "en", childId }, { formContains: "Removes sessions, answers and skill records" });
    check("parent can delete learning history but keep the profile", r.status === 303 && (await pool.query("SELECT 1 FROM learning_sessions WHERE child_id=$1", [childId])).rowCount === 0 && (await pool.query("SELECT 1 FROM child_profiles WHERE id=$1", [childId])).rowCount === 1);
    r = await A.submit(childPath, { locale: "en", childId, confirm: "NotTheName" }, { formContains: 'name="confirm"' });
    check("deleting the profile with a wrong confirmation does nothing", (await pool.query("SELECT 1 FROM child_profiles WHERE id=$1", [childId])).rowCount === 1, String(r.status));
    r = await A.submit(childPath, { locale: "en", childId, confirm: "Sami" }, { formContains: 'name="confirm"' });
    check("deleting the profile with the right confirmation removes it", r.status === 303 && r.headers.get("location")?.endsWith("/en/parent") === true && (await pool.query("SELECT 1 FROM child_profiles WHERE id=$1", [childId])).rowCount === 0);
    check("deleted profile is gone for the parent too (404)", (await A.req(childPath)).status === 404);
    check("deletion left an audit trail without the child's name", JSON.stringify((await pool.query("SELECT action, metadata FROM audit_events WHERE child_id=$1", [childId])).rows).includes("Sami") === false);
    r = await A.submit("/en", { locale: "en" }, { formContains: "Sign out" });
    check("sign-out ends the session", r.status === 303 && (await A.req("/en/parent")).status === 307);
  } finally {
    await pool.query("DELETE FROM support_requests WHERE email LIKE '%@smoke.invalid'");
    await pool.query("DELETE FROM \"user\" WHERE email LIKE '%@smoke.invalid'");
    const left = (await pool.query("SELECT count(*)::int n FROM child_profiles WHERE display_name='Sami' AND id NOT IN (SELECT child_id FROM child_guardians)")).rows[0].n;
    check("cleanup leaves no orphaned child profiles", left === 0);
    await pool.end();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll smoke checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
