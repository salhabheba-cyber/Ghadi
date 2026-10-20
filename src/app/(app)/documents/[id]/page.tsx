"use client";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { GeneratePanel } from "@/components/documents/generate-panel";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  useConfirm,
  useToast,
} from "@/components/ui/primitives";
import { PlainText } from "@/components/plain-text";
import { useLive } from "@/hooks/use-live";
import { deleteDocument, getDocument, saveDocument } from "@/lib/storage/repo";
import { errorMessage, formatBytes, formatDate } from "@/lib/utils";

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const { data: doc, loading } = useLive(() => getDocument(id), [id]);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  if (!doc)
    return (
      <EmptyState
        title="Document not found"
        action={
          <Link href="/documents" className="text-brand-600 underline dark:text-brand-400">
            Back to documents
          </Link>
        }
      >
        It may have been deleted.
      </EmptyState>
    );

  const title = titleDraft ?? doc.title;
  async function rename() {
    if (!doc || title.trim() === doc.title || !title.trim()) {
      setTitleDraft(null);
      return;
    }
    try {
      await saveDocument({ ...doc, title: title.trim() });
      setTitleDraft(null);
      toast("Renamed.", "good");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function remove() {
    if (!doc) return;
    const ok = await confirm({
      title: "Delete document?",
      message: "This removes the document from this device. Material made from it is kept.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await deleteDocument(doc.id);
    router.push("/documents");
  }

  return (
    <>
      <Link
        href="/documents"
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Documents
      </Link>
      <PageHeader
        title={doc.title}
        description={`${doc.kind.toUpperCase()} · ${doc.wordCount.toLocaleString()} words${doc.pageCount ? ` · ${doc.pageCount} pages` : ""}${doc.sizeBytes ? ` · ${formatBytes(doc.sizeBytes)}` : ""} · added ${formatDate(doc.createdAt)}`}
        actions={
          <Button variant="secondary" onClick={() => void remove()}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete
          </Button>
        }
      />
      <div className="space-y-4">
        {doc.warnings.map((w) => (
          <Notice key={w} tone="warn">
            {w}
          </Notice>
        ))}
        <GeneratePanel doc={doc} />
        <Card className="space-y-3">
          <Field label="Title">
            {(fid) => (
              <Input
                id={fid}
                value={title}
                maxLength={200}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void rename()}
              />
            )}
          </Field>
          {doc.sourceUrl ? (
            <p className="text-sm text-[var(--muted)]">
              Source: <span className="break-all">{doc.sourceUrl}</span>
            </p>
          ) : null}
          <p className="flex gap-2 text-xs">
            <Badge>{doc.extractionMethod}</Badge>
            {doc.extractionMethod === "ocr" ? (
              <Badge tone="warn">may contain OCR errors</Badge>
            ) : null}
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Extracted text</h2>
          {doc.text ? (
            <div
              className="max-h-[32rem] overflow-auto"
              tabIndex={0}
              role="region"
              aria-label="Extracted text"
            >
              <PlainText text={doc.text} />
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">No text.</p>
          )}
        </Card>
      </div>
    </>
  );
}
