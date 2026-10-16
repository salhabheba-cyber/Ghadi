"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/[locale]/actions";
import { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/schemas";

type ForgotState = FormState & { done?: boolean };

export function ForgotPasswordForm({ locale, action }: { locale: Locale; action: (s: ForgotState, f: FormData) => Promise<ForgotState> }) {
  const m = getMessages(locale);
  const [state, formAction, pending] = useActionState(action, {});
  const err = state.error ? (m.recovery.errors as Record<string, string>)[state.error] ?? m.recovery.errors.generic : null;
  if (state.done) return <div className="alert info" role="status"><strong>{m.recovery.sentTitle}</strong><br />{m.recovery.sentBody}</div>;
  return (
    <form action={formAction} className="stack" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {err && <div className="alert error" role="alert">{err}</div>}
      <p>{m.recovery.forgotBody}</p>
      <div className="field">
        <label htmlFor="email">{m.auth.email}</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required dir="ltr" />
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? m.common.loading : m.recovery.send}</button>
    </form>
  );
}

export function ResetPasswordForm({ locale, token, action }: { locale: Locale; token: string; action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const m = getMessages(locale);
  const [state, formAction, pending] = useActionState(action, {});
  const err = state.error ? (m.recovery.errors as Record<string, string>)[state.error] ?? m.recovery.errors.generic : null;
  return (
    <form action={formAction} className="stack" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      {err && <div className="alert error" role="alert">{err}</div>}
      <div className="field">
        <label htmlFor="password">{m.recovery.newPassword}</label>
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={10} maxLength={128} dir="ltr" aria-describedby="pw-help" />
        <span id="pw-help" className="help">{m.auth.passwordHelp}</span>
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? m.common.loading : m.recovery.saveNew}</button>
    </form>
  );
}
