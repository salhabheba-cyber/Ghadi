"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/[locale]/actions";
import { getMessages } from "@/lib/i18n/messages";
import { LOCALES, type AgeBand, type Locale } from "@/lib/schemas";

export interface ChildDefaults {
  childId?: string; displayName: string; ageBand: AgeBand; uiLocale: Locale; lessonLanguage: Locale; explanationLanguage: Locale; sessionMinutes: number;
}

export function ChildForm({ locale, action, defaults, withConsent }: { locale: Locale; action: (s: FormState, f: FormData) => Promise<FormState>; defaults: ChildDefaults; withConsent: boolean }) {
  const m = getMessages(locale);
  const f = m.childForm;
  const [state, formAction, pending] = useActionState(action, {});
  const err = state.error ? (f.errors as Record<string, string>)[state.error] ?? f.errors.generic : null;
  const langSelect = (name: string, label: string, value: Locale) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} className="input" defaultValue={value}>
        {LOCALES.map((l) => <option key={l} value={l} lang={l}>{m.langNames[l]}</option>)}
      </select>
    </div>
  );
  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="locale" value={locale} />
      {defaults.childId && <input type="hidden" name="childId" value={defaults.childId} />}
      {err && <div className="alert error" role="alert">{err}</div>}
      <div className="field">
        <label htmlFor="displayName">{f.displayName}</label>
        <input id="displayName" name="displayName" className="input" defaultValue={defaults.displayName} required maxLength={40} aria-describedby="dn-help" autoComplete="off" />
        <span id="dn-help" className="help">{f.displayNameHelp}</span>
      </div>
      <div className="field">
        <label htmlFor="ageBand">{f.ageBand}</label>
        <select id="ageBand" name="ageBand" className="input" defaultValue={defaults.ageBand} aria-describedby="age-help">
          {(["3-5", "6-8", "9-12", "13-18"] as const).map((b) => <option key={b} value={b}>{m.ageBands[b]}</option>)}
        </select>
        <span id="age-help" className="help">{f.ageNote}</span>
      </div>
      <div className="grid cols-3">
        {langSelect("uiLocale", f.uiLocale, defaults.uiLocale)}
        {langSelect("lessonLanguage", f.lessonLanguage, defaults.lessonLanguage)}
        {langSelect("explanationLanguage", f.explanationLanguage, defaults.explanationLanguage)}
      </div>
      <div className="field">
        <label htmlFor="sessionMinutes">{f.sessionMinutes}</label>
        <input id="sessionMinutes" name="sessionMinutes" type="number" min={3} max={60} className="input" defaultValue={defaults.sessionMinutes} aria-describedby="sm-help" />
        <span id="sm-help" className="help">{f.sessionHelp}</span>
      </div>
      {withConsent && (
        <fieldset className="card mint" style={{ border: 0 }}>
          <legend><h2>{f.consentTitle}</h2></legend>
          <label className="checkbox"><input type="checkbox" name="consentLearning" required /><span>{f.consentLearningData}</span></label>
          <label className="checkbox"><input type="checkbox" name="consentAi" required /><span>{f.consentAi}</span></label>
          <label className="checkbox"><input type="checkbox" name="consentMic" /><span>{f.consentMic}</span></label>
          <p className="help">{f.draftNote}</p>
        </fieldset>
      )}
      <div><button className="btn btn-primary" disabled={pending}>{pending ? m.common.loading : withConsent ? f.create : f.saveChanges}</button></div>
    </form>
  );
}
