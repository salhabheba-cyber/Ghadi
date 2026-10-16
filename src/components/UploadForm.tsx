"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/schemas";

export function UploadForm({ locale, kids }: { locale: Locale; kids: { id: string; displayName: string }[] }) {
  const m = getMessages(locale).uploads;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) { setErr(m.errors.bad_request); return; }
    if (file.size > 5 * 1024 * 1024) { setErr(m.errors.too_large); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.ok && body.id) { router.push(`/${locale}/parent/uploads/${body.id}`); return; }
      const table = m.errors as Record<string, string>;
      setErr(body.error === "subscription_required" ? m.subscription : (body.error && table[body.error]) || m.errors.internal);
    } catch { setErr(m.errors.internal); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="stack" encType="multipart/form-data">
      {err && <div className="alert error" role="alert">{err}</div>}
      <div className="field">
        <label htmlFor="file">{m.file}</label>
        <input id="file" name="file" type="file" accept="image/png,image/jpeg,application/pdf" className="input" required />
      </div>
      <div className="field">
        <label htmlFor="language">{m.language}</label>
        <select id="language" name="language" className="input" defaultValue={locale}>
          {(["en", "fr", "ar"] as const).map((l) => <option key={l} value={l}>{getMessages(locale).langNames[l]}</option>)}
        </select>
      </div>
      {kids.length > 0 && (
        <div className="field">
          <label htmlFor="childId">{m.child}</label>
          <select id="childId" name="childId" className="input" defaultValue={kids[0]!.id}>
            {kids.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
          </select>
        </div>
      )}
      <button className="btn btn-primary" disabled={busy}>{busy ? m.uploading : m.upload}</button>
    </form>
  );
}
