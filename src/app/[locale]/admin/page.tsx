import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";
import { canTransition, listContent, staffRole, type ContentStatus } from "@/lib/repo/admin";
import { listRecentPayments } from "@/lib/repo/manual-payments";
import { getStats, listSupportRequests } from "@/lib/repo/support";
import { contentTransitionAction, recordPaymentAction, resolveSupportAction } from "../actions";

// Staff tool: English only, adult-only, and unreachable by role-less accounts (checked against the database).
const LABEL: Record<ContentStatus, string> = { draft: "Draft", in_review: "In review", approved: "Approved", retired: "Retired" };
const NEXT: { to: ContentStatus; label: string; adminOnly?: boolean }[] = [
  { to: "in_review", label: "Submit for review" },
  { to: "draft", label: "Send back to draft" },
  { to: "approved", label: "Approve", adminOnly: true },
  { to: "retired", label: "Retire", adminOnly: true },
];
const ERRORS: Record<string, string> = { invalid_transition: "That status change is not allowed.", needs_admin: "Only an administrator can approve or retire content.", not_found: "Item not found.", invalid: "Invalid request.", no_such_user: "No account with that email." };

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; paid?: string }> }) {
  const locale = Locale.parse((await params).locale);
  const viewer = await requireParent(locale);
  const role = await staffRole(viewer.id);
  if (!role) {
    return (
      <div className="stack" style={{ maxWidth: "40rem" }}>
        <h1>Not available</h1>
        <p role="alert">This area is for content staff only.</p>
        <a href={`/${locale}/parent`}>← Back</a>
      </div>
    );
  }
  const sp = await searchParams;
  const rows = await listContent(viewer.id);
  const isAdmin = role === "admin";
  const payments = isAdmin ? await listRecentPayments(viewer.id) : [];
  const stats = isAdmin ? await getStats(viewer.id) : null;
  const requests = isAdmin ? await listSupportRequests(viewer.id) : [];
  const openCount = requests.filter((r) => r.status === "open").length;
  const usd = (c: number) => `US$${(c / 100).toFixed(2)}`;
  return (
    <div className="stack">
      <a href={`/${locale}/parent`}>← Back</a>
      <h1>{isAdmin ? "Admin dashboard" : "Content library"}</h1>
      {stats && (
        <>
          <section aria-labelledby="stats" className="stack-sm">
            <h2 id="stats">Sign-ups and payments</h2>
            <div className="grid cols-2">
              {[
                ["Parents signed up", stats.signupsTotal], ["New in last 7 days", stats.signups7d], ["New in last 30 days", stats.signups30d],
                ["On free trial now", stats.onTrial], ["Paying now", stats.paying], ["Trial ended, not paid", stats.trialEndedUnpaid],
                ["Paid period ended", stats.lapsed], ["Child profiles", stats.children],
                ["Payments confirmed (30 days)", stats.payments30d], ["Income confirmed (30 days)", usd(stats.revenue30dCents)], ["Income confirmed (all time)", usd(stats.revenueAllCents)],
              ].map(([label, value]) => (
                <div key={String(label)} className="card"><p className="small muted">{label}</p><p style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>{value}</p></div>
              ))}
            </div>
            <p className="small muted">Counts come from this app&apos;s database. &quot;Income&quot; is only the payments you confirmed below; it does not read Whish.</p>
            {stats.perDay.length > 0 && <p className="small">Sign-ups per day: {stats.perDay.map((d) => `${d.day.slice(5)}: ${d.n}`).join(" · ")}</p>}
          </section>
          <section aria-labelledby="inbox" className="stack-sm">
            <h2 id="inbox">Messages from families {openCount > 0 && <span className="small" style={{ background: "#b4492a", color: "#fff", borderRadius: 999, padding: "0.1rem 0.6rem" }}>{openCount} open</span>}</h2>
            {requests.length === 0 ? <p className="muted">No messages yet.</p> : requests.map((r) => (
              <div key={r.id} className="card stack-sm">
                <p className="small muted">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC · <a href={`mailto:${r.email}`}>{r.email}</a> · {r.signedIn ? "signed-in parent" : "visitor"} · {r.status === "open" ? "OPEN" : "resolved"}</p>
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{r.message}</p>
                {r.status === "open" && <form action={resolveSupportAction}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="id" value={r.id} /><button className="btn btn-secondary btn-sm">Mark as resolved</button></form>}
              </div>
            ))}
          </section>
          <h2>Content library</h2>
        </>
      )}
      <p className="muted">Signed in as {role === "admin" ? "administrator" : "content editor"}. Only <strong>approved</strong> items are shown to children. Approval records who approved and when. Editing the text of approved content is not offered here: it requires a new version.</p>
      {sp.paid && <div className="alert info" role="status">Payment recorded. Access runs until {sp.paid}.</div>}
      {sp.error && <div className="alert warn" role="alert">{ERRORS[sp.error] ?? "Something went wrong."}</div>}
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <caption className="sr-only">Lessons and practice texts with status, license and source</caption>
          <thead><tr><th scope="col">Title</th><th scope="col">Type</th><th scope="col">Lang</th><th scope="col">Ages</th><th scope="col">Version</th><th scope="col">License</th><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`}>
                <th scope="row">{r.title}</th>
                <td>{r.kind === "lesson" ? "Lesson" : "Practice text"}</td>
                <td>{r.language}</td>
                <td>{r.ageMin}–{r.ageMax}</td>
                <td>{r.version ?? "—"}</td>
                <td>{r.license}</td>
                <td>{r.source}</td>
                <td>{LABEL[r.status]}{r.approvedAt && <span className="small muted"> · approved {r.approvedAt.slice(0, 10)}</span>}</td>
                <td>
                  <div className="row">
                    {NEXT.filter((n) => canTransition(r.status, n.to) && (!n.adminOnly || role === "admin")).map((n) => (
                      <form key={n.to} action={contentTransitionAction}>
                        <input type="hidden" name="locale" value={locale} /><input type="hidden" name="kind" value={r.kind} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="to" value={n.to} />
                        <button className="btn btn-secondary btn-sm">{n.label}</button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {role === "admin" && (
        <section className="card stack-sm" aria-labelledby="pay">
          <h2 id="pay">Confirm a payment</h2>
          <p className="muted">Use this only after you have seen the money arrive (for example in Whish Money). Each confirmation adds 30 days of access.</p>
          <form action={recordPaymentAction} className="stack-sm">
            <input type="hidden" name="locale" value={locale} />
            <div className="field"><label htmlFor="pe">Parent&apos;s account email</label><input id="pe" name="email" type="email" className="input" required /></div>
            <div className="field"><label htmlFor="pr">Note (optional, e.g. Whish transaction)</label><input id="pr" name="reference" className="input" maxLength={200} /></div>
            <button className="btn btn-primary btn-sm">Confirm payment (+30 days)</button>
          </form>
          <h3>Recent confirmations</h3>
          {payments.length === 0 ? <p className="muted">None yet.</p> : (
            <ul className="clean">{payments.map((p) => <li key={p.id}>{p.createdAt.toISOString().slice(0, 10)} · {p.email} · {(p.amountCents / 100).toFixed(2)} {p.currency} · until {p.periodEnd.toISOString().slice(0, 10)}{p.reference && ` · ${p.reference}`}</li>)}</ul>
          )}
        </section>
      )}
    </div>
  );
}
