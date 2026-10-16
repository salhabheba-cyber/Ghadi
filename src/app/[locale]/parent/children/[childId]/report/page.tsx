import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { getMessages } from "@/lib/i18n/messages";
import { getChildAccess } from "@/lib/repo/children";
import { practiceSummary } from "@/lib/repo/practice";
import { getReportData } from "@/lib/repo/progress";
import { findResumable } from "@/lib/repo/sessions";
import { recommend, type RecReason } from "@/lib/teaching/recommend";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";

export const metadata = { title: "Progress report" };

export default async function ReportPage({ params }: { params: Promise<{ locale: string; childId: string }> }) {
  const { locale: raw, childId } = await params;
  const locale = Locale.parse(raw);
  const viewer = await requireParent(locale);
  const access = await getChildAccess(viewer.id, childId);
  if (!access?.canViewProgress) notFound();
  const m = getMessages(locale), r = m.report, d = m.detail;
  const [data, practice, resume] = await Promise.all([getReportData(childId), practiceSummary(viewer.id, childId), findResumable(viewer.id, childId)]);
  const recs = recommend({
    skills: data.progress.skills.map((s) => ({ skillId: s.skillId, name: s.name, label: s.label, estimate: s.estimate, evidenceCount: s.evidenceCount, lastPracticed: s.lastPracticed })),
    prerequisites: data.prerequisites, skillNames: data.skillNames, resumeLesson: resume?.title ?? null,
  });
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const why = (x: RecReason) => x.code === "few_answers" ? r.reasons.few_answers(x.evidenceCount) : x.code === "needs_practice" ? r.reasons.needs_practice(x.estimatePct, x.evidenceCount)
    : x.code === "review_due" ? r.reasons.review_due(x.daysSince) : x.code === "prerequisite" ? r.reasons.prerequisite(x.prerequisiteName) : r.reasons.continue_lesson();
  return (
    <div className="stack report" style={{ maxWidth: "46rem" }}>
      <div className="row between no-print">
        <a href={`/${locale}/parent/children/${childId}`}>← {r.back}</a>
        <PrintButton label={r.print} />
      </div>
      <h1>{r.title(access.child.displayName)}</h1>
      <p className="muted">{r.generated(fmt.format(new Date()))} · GHADI</p>

      <section className="stack-sm" aria-labelledby="l"><h2 id="l">{r.lessons}</h2>
        {data.lessonsCompleted.length === 0 ? <p className="muted">{r.noLessons}</p> : <ul className="clean">{data.lessonsCompleted.map((l, i) => <li key={i}>{l.title} <span className="muted small">({fmt.format(l.endedAt)})</span></li>)}</ul>}
      </section>

      <section className="stack-sm" aria-labelledby="s"><h2 id="s">{r.skills}</h2>
        {data.progress.skills.length === 0 ? <p className="muted">{r.noSkills}</p> : (
          <table className="simple"><thead><tr><th scope="col">{r.skills}</th><th scope="col">{r.estimateCol}</th><th scope="col">{r.answersCol}</th></tr></thead>
            <tbody>{data.progress.skills.map((s) => <tr key={s.skillId}><td><strong>{s.name}</strong></td><td>{d.labels[s.label]}</td><td>{s.evidenceCount}</td></tr>)}</tbody></table>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="p"><h2 id="p">{r.practice}</h2>
        {!practice || practice.dictation.length + practice.reading.length === 0 ? <p className="muted">{m.practice.noneYet}</p> : (
          <ul className="clean">
            {practice.dictation.map((x, i) => <li key={`d${i}`}>{m.practice.dictationTitle}: {x.title} — {Math.round(x.accuracy * 100)}%</li>)}
            {practice.reading.map((x, i) => <li key={`r${i}`}>{m.practice.readingTitle}: {x.title} — {m.practice.readingSummary(x.word_marks.filter((w) => w.status === "ok").length, x.word_marks.filter((w) => w.status === "help").length, x.word_marks.filter((w) => w.status === "skipped").length)}</li>)}
          </ul>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="n"><h2 id="n">{r.nextSteps}</h2>
        {recs.length === 0 ? <p className="muted">{r.noNext}</p> : (
          <ul className="clean stack-sm">{recs.map((x, i) => <li key={i} className="card"><span className="badge">{r.kinds[x.reason.code]}</span> <strong>{x.skillName}</strong><p className="small muted" style={{ margin: 0 }}>{r.why}: {why(x.reason)}</p></li>)}</ul>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="t"><h2 id="t">{r.teacherNotes}</h2><p className="muted">{r.teacherNotesNone}</p></section>

      <section className="alert warn stack-sm" aria-labelledby="lim"><h2 id="lim">{r.limitsTitle}</h2>
        <ul>{r.limits.map((x) => <li key={x}>{x}</li>)}</ul></section>
    </div>
  );
}
