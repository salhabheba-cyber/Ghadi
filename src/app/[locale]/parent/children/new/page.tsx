import { ChildForm } from "@/components/ChildForm";
import { getMessages } from "@/lib/i18n/messages";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";
import { createChildAction } from "../../../actions";

export default async function NewChild({ params }: { params: Promise<{ locale: string }> }) {
  const locale = Locale.parse((await params).locale);
  await requireParent(locale);
  const m = getMessages(locale);
  return (
    <div className="stack" style={{ maxWidth: "42rem" }}>
      <h1>{m.childForm.newTitle}</h1>
      <div className="card">
        <ChildForm locale={locale} action={createChildAction} withConsent defaults={{ displayName: "", ageBand: "3-5", uiLocale: locale, lessonLanguage: locale, explanationLanguage: locale, sessionMinutes: 10 }} />
      </div>
    </div>
  );
}
