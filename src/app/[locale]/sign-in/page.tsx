import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { PhoneAuthForm } from "@/components/PhoneAuthForm";
import { phoneSignInAvailable } from "@/lib/providers/sms";
import { getMessages } from "@/lib/i18n/messages";
import { Locale } from "@/lib/schemas";
import { getViewer } from "@/lib/session";
import { signInAction, sendPhoneCodeAction, verifyPhoneCodeAction } from "../actions";

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ reset?: string; verify?: string }> }) {
  const locale = Locale.parse((await params).locale);
  const sp = await searchParams;
  if (await getViewer()) redirect(`/${locale}/parent`);
  const m = getMessages(locale);
  return (
    <div className="stack" style={{ maxWidth: "30rem", marginInline: "auto" }}>
      <h1>{m.auth.signInTitle}</h1>
      {sp.reset === "1" && <div className="alert info" role="status">{m.recovery.resetDone}</div>}
      {sp.verify === "1" && <div className="alert info" role="status">{m.recovery.verifyNotice}</div>}
      <div className="card stack">
        <h2>{m.phoneAuth.emailHeading}</h2>
        <AuthForm mode="in" locale={locale} action={signInAction} />
      </div>
      <p><a href={`/${locale}/forgot-password`}>{m.recovery.forgot}</a></p>
      <div className="card stack">
        <h2>{m.phoneAuth.phoneHeading}</h2>
        <PhoneAuthForm locale={locale} available={phoneSignInAvailable()} sendAction={sendPhoneCodeAction} verifyAction={verifyPhoneCodeAction} />
      </div>
      <p>{m.auth.noAccount} <a href={`/${locale}/sign-up`}>{m.header.signUp}</a></p>
    </div>
  );
}
