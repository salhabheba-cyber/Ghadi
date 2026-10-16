"use client";
import { useActionState } from "react";
import type { PhoneState } from "@/app/[locale]/actions";
import { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/schemas";

type Action = (s: PhoneState, f: FormData) => Promise<PhoneState>;

/** Mobile-number sign-in: enter number → receive a 6-digit code → enter it. Works for new and returning parents. */
export function PhoneAuthForm({ locale, available, sendAction, verifyAction }: { locale: Locale; available: boolean; sendAction: Action; verifyAction: Action }) {
  const m = getMessages(locale).phoneAuth;
  const [sendState, send, sending] = useActionState(sendAction, {});
  const [verifyState, verify, verifying] = useActionState(verifyAction, {});
  const phone = verifyState.phone ?? sendState.phone;
  const showCode = Boolean(sendState.sent || verifyState.sent);
  const error = verifyState.error ?? sendState.error;
  const err = error ? (m.errors as Record<string, string>)[error] ?? m.errors.generic : null;

  if (!available) return <div className="alert info" role="note">{m.unavailable}</div>;
  return (
    <div className="stack">
      {err && <div className="alert error" role="alert">{err}</div>}
      {!showCode ? (
        <form action={send} className="stack" noValidate>
          <input type="hidden" name="locale" value={locale} />
          <div className="field">
            <label htmlFor="phone">{m.phone}</label>
            <input id="phone" name="phone" type="tel" inputMode="tel" className="input" autoComplete="tel" required dir="ltr" placeholder="+961 70 123 456" aria-describedby="phone-help" />
            <span id="phone-help" className="help">{m.phoneHelp}</span>
          </div>
          <button className="btn btn-primary" disabled={sending}>{sending ? getMessages(locale).common.loading : m.sendCode}</button>
        </form>
      ) : (
        <form action={verify} className="stack" noValidate>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="phone" value={phone ?? ""} />
          <p>{m.codeSent(phone ?? "")}</p>
          <div className="field">
            <label htmlFor="code">{m.code}</label>
            <input id="code" name="code" className="input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required dir="ltr" />
          </div>
          <button className="btn btn-primary" disabled={verifying}>{verifying ? getMessages(locale).common.loading : m.verify}</button>
        </form>
      )}
    </div>
  );
}
