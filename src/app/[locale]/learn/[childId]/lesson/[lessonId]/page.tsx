import { notFound, redirect } from "next/navigation";
import { EntitlementError } from "@/lib/repo/billing";
import { TeacherSession } from "@/components/TeacherSession";
import { getChildAccess } from "@/lib/repo/children";
import { startSession } from "@/lib/repo/sessions";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";

export default async function LessonPage({ params }: { params: Promise<{ locale: string; childId: string; lessonId: string }> }) {
  const { locale: rawLocale, childId, lessonId } = await params;
  const locale = Locale.parse(rawLocale);
  const viewer = await requireParent(locale);
  const access = await getChildAccess(viewer.id, childId);
  if (!access) notFound();
  // Starting is idempotent: an unfinished session for the same lesson version is resumed.
  let view;
  try {
    view = await startSession(viewer.id, childId, lessonId);
  } catch (e) {
    if (e instanceof EntitlementError) redirect(`/${locale}/parent/billing?need=1`);
    throw e;
  }
  if (!view) notFound();
  return <TeacherSession initialView={view} locale={locale} homeHref={`/${locale}/learn/${childId}`} />;
}
