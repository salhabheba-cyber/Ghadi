import { UploadForm } from "@/components/UploadForm";
import { getMessages } from "@/lib/i18n/messages";
import { listChildren } from "@/lib/repo/children";
import { listUploads } from "@/lib/repo/uploads";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = Locale.parse((await params).locale);
  const viewer = await requireParent(locale);
  const m = getMessages(locale);
  const [uploads, children] = await Promise.all([listUploads(viewer.id), listChildren(viewer.id)]);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="stack" style={{ maxWidth: "42rem" }}>
      <a href={`/${locale}/parent`}>← {m.common.back}</a>
      <h1>{m.uploads.title}</h1>
      <p>{m.uploads.intro}</p>
      <div className="alert info" role="note">{m.uploads.privacyNote}</div>
      {children.length === 0 ? <div className="alert warn">{m.parent.noChildrenBody}</div> : (
        <div className="card"><UploadForm locale={locale} kids={children.map((c) => ({ id: c.id, displayName: c.displayName }))} /></div>
      )}
      {uploads.length === 0 ? <p className="muted">{m.uploads.none}</p> : (
        <ul className="clean stack-sm">
          {uploads.map((u) => (
            <li key={u.id} className="card row between">
              <div><strong>{u.originalName}</strong><br /><span className="muted small">{fmt.format(u.createdAt)} · {m.uploads.status[u.status]}</span></div>
              <a className="btn btn-secondary btn-sm" href={`/${locale}/parent/uploads/${u.id}`}>{m.uploads.open}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
