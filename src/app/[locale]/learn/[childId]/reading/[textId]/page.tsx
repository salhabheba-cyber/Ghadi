import { notFound } from "next/navigation";
import { ReadingForm } from "@/components/PracticeForms";
import { getMessages } from "@/lib/i18n/messages";
import { getText } from "@/lib/repo/practice";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";
import { submitReadingAction } from "../../../../actions";

export default async function Page({ params }: { params: Promise<{ locale: string; childId: string; textId: string }> }) {
  const { locale: raw, childId, textId } = await params;
  const locale = Locale.parse(raw);
  const viewer = await requireParent(locale);
  const t = await getText(viewer.id, childId, textId, "reading");
  if (!t) notFound();
  const m = getMessages(locale).practice;
  return (
    <div className="stack" style={{ maxWidth: "40rem" }}>
      <a href={`/${locale}/learn/${childId}/reading`}>← {m.readingTitle}</a>
      <h1 lang={t.language}>{t.title}</h1>
      <ReadingForm locale={locale} childId={childId} textId={t.id} text={t.body} lang={t.language} backHref={`/${locale}/learn/${childId}/reading`} action={submitReadingAction} />
    </div>
  );
}
