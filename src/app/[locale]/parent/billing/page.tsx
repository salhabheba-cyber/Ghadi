import { getMessages } from "@/lib/i18n/messages";
import { getEntitlement, getPlan } from "@/lib/repo/billing";
import { billingConfigured, manualPayment } from "@/lib/billing/provider";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";

export const metadata = { title: "Plan & billing" };

export default async function BillingPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ need?: string }> }) {
  const locale = Locale.parse((await params).locale);
  const viewer = await requireParent(locale);
  const m = getMessages(locale);
  const [plan, ent, sp] = await Promise.all([getPlan(), getEntitlement(viewer.id), searchParams]);
  const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(d) : "");
  const price = new Intl.NumberFormat(locale, { style: "currency", currency: plan.currency }).format(plan.priceCents / 100);
  const configured = billingConfigured();
  const manual = manualPayment();
  return (
    <div className="stack" style={{ maxWidth: "40rem" }}>
      <a href={`/${locale}/parent`}>← {m.common.back}</a>
      <h1>{m.billing.title}</h1>
      {sp.need === "1" && !ent.allowed && <div className="alert warn" role="alert">{m.billing.needSubscription}</div>}
      <section className="card stack-sm" aria-labelledby="status">
        <h2 id="status">{m.billing.yourStatus}</h2>
        <p><strong>{m.billing.statusLine(ent.status, ent.trialDaysLeft)}</strong></p>
        {ent.accessUntil && <p className="muted">{m.billing.accessUntil(fmtDate(ent.accessUntil))}</p>}
      </section>
      <section className="card stack-sm" aria-labelledby="plan">
        <h2 id="plan">{plan.name}</h2>
        <p>{m.billing.planLine(price, plan.trialDays)}</p>
        <ul className="clean stack-sm">
          {m.billing.includes.map((x) => <li key={x}>{x}</li>)}
        </ul>
        {manual ? (
          <div className="alert info" role="note">
            <strong>{m.billing.manualTitle}</strong>
            <ol>{m.billing.manualSteps(manual.whishNumber, viewer.email, price).map((x) => <li key={x}>{x}</li>)}</ol>
          </div>
        ) : (
          <>
            {configured ? null : <div className="alert info" role="note">{m.billing.notConnected}</div>}
            <button className="btn btn-primary" disabled aria-disabled="true">{m.billing.subscribe(price)}</button>
          </>
        )}
      </section>
      <p className="muted">{m.billing.dataAlways}</p>
    </div>
  );
}
