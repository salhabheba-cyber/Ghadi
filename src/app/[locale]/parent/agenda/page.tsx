import { getMessages } from "@/lib/i18n/messages";
import { listItems } from "@/lib/repo/agenda";
import { listChildren } from "@/lib/repo/children";
import { getUpload } from "@/lib/repo/uploads";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";
import { agendaAddAction, agendaConfirmAction, agendaProposeAction, agendaRemoveAction, agendaStatusAction } from "../../actions";

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ child?: string; found?: string; fromUpload?: string }> }) {
  const locale = Locale.parse((await params).locale);
  const viewer = await requireParent(locale);
  const sp = await searchParams;
  const m = getMessages(locale), a = m.agenda;
  const kids = await listChildren(viewer.id);
  const child = kids.find((k) => k.id === sp.child) ?? kids[0];
  const items = child ? (await listItems(viewer.id, child.id)) ?? [] : [];
  const prefill = sp.fromUpload ? (await getUpload(viewer.id, sp.fromUpload))?.text ?? "" : "";
  const today = new Date().toISOString().slice(0, 10);
  const fmt = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
  const hidden = (itemId: string) => <><input type="hidden" name="locale" value={locale} /><input type="hidden" name="childId" value={child!.id} /><input type="hidden" name="itemId" value={itemId} /></>;
  const proposed = items.filter((i) => !i.confirmed);
  const planned = items.filter((i) => i.confirmed && i.status === "planned");
  const finished = items.filter((i) => i.confirmed && i.status !== "planned");
  return (
    <div className="stack" style={{ maxWidth: "44rem" }}>
      <a href={`/${locale}/parent`}>← {m.common.back}</a>
      <h1>{a.title}</h1>
      <p>{a.intro}</p>
      {kids.length === 0 || !child ? <div className="alert warn">{m.parent.noChildrenBody}</div> : (
        <>
          <nav aria-label={a.child} className="row">{kids.map((k) => <a key={k.id} className={`btn btn-sm ${k.id === child.id ? "btn-primary" : "btn-secondary"}`} href={`/${locale}/parent/agenda?child=${k.id}`} aria-current={k.id === child.id ? "true" : undefined}>{k.displayName}</a>)}</nav>
          {sp.found !== undefined && <div className="alert info" role="status">{Number(sp.found) > 0 ? a.found(Number(sp.found)) : a.foundNone}</div>}

          {proposed.length > 0 && (
            <section className="stack" aria-labelledby="tc">
              <h2 id="tc">{a.toConfirm}</h2><p className="muted">{a.toConfirmHelp}</p>
              {proposed.map((i) => (
                <div key={i.id} className="card stack-sm">
                  <form action={agendaConfirmAction} className="stack-sm">
                    {hidden(i.id)}
                    <div className="field"><label htmlFor={`t${i.id}`}>{a.taskTitle}</label><input id={`t${i.id}`} name="title" className="input" defaultValue={i.title} maxLength={160} required /></div>
                    <div className="field"><label htmlFor={`d${i.id}`}>{a.due}</label><input id={`d${i.id}`} name="dueOn" type="date" className="input" defaultValue={i.dueOn ?? ""} /></div>
                    {!i.dueOn && <p className="small muted">{a.noDate}</p>}
                    {i.dateAmbiguous && <p className="alert warn small">{a.ambiguous}</p>}
                    {i.sourceLine && <p className="small muted">{a.source}: <q>{i.sourceLine}</q></p>}
                    <div className="row"><button className="btn btn-primary btn-sm">{a.confirm}</button></div>
                  </form>
                  <form action={agendaRemoveAction}>{hidden(i.id)}<button className="btn btn-quiet btn-sm">{a.remove}</button></form>
                </div>
              ))}
            </section>
          )}

          <section className="stack" aria-labelledby="plan">
            <h2 id="plan">{a.upcoming}</h2>
            {planned.length === 0 ? <p className="muted">{a.none}</p> : (
              <ul className="clean stack-sm">{planned.map((i) => (
                <li key={i.id} className="card row between">
                  <span><strong>{i.title}</strong>{i.dueOn && <><br /><span className="muted small">{fmt(i.dueOn)}</span>{i.dueOn < today && <span className="badge peach" style={{ marginInlineStart: "0.5rem" }}>{a.overdue}</span>}</>}</span>
                  <span className="row">
                    <form action={agendaStatusAction}>{hidden(i.id)}<input type="hidden" name="status" value="done" /><button className="btn btn-secondary btn-sm">{a.markDone}</button></form>
                    <form action={agendaRemoveAction}>{hidden(i.id)}<button className="btn btn-quiet btn-sm">{a.remove}</button></form>
                  </span>
                </li>))}</ul>
            )}
          </section>

          <section className="card stack" aria-labelledby="add">
            <h2 id="add">{a.addTitle}</h2>
            <form action={agendaAddAction} className="stack">
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="childId" value={child.id} />
              <div className="field"><label htmlFor="title">{a.taskTitle}</label><input id="title" name="title" className="input" maxLength={160} required /></div>
              <div className="field"><label htmlFor="dueOn">{a.due}</label><input id="dueOn" name="dueOn" type="date" className="input" /></div>
              <button className="btn btn-primary">{a.add}</button>
            </form>
          </section>

          <section className="card stack" aria-labelledby="paste">
            <h2 id="paste">{a.pasteTitle}</h2><p className="muted">{a.pasteHelp}</p>
            <form action={agendaProposeAction} className="stack">
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="childId" value={child.id} />
              <label className="sr-only" htmlFor="text">{a.pasteTitle}</label>
              <textarea id="text" name="text" className="input" rows={6} maxLength={8000} defaultValue={prefill} />
              <div className="row"><button className="btn btn-secondary">{a.find}</button><a className="btn btn-quiet btn-sm" href={`/${locale}/parent/uploads`}>{a.fromUpload}</a></div>
            </form>
          </section>

          {finished.length > 0 && (
            <section className="stack-sm" aria-labelledby="dn"><h2 id="dn">{a.done}</h2>
              <ul className="clean">{finished.map((i) => <li key={i.id} className="row between"><span>{i.title}{i.dueOn && <span className="muted small"> · {fmt(i.dueOn)}</span>}</span><form action={agendaStatusAction}>{hidden(i.id)}<input type="hidden" name="status" value="planned" /><button className="btn btn-quiet btn-sm">{a.undo}</button></form></li>)}</ul>
            </section>
          )}
          <p className="small muted">{a.noReminders}</p>
        </>
      )}
    </div>
  );
}
