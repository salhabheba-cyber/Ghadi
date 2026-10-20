"use client";
import { NotebookPen, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { OriginBadge } from "@/components/origin-badge";
import { EmptyState, Input, Notice, PageHeader } from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import { getDb } from "@/lib/storage/db";
import { formatDate } from "@/lib/utils";

export default function NotesPage() {
  const { data: notes, error } = useLive(
    () => getDb().notes.orderBy("updatedAt").reverse().toArray(),
    [],
  );
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (notes ?? []).filter(
      (n) =>
        !t ||
        `${n.title} ${n.summary} ${n.keyConcepts.join(" ")} ${n.tags.join(" ")}`
          .toLowerCase()
          .includes(t),
    );
  }, [notes, q]);

  return (
    <>
      <PageHeader
        title="Study Notes"
        description="Structured notes generated from your documents, or written by you."
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="relative mb-4 max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]"
          aria-hidden
        />
        <Input
          aria-label="Search notes"
          placeholder="Search notes…"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {notes && notes.length === 0 ? (
        <EmptyState
          icon={<NotebookPen className="h-8 w-8" />}
          title="No notes yet"
          action={
            <Link href="/documents" className="text-brand-600 underline dark:text-brand-400">
              Add a document
            </Link>
          }
        >
          Import a document, then choose “Generate notes”.
        </EmptyState>
      ) : null}
      {notes && notes.length > 0 && shown.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No notes match “{q}”.</p>
      ) : null}
      <ul className="space-y-2">
        {shown.map((n) => (
          <li key={n.id}>
            <Link
              href={`/notes/${n.id}`}
              className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-brand-400"
            >
              <p className="font-medium">{n.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
                {n.summary || n.overview}
              </p>
              <p className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                <OriginBadge origin={n.origin} /> Updated {formatDate(n.updatedAt)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
