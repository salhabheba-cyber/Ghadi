import { notFound } from "next/navigation";
import { getMessages } from "@/lib/i18n/messages";
import { listTexts } from "@/lib/repo/practice";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";

export default async function Page({ params }: { params: Promise<{ locale: string; childId: string }> }) {
  const { locale: raw, childId } = await params;
  const locale = Locale.parse(raw);
  const viewer = await requireParent(locale);
  const texts = await listTexts(viewer.id, childId, "dictation");
  if (!texts) notFound();
  const m = getMessages(locale).practice;
  const base = `/${locale}/learn/${childId}`;
  return (
    <div className="stack">
      <a href={base}>← {m.back}</a>
      <h1>{m.dictationTitle}</h1>
      {texts.length === 0 ? <p className="alert info">{m.noTexts}</p> : (
        <ol className="path">
          {texts.map((t, i) => (
            <li key={t.id}><a className={`path-step${i === 0 ? " is-first" : ""}`} href={`${base}/dictation/${t.id}`}>
              <span className="path-num" aria-hidden="true">{i + 1}</span>
              <span className="path-text"><strong lang={t.language}>{t.title}</strong><span className="path-sub">{m.open}</span></span>
            </a></li>
          ))}
        </ol>
      )}
    </div>
  );
}
