import { notFound } from "next/navigation";
import { ChildForm } from "@/components/ChildForm";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { getMessages } from "@/lib/i18n/messages";
import { getPool } from "@/lib/db";
import { getChildAccess } from "@/lib/repo/children";
import { getProgress } from "@/lib/repo/progress";
import { practiceSummary } from "@/lib/repo/practice";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";
import { deleteChildAction, deleteFamilyTextAction, deleteLearningAction, resetSkillAction, updateChildAction } from "../../../actions";

export default async function ChildDetail({ params }: { params: Promise<{ locale: string; childId: string }> }) {
  const { locale: rawLocale, childId } = await params;
  const locale = Locale.parse(rawLocale);
  const viewer = await requireParent(locale);
  const access = await getChildAccess(viewer.id, childId);
  if (!access) notFound();
  const { child } = access;
  const m = getMessages(locale);
  const d = m.detail;
  const progress = access.canViewProgress ? await getProgress(child.id) : null;
  const familyTexts = (await getPool().query<{ id: string; title: string; language: string }>("SELECT id, title, language FROM family_texts WHERE child_id=$1 ORDER BY created_at DESC", [child.id])).rows;
  const practice = access.canViewProgress ? await practiceSummary(viewer.id, child.id) : null;
  const consents = (await getPool().query<{ consent_type: string; granted: boolean; policy_version: string; recorded_at: Date }>(
    `SELECT DISTINCT ON (consent_type) consent_type, granted, policy_version, recorded_at FROM consent_records
      WHERE child_id=$1 ORDER BY consent_type, recorded_at DESC, id DESC`, [child.id])).rows;
  return (
    <div className="stack">
      <div className="row between">
        <h1>{child.displayName}</h1>
        <div className="row"><a className="btn btn-secondary" href={`/${locale}/parent/children/${child.id}/report`}>{m.report.link}</a><a className="btn btn-primary" href={`/${child.uiLocale}/learn/${child.id}`}>{m.parent.openLearning}</a></div>
      </div>

      {progress && (
        <section className="card stack" aria-labelledby="prog">
          <h2 id="prog">{d.progressTitle}</h2>
          <div className="grid cols-3">
            <div><strong>{progress.sessionsCompleted}</strong><div className="muted">{d.sessionsDone}</div></div>
            <div><strong>{progress.sessionsInProgress}</strong><div className="muted">{d.sessionsOpen}</div></div>
            <div><strong>{progress.totalAttempts}</strong><div className="muted">{d.attempts}</div></div>
          </div>
          {progress.skills.length === 0 ? <p className="alert info">{d.none}</p> : (
            <table className="simple">
              <caption className="sr-only">{d.skills}</caption>
              <thead><tr><th scope="col">{d.skills}</th><th scope="col">{d.estimate}</th><th scope="col"><span className="sr-only">{d.reset}</span></th></tr></thead>
              <tbody>
                {progress.skills.map((s) => (
                  <tr key={s.skillId}>
                    <td><strong>{s.name}</strong><div className="meta">{s.domain} · {d.evidence(s.evidenceCount)}</div></td>
                    <td><span className="badge">{d.labels[s.label]}</span></td>
                    <td>
                      <form action={resetSkillAction}>
                        <input type="hidden" name="locale" value={locale} /><input type="hidden" name="childId" value={child.id} /><input type="hidden" name="skillId" value={s.skillId} />
                        <button className="btn btn-sm btn-quiet" title={d.resetHelp}>{d.reset}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="alert warn">{d.limits}</p>
          {progress.recent.length > 0 && (
            <>
              <h3>{d.recent}</h3>
              <ul className="clean stack-sm">
                {progress.recent.map((r, i) => <li key={i}>{r.lessonTitle} — {r.correct ? d.right : d.notYet} <span className="meta">({r.phase.replace("_", " ")}, {r.at.toISOString().slice(0, 16).replace("T", " ")} UTC)</span></li>)}
              </ul>
            </>
          )}
          {progress.teacherModes.includes("demo") && <p className="meta">{d.demoTeacher}</p>}
        </section>
      )}

      {practice && (
        <section className="card stack" aria-labelledby="practice-hist">
          <h2 id="practice-hist">{m.practice.recent}</h2>
          {practice.dictation.length + practice.reading.length === 0 ? <p className="muted">{m.practice.noneYet}</p> : (
            <ul className="clean stack-sm">
              {practice.dictation.map((d, i) => <li key={`d${i}`}><strong>{m.practice.dictationTitle}</strong> · {d.title} · {Math.round(d.accuracy * 100)}% <span className="muted small">({new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d.created_at)})</span></li>)}
              {practice.reading.map((r, i) => <li key={`r${i}`}><strong>{m.practice.readingTitle}</strong> · {r.title} · {m.practice.readingSummary(r.word_marks.filter((x) => x.status === "ok").length, r.word_marks.filter((x) => x.status === "help").length, r.word_marks.filter((x) => x.status === "skipped").length)}</li>)}
            </ul>
          )}
          <p className="small muted">{m.practice.noSpeechNote}</p>
        </section>
      )}

      {familyTexts.length > 0 && (
        <section className="card stack" aria-labelledby="fam">
          <h2 id="fam">{m.uploads.title}</h2>
          <ul className="clean stack-sm">
            {familyTexts.map((t) => (
              <li key={t.id} className="row between">
                <span lang={t.language} dir="auto"><strong>{t.title}</strong></span>
                <form action={deleteFamilyTextAction}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="childId" value={child.id} /><input type="hidden" name="textId" value={t.id} /><button className="btn btn-quiet btn-sm">{m.common.delete}</button></form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack" aria-labelledby="settings">
        <h2 id="settings">{m.childForm.editTitle}</h2>
        {access.canManage && (
          <ChildForm locale={locale} action={updateChildAction} withConsent={false}
            defaults={{ childId: child.id, displayName: child.displayName, ageBand: child.ageBand, uiLocale: child.uiLocale, lessonLanguage: child.lessonLanguage, explanationLanguage: child.explanationLanguage, sessionMinutes: child.sessionMinutes }} />
        )}
      </section>

      <section className="card stack" aria-labelledby="privacy">
        <h2 id="privacy">{d.privacy}</h2>
        <h3>{d.consents}</h3>
        <ul className="clean stack-sm">
          {consents.map((c) => <li key={c.consent_type}>{c.consent_type.replaceAll("_", " ")}: <strong>{c.granted ? "✓" : "—"}</strong> <span className="meta">({c.policy_version})</span></li>)}
        </ul>
        <p className="meta">{d.micOffNote}</p>
        <div><a className="btn btn-secondary" href={`/api/children/${child.id}/export`} download>{d.export}</a></div>
        {access.canManage && (
          <>
            <div className="stack-sm">
              <p className="muted">{d.deleteLearningHelp}</p>
              <div><ConfirmDelete action={deleteLearningAction} hidden={{ locale, childId: child.id }} triggerLabel={d.deleteLearning} title={d.deleteLearning} body={d.deleteLearningHelp} confirmLabel={m.common.delete} cancelLabel={m.common.cancel} /></div>
            </div>
            <div><ConfirmDelete action={deleteChildAction} hidden={{ locale, childId: child.id }} triggerLabel={d.deleteProfile} title={d.deleteTitle} body={d.deleteBody} requireText={child.displayName} confirmLabel={d.confirmDelete} cancelLabel={m.common.cancel} className="btn btn-danger" /></div>
          </>
        )}
      </section>
    </div>
  );
}
