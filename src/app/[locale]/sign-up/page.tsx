import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { PhoneAuthForm } from "@/components/PhoneAuthForm";
import { phoneSignInAvailable } from "@/lib/providers/sms";
import { getMessages } from "@/lib/i18n/messages";
import { Locale } from "@/lib/schemas";
import { getViewer } from "@/lib/session";
import { signUpAction, sendPhoneCodeAction, verifyPhoneCodeAction } from "../actions";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = Locale.parse((await params).locale);
  if (await getViewer()) redirect(`/${locale}/parent`);
  const m = getMessages(locale);
  return (
    <div className="stack" style={{ maxWidth: "30rem", marginInline: "auto" }}>
      <h1>{m.auth.signUpTitle}</h1>
      <div className="alert info" role="note">{m.billing.trialPromise}</div>
      <div className="card stack">
        <h2>{m.phoneAuth.emailHeading}</h2>
        <AuthForm mode="up" locale={locale} action={signUpAction} />
      </div>
      <div className="card stack">
        <h2>{m.phoneAuth.phoneHeading}</h2>
        <PhoneAuthForm locale={locale} available={phoneSignInAvailable()} sendAction={sendPhoneCodeAction} verifyAction={verifyPhoneCodeAction} />
      </div>
      <p>{m.auth.haveAccount} <a href={`/${locale}/sign-in`}>{m.header.signIn}</a></p>
    </div>
  );
}
