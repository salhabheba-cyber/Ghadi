"use client";
import { FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Importer } from "@/components/documents/importer";
import {
  Badge,
  Button,
  EmptyState,
  Notice,
  PageHeader,
  useConfirm,
  useToast,
} from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import { getDb } from "@/lib/storage/db";
import { deleteDocument } from "@/lib/storage/repo";
import { errorMessage, formatDate } from "@/lib/utils";

export default function DocumentsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const {
    data: docs,
    loading,
    error,
  } = useLive(() => getDb().documents.orderBy("createdAt").reverse().toArray(), []);

  async function remove(id: string, title: string) {
    const ok = await confirm({
      title: "Delete document?",
      message: `“${title}” will be removed from this device. Notes, quizzes and decks made from it are kept.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDocument(id);
      toast("Document deleted.", "good");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Documents"
        description="Import the material you want to study. Text is extracted on your device."
      />
      <Importer onImported={(id) => router.push(`/documents/${id}`)} />

      <h2 className="mb-3 mt-8 text-lg font-semibold">Your documents</h2>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {docs && docs.length === 0 ? (
        <EmptyState icon={<FileText className="h-8 w-8" />} title="No documents yet">
          Upload a file, paste some text or import a web page above to get started.
        </EmptyState>
      ) : null}
      <ul className="space-y-2">
        {docs?.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <Link href={`/documents/${d.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium">{d.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <Badge>{d.kind.toUpperCase()}</Badge>
                {d.wordCount.toLocaleString()} words · {formatDate(d.createdAt)}
                {d.status !== "ready" ? (
                  <Badge tone="warn">{d.status === "empty" ? "No text" : "Needs OCR"}</Badge>
                ) : null}
              </p>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${d.title}`}
              onClick={() => void remove(d.id, d.title)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
