import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { UploadReviewForm } from "@/components/UploadReviewForm";
import { getMessages } from "@/lib/i18n/messages";
import { ocrAvailable } from "@/lib/providers/ocr";
import { listChildren } from "@/lib/repo/children";
import { getUpload } from "@/lib/repo/uploads";
import { Locale } from "@/lib/schemas";
import { requireParent } from "@/lib/session";
import { confirmUploadAction, deleteUploadAction, retryUploadAction } from "../../../actions";

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = Locale.parse(raw);
  const viewer = await requireParent(locale);
  const up = await getUpload(viewer.id, id);
  if (!up) notFound();
  const m = getMessages(locale);
  const u = m.uploads;
  const children = (await listChildren(viewer.id)).map((c) => ({ id: c.id, displayName: c.displayName }));
  const note = up.errorCode === "ocr_language_unsupported" ? u.ocrLang : up.errorCode === "stalled" ? u.stalled : up.errorCode === "ocr_failed" ? u.ocrFailed : !up.provider && up.status === "needs_review" && !ocrAvailable() ? u.ocrOff : null;
  return (
    <div className="stack" style={{ maxWidth: "42rem" }}>
      <a href={`/${locale}/parent/uploads`}>← {u.back}</a>
      <h1>{up.originalName}</h1>
      <p><span className="badge">{u.status[up.status]}</span></p>
      {up.status === "processing" && <><AutoRefresh /><p role="status">{u.status.processing}</p></>}
      {note && <div className="alert warn" role="note">{note}</div>}
      {(up.status === "failed" || up.status === "processing") && (
        <form action={retryUploadAction}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="uploadId" value={up.id} /><button className="btn btn-secondary">{u.retry}</button></form>
      )}
      <section className="stack-sm" aria-labelledby="prev">
        <h2 id="prev">{u.preview}</h2>
        {up.mime === "application/pdf"
          ? <p className="muted">{u.pdfNote}</p>
          /* eslint-disable-next-line @next/next/no-img-element -- private, authenticated route; next/image optimisation does not apply */
          : <img src={`/api/uploads/${up.id}/file`} alt={up.originalName} style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid var(--line)" }} />}
      </section>
      {up.status === "needs_review" && (
        <section className="card stack" aria-labelledby="rev">
          <h2 id="rev">{u.reviewTitle}</h2>
          <p>{u.reviewHelp}</p>
          {up.meanConfidence !== null && <p className="muted small">{u.confidence(Math.round(up.meanConfidence))}</p>}
          {up.uncertainWords.length > 0 && <p><strong>{u.unsure}:</strong> <span lang={up.language} dir="auto">{up.uncertainWords.join(" · ")}</span></p>}
          {children.length === 0 ? <div className="alert warn">{m.parent.noChildrenBody}</div> : (
            <UploadReviewForm locale={locale} uploadId={up.id} kids={children} initialText={up.text} lang={up.language} defaultTitle={up.originalName.replace(/\.[^.]+$/, "").slice(0, 80)} action={confirmUploadAction} />
          )}
        </section>
      )}
      {up.text && <a className="btn btn-secondary" href={`/${locale}/parent/agenda?fromUpload=${up.id}`}>{m.agenda.pasteTitle}</a>}
      <form action={deleteUploadAction}>
        <input type="hidden" name="locale" value={locale} /><input type="hidden" name="uploadId" value={up.id} />
        <button className="btn btn-quiet">{u.delete}</button>
      </form>
    </div>
  );
}
