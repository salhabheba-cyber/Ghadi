import { getMessages } from "@/lib/i18n/messages";
import { Locale } from "@/lib/schemas";
import { listChildren } from "@/lib/repo/children";
import { deleteAccountAction } from "../actions";
import { requireParent } from "@/lib/session";
import { getEntitlement } from "@/lib/repo/billing";
import { staffRole } from "@/lib/repo/admin";
import { openSupportCount } from "@/lib/repo/support";

export default async function ParentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const locale = Locale.parse((await params).locale);
  const viewer = await requireParent(locale);
  const staff = await staffRole(viewer.id);
  const isStaff = staff !== null;
  const openMsgs = staff === "admin" ? await openSupportCount(viewer.id) : 0;
  const m = getMessages(locale);
  const children = await listChildren(viewer.id);
  const ent = await getEntitlement(viewer.id);
  return (
    <div className="stack">
      <h1>{m.parent.title(viewer.name)}</h1>
      <div className={`alert ${ent.allowed && ent.status !== "past_due" ? "info" : "warn"}`} role="status">
        <strong>{m.billing.statusLine(ent.status, ent.trialDaysLeft)}</strong>{" "}
        <a href={`/${locale}/parent/billing`}>{m.billing.manage}</a>
      </div>
      <section className="stack" aria-labelledby="kids">
        <div className="row between">
          <h2 id="kids">{m.parent.children}</h2>
          <div className="row"><a className="btn btn-secondary" href={`/${locale}/parent/uploads`}>{m.uploads.title}</a><a className="btn btn-secondary" href={`/${locale}/parent/agenda`}>{m.agenda.title}</a>{isStaff && <a className="btn btn-quiet" href={`/${locale}/admin`}>{staff === "admin" ? `Admin dashboard${openMsgs > 0 ? ` (${openMsgs} new)` : ""}` : "Content library"}</a>}<a className="btn btn-primary" href={`/${locale}/parent/children/new`}>{m.parent.addChild}</a></div>
        </div>
        {children.length === 0 ? (
          <div className="card mint">
            <h3>{m.parent.noChildrenTitle}</h3>
            <p>{m.parent.noChildrenBody}</p>
          </div>
        ) : (
          <div className="grid cols-2">
            {children.map((c) => (
              <article key={c.id} className="card stack-sm">
                <h3>{c.displayName}</h3>
                <p className="muted">{m.ageBands[c.ageBand]} · {m.parent.sessionLength(c.sessionMinutes)} · {m.langNames[c.lessonLanguage]}</p>
                <div className="row">
                  <a className="btn btn-primary" href={`/${c.uiLocale}/learn/${c.id}`}>{m.parent.openLearning}</a>
                  <a className="btn btn-secondary" href={`/${locale}/parent/children/${c.id}`}>{m.parent.progress}</a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="card" aria-labelledby="soon">
        <h2 id="soon">{m.parent.soonTitle}</h2>
        <ul className="clean stack-sm">
          {m.parent.soon.map((s) => <li key={s.name}><strong>{s.name}</strong> <span className="muted">— {s.desc}</span></li>)}
        </ul>
      </section>
      <details className="card">
        <summary>Delete my account and all family data</summary>
        <form action={deleteAccountAction} className="stack-sm" style={{ marginTop: "0.75rem" }}>
          <input type="hidden" name="locale" value={locale} />
          <p>This permanently deletes your account, every child profile and its learning records, your uploads, planner tasks and subscription record. It cannot be undone. Export your children&apos;s data first if you want a copy.</p>
          <div className="field"><label htmlFor="del-email">Type your account email to confirm</label><input id="del-email" name="confirm" type="email" className="input" autoComplete="off" required /></div>
          <button className="btn btn-danger btn-sm">Delete everything</button>
        </form>
      </details>
    </div>
  );
}
