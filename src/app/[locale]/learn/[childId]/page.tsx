import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { getMessages } from "@/lib/i18n/messages";
import { getChildAccess } from "@/lib/repo/children";
import { listDomains, listLessonsForChild } from "@/lib/repo/curriculum";
import { findResumable } from "@/lib/repo/sessions";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";

export default async function StudentHome({ params, searchParams }: { params: Promise<{ locale: string; childId: string }>; searchParams: Promise<{ q?: string; domain?: string }> }) {
  const { locale: rawLocale, childId } = await params;
  const locale = Locale.parse(rawLocale);
  const viewer = await requireParent(locale);
  const access = await getChildAccess(viewer.id, childId);
  if (!access) notFound();
  const { child } = access;
  const m = getMessages(locale);
  const sp = await searchParams;
  const [lessons, domains, resume] = await Promise.all([
    listLessonsForChild(child, { q: sp.q?.slice(0, 60), domain: sp.domain?.slice(0, 60) }),
    listDomains(child),
    findResumable(viewer.id, child.id),
  ]);
  const base = `/${locale}/learn/${child.id}`;
  // "Your path today": the unfinished lesson first (if any), then the next lessons, three in total.
  const path = [...lessons].sort((a, b) => Number(b.lessonId === resume?.lessonId) - Number(a.lessonId === resume?.lessonId)).slice(0, 3);
  return (
    <div className="stack">
      <section className="sunrise-hero" aria-labelledby="hello">
        <h1 id="hello">{m.learn.hello(child.displayName)}</h1>
        <svg className="sun-art" width="120" height="60" viewBox="0 0 120 60" aria-hidden="true"><circle cx="90" cy="48" r="30" fill="#F7B955" /><circle cx="30" cy="52" r="18" fill="#FFF4EA" opacity="0.6" /></svg>
      </section>

      <section className="teacher-card" aria-label={m.session.ai}>
        <div className="teacher-card-avatar"><Avatar label={m.session.ai} /></div>
        <div className="stack-sm">
          <p className="teacher-card-say">{m.learn.intro}</p>
          <p className="small muted">{m.session.ai} {m.session.demo}</p>
        </div>
      </section>

      <section className="stack" aria-labelledby="path">
        <h2 id="path">{m.learn.pathTitle}</h2>
        <ol className="path">
          {path.map((p, i) => (
            <li key={p.lessonId}>
              <a className={`path-step${i === 0 ? " is-first" : ""}`} href={`${base}/lesson/${p.lessonId}`}>
                <span className="path-num" aria-hidden="true">{i + 1}</span>
                <span className="path-text">
                  <strong lang={p.language}>{p.title}</strong>
                  <span className="path-sub">{i === 0 && resume ? m.learn.continueTitle : p.unitTitle}</span>
                </span>
                <svg className="chev" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><path d="M10 6l9 8-9 8" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </a>
            </li>
          ))}
        </ol>
        {path.length === 0 && <p className="alert info">{m.learn.none}</p>}
      </section>

      <section className="stack" aria-labelledby="practice">
        <h2 id="practice">{m.practice.dictationTitle} · {m.practice.readingTitle}</h2>
        <div className="grid cols-2">
          <a className="path-step" href={`${base}/dictation`}><span className="path-text"><strong>{m.practice.tileDictation}</strong><span className="path-sub">{m.practice.dictationIntro}</span></span><svg className="chev" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><path d="M10 6l9 8-9 8" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></a>
          <a className="path-step" href={`${base}/reading`}><span className="path-text"><strong>{m.practice.tileReading}</strong><span className="path-sub">{m.practice.readingIntro}</span></span><svg className="chev" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><path d="M10 6l9 8-9 8" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></a>
        </div>
      </section>

      <section className="stack" aria-labelledby="lessons">
        <div className="row between">
          <h2 id="lessons">{m.learn.lessons}</h2>
          <a className="btn btn-sm btn-quiet" href={`/${locale}/parent/children/${child.id}`}>{m.learn.grownUps}</a>
        </div>
        <form method="get" className="row" role="search">
          <label className="sr-only" htmlFor="q">{m.learn.search}</label>
          <input id="q" name="q" className="input" style={{ maxWidth: "18rem" }} placeholder={m.learn.search} defaultValue={sp.q ?? ""} />
          <label className="sr-only" htmlFor="domain">{m.learn.all}</label>
          <select id="domain" name="domain" className="input" style={{ maxWidth: "14rem" }} defaultValue={sp.domain ?? ""}>
            <option value="">{m.learn.all}</option>
            {domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button className="btn btn-secondary">{m.learn.filter}</button>
        </form>
        {lessons.length === 0 ? <p className="alert info">{m.learn.none}</p> : (
          <div className="grid cols-2">
            {lessons.map((l) => (
              <article key={l.lessonId} className="card lesson-card">
                <h3 lang={l.language}>{l.title}</h3>
                <p className="meta">{l.unitTitle} · {m.learn.activities(l.activityCount)} · {m.ageBands[`${l.ageMin}-${l.ageMax}`] ?? `${l.ageMin}–${l.ageMax}`}</p>
                <ul className="clean small">{l.objectives.map((o) => <li key={o.code}>{o.description}</li>)}</ul>
                <details className="small muted">
                  <summary>{m.session.about}</summary>
                  <p>{m.learn.source}: {l.sourceTitle} ({l.jurisdiction}) · {m.learn.license}: {l.licenseName}</p>
                  <p>{l.alignmentNote}</p>
                </details>
                <div className="actions"><a className="btn btn-primary" href={`${base}/lesson/${l.lessonId}`}>{m.learn.start}</a></div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
