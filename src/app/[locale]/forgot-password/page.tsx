import { ForgotPasswordForm } from "@/components/RecoveryForms";
import { getMessages } from "@/lib/i18n/messages";
import { mailAvailable } from "@/lib/providers/mail";
import { Locale } from "@/lib/schemas";
import { forgotPasswordAction } from "../actions";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = Locale.parse((await params).locale);
  const m = getMessages(locale);
  return (
    <div className="stack" style={{ maxWidth: "30rem", marginInline: "auto" }}>
      <h1>{m.recovery.forgotTitle}</h1>
      <div className="card">
        {mailAvailable() ? <ForgotPasswordForm locale={locale} action={forgotPasswordAction} /> : <div className="alert info" role="note">{m.recovery.errors.mailUnavailable}</div>}
      </div>
      <p><a href={`/${locale}/sign-in`}>{m.header.signIn}</a></p>
    </div>
  );
}
