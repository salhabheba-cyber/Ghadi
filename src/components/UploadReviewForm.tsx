"use client";
import { useActionState } from "react";
import type { UploadReviewState } from "@/app/[locale]/actions";
import { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/schemas";

export function UploadReviewForm({ locale, uploadId, kids, initialText, lang, action, defaultTitle }: {
  locale: Locale; uploadId: string; kids: { id: string; displayName: string }[]; initialText: string; lang: "en" | "fr" | "ar"; defaultTitle: string;
  action: (s: UploadReviewState, f: FormData) => Promise<UploadReviewState>;
}) {
  const m = getMessages(locale).uploads;
  const [state, formAction, pending] = useActionState(action, {});
  if (state.created) return <div className="alert info" role="status">{m.created}</div>;
  const err = state.error ? (m.errors as Record<string, string>)[state.error] ?? m.errors.internal : null;
  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="uploadId" value={uploadId} />
      {err && <div className="alert error" role="alert">{err}</div>}
      <div className="field">
        <label htmlFor="title">{m.titleLabel}</label>
        <input id="title" name="title" className="input" maxLength={80} required defaultValue={defaultTitle} />
      </div>
      <div className="field">
        <label htmlFor="body">{m.bodyLabel}</label>
        <textarea id="body" name="body" className="input" rows={6} maxLength={600} required defaultValue={initialText} lang={lang} dir="auto" style={{ fontSize: "1.25rem" }} />
      </div>
      <div className="field">
        <label htmlFor="childId">{m.child}</label>
        <select id="childId" name="childId" className="input" required>
          {kids.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
        </select>
      </div>
      <label className="checkbox"><input type="checkbox" name="rights" required /><span>{m.rights}</span></label>
      <button className="btn btn-primary" disabled={pending}>{pending ? getMessages(locale).common.loading : m.create}</button>
    </form>
  );
}
