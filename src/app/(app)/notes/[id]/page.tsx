"use client";
import { ArrowLeft, Copy, Download, Pencil, Printer, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { OriginBadge } from "@/components/origin-badge";
import { PlainText } from "@/components/plain-text";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Notice,
  PageHeader,
  Textarea,
  useConfirm,
  useToast,
} from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import { downloadText, noteToMarkdown, safeFileName } from "@/lib/export";
import { deleteNote, duplicateNote, getNote, saveNote } from "@/lib/storage/repo";
import { errorMessage } from "@/lib/utils";
import type { Note } from "@/lib/validation/schemas";

function ProvenanceTag({ p }: { p: "extracted" | "generated" | "user" }) {
  return (
    <Badge tone={p === "extracted" ? "good" : p === "generated" ? "warn" : "brand"}>
      {p === "extracted" ? "From your text" : p === "generated" ? "Model-written" : "Yours"}
    </Badge>
  );
}

export default function NotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const { data: note, loading } = useLive(() => getNote(id), [id]);
  const [editing, setEditing] = useState(false);
  const [draftState, setDraft] = useState<Note | null>(null);

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  if (!note)
    return (
      <EmptyState
        title="Note not found"
        action={
          <Link href="/notes" className="text-brand-600 underline dark:text-brand-400">
            Back to notes
          </Link>
        }
      >
        It may have been deleted.
      </EmptyState>
    );

  async function save() {
    if (!draft) return;
    try {
      await saveNote({ ...draft, origin: draft.origin === "manual" ? "manual" : draft.origin });
      setEditing(false);
      setDraft(null);
      toast("Note saved.", "good");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function toggleCheck(itemId: string) {
    if (!note) return;
    await saveNote({
      ...note,
      checklist: note.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)),
    });
  }
  async function remove() {
    const ok = await confirm({
      title: "Delete note?",
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok || !note) return;
    await deleteNote(note.id);
    router.push("/notes");
  }
  async function duplicate() {
    if (!note) return;
    try {
      const c = await duplicateNote(note.id);
      toast("Duplicated.", "good");
      router.push(`/notes/${c.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  const draft = draftState ?? note;
  const view = editing ? draft : note;

  return (
    <>
      <Link
        href="/notes"
        className="no-print mb-3 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Study notes
      </Link>
      <PageHeader
        title={editing ? "Editing note" : view.title}
        description={undefined}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button onClick={() => void save()}>
                  <Save className="h-4 w-4" aria-hidden /> Save
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraft(null);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraft(note);
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-4 w-4" aria-hidden /> Edit
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadText(
                      safeFileName(note.title, "md"),
                      noteToMarkdown(note),
                      "text/markdown",
                    )
                  }
                >
                  <Download className="h-4 w-4" aria-hidden /> Markdown
                </Button>
                <Button variant="secondary" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" aria-hidden /> Print
                </Button>
                <Button variant="secondary" onClick={() => void duplicate()}>
                  <Copy className="h-4 w-4" aria-hidden /> Duplicate
                </Button>
                <Button variant="secondary" onClick={() => void remove()}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </Button>
              </>
            )}
          </div>
        }
      />
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm">
          <OriginBadge origin={view.origin} />{" "}
          {view.documentId ? (
            <Link
              className="text-brand-600 underline dark:text-brand-400"
              href={`/documents/${view.documentId}`}
            >
              Source document
            </Link>
          ) : null}
        </p>
        {view.notices.map((n) => (
          <Notice key={n} tone="warn">
            {n}
          </Notice>
        ))}

        {editing ? (
          <Card className="space-y-3">
            <label className="block text-sm font-medium">
              Title
              <Input
                className="mt-1"
                value={draft.title}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              Overview
              <Textarea
                className="mt-1"
                rows={3}
                value={draft.overview}
                onChange={(e) => setDraft({ ...draft, overview: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              Summary
              <Textarea
                className="mt-1"
                rows={6}
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              Tags (comma separated)
              <Input
                className="mt-1"
                value={draft.tags.join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 30),
                  })
                }
              />
            </label>
            <h2 className="pt-2 font-semibold">Sections</h2>
            {draft.sections.map((s, i) => (
              <div key={s.id} className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                <Input
                  aria-label={`Section ${i + 1} heading`}
                  value={s.heading}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      sections: draft.sections.map((x) =>
                        x.id === s.id ? { ...x, heading: e.target.value, provenance: "user" } : x,
                      ),
                    })
                  }
                />
                <Textarea
                  aria-label={`Section ${i + 1} text`}
                  rows={4}
                  value={s.body}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      sections: draft.sections.map((x) =>
                        x.id === s.id ? { ...x, body: e.target.value, provenance: "user" } : x,
                      ),
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({ ...draft, sections: draft.sections.filter((x) => x.id !== s.id) })
                  }
                >
                  Remove section
                </Button>
              </div>
            ))}
          </Card>
        ) : (
          <>
            {view.overview ? (
              <Card>
                <h2 className="mb-1 font-semibold">Overview</h2>
                <PlainText text={view.overview} />
              </Card>
            ) : null}
            {view.summary ? (
              <Card>
                <h2 className="mb-1 font-semibold">Summary</h2>
                <PlainText text={view.summary} />
              </Card>
            ) : null}
            {view.keyConcepts.length > 0 ? (
              <Card>
                <h2 className="mb-2 font-semibold">Key concepts</h2>
                <ul className="flex flex-wrap gap-2">
                  {view.keyConcepts.map((k) => (
                    <li key={k}>
                      <Badge tone="brand">{k}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {view.definitions.length > 0 ? (
              <Card>
                <h2 className="mb-2 font-semibold">Definitions</h2>
                <dl className="space-y-3">
                  {view.definitions.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-lg border-l-4 border-brand-500 bg-[var(--surface-2)] p-3"
                    >
                      <dt className="flex items-center gap-2 font-medium">
                        {d.term} <ProvenanceTag p={d.provenance} />
                      </dt>
                      <dd className="mt-1 text-sm">{d.definition}</dd>
                      {d.sourceExcerpt ? (
                        <dd className="mt-1 text-xs italic text-[var(--muted)]">
                          “{d.sourceExcerpt}”
                        </dd>
                      ) : null}
                    </div>
                  ))}
                </dl>
              </Card>
            ) : null}
            {view.sections.map((s) => (
              <Card key={s.id}>
                <details open>
                  <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                    {s.heading} <ProvenanceTag p={s.provenance} />
                  </summary>
                  <div className="mt-2">
                    <PlainText text={s.body} />
                  </div>
                </details>
              </Card>
            ))}
            {view.facts.length > 0 ? (
              <Card>
                <h2 className="mb-2 font-semibold">Dates and formulas</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {view.facts.map((f) => (
                    <li key={f.id}>
                      <strong>{f.value}</strong>
                      {f.context ? (
                        <span className="text-[var(--muted)]"> — {f.context}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {view.examples.length > 0 ? (
              <Card>
                <h2 className="mb-2 font-semibold">Examples</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {view.examples.map((e) => (
                    <li key={e.id}>{e.text}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {view.relationships.length > 0 ? (
              <Card>
                <h2 className="mb-2 font-semibold">Related ideas</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {view.relationships.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {view.checklist.length > 0 ? (
              <Card>
                <h2 className="mb-2 font-semibold">Review checklist</h2>
                <ul className="space-y-1">
                  {view.checklist.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={c.done}
                          onChange={() => void toggleCheck(c.id)}
                        />{" "}
                        <span className={c.done ? "line-through opacity-60" : ""}>{c.text}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
