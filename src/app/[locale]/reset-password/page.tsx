import { ResetPasswordForm } from "@/components/RecoveryForms";
import { getMessages } from "@/lib/i18n/messages";
import { Locale } from "@/lib/schemas";
import { resetPasswordAction } from "../actions";

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string; error?: string }> }) {
  const locale = Locale.parse((await params).locale);
  const { token, error } = await searchParams;
  const m = getMessages(locale);
  return (
    <div className="stack" style={{ maxWidth: "30rem", marginInline: "auto" }}>
      <h1>{m.recovery.resetTitle}</h1>
      <div className="card">
        {token && !error ? <ResetPasswordForm locale={locale} token={token} action={resetPasswordAction} /> : <div className="alert error" role="alert">{m.recovery.errors.invalidToken}</div>}
      </div>
      <p><a href={`/${locale}/forgot-password`}>{m.recovery.forgot}</a></p>
    </div>
  );
}
