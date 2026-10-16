"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/[locale]/actions";
import { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/schemas";

export function AuthForm({ mode, locale, action }: { mode: "in" | "up"; locale: Locale; action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const m = getMessages(locale).auth;
  const [state, formAction, pending] = useActionState(action, {});
  const err = state.error ? (m.errors as Record<string, string>)[state.error] ?? m.errors.generic : null;
  return (
    <form action={formAction} className="stack" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {err && <div className="alert error" role="alert">{err}</div>}
      {mode === "up" && (
        <div className="field">
          <label htmlFor="name">{m.name}</label>
          <input id="name" name="name" className="input" autoComplete="name" required maxLength={80} />
        </div>
      )}
      <div className="field">
        <label htmlFor="email">{m.email}</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required dir="ltr" />
      </div>
      <div className="field">
        <label htmlFor="password">{m.password}</label>
        <input id="password" name="password" type="password" className="input" autoComplete={mode === "up" ? "new-password" : "current-password"} required minLength={10} maxLength={128} aria-describedby="pw-help" dir="ltr" />
        {mode === "up" && <span id="pw-help" className="help">{m.passwordHelp}</span>}
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? getMessages(locale).common.loading : mode === "up" ? m.signUpBtn : m.signInBtn}</button>
    </form>
  );
}
