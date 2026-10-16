import { notFound } from "next/navigation";
import { DictationForm } from "@/components/PracticeForms";
import { getMessages } from "@/lib/i18n/messages";
import { getText } from "@/lib/repo/practice";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";
import { submitDictationAction } from "../../../../actions";

export default async function Page({ params }: { params: Promise<{ locale: string; childId: string; textId: string }> }) {
  const { locale: raw, childId, textId } = await params;
  const locale = Locale.parse(raw);
  const viewer = await requireParent(locale);
  const t = await getText(viewer.id, childId, textId, "dictation");
  if (!t) notFound();
  const m = getMessages(locale).practice;
  return (
    <div className="stack" style={{ maxWidth: "40rem" }}>
      <a href={`/${locale}/learn/${childId}/dictation`}>← {m.dictationTitle}</a>
      <h1 lang={t.language}>{t.title}</h1>
      {/* The sentence is NOT sent to the browser as visible text until after an attempt; the audio carries it. It is needed client-side for speech. */}
      <DictationForm locale={locale} childId={childId} textId={t.id} text={t.body} lang={t.language} backHref={`/${locale}/learn/${childId}/dictation`} action={submitDictationAction} />
    </div>
  );
}
