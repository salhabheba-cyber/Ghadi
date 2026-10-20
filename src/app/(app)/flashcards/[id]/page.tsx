"use client";
import { ArrowLeft, Copy, Download, Pencil, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { StudySession } from "@/components/flashcards/session";
import { SessionSummary } from "@/components/flashcards/summary";
import { OriginBadge } from "@/components/origin-badge";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Textarea,
  useConfirm,
  useToast,
} from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import { deckToCsv, deckToMarkdown, downloadText, safeFileName } from "@/lib/export";
import { getDb } from "@/lib/storage/db";
import {
  addCards,
  deleteCard,
  deleteDeck,
  duplicateDeck,
  getDeck,
  saveCard,
  saveDeck,
} from "@/lib/storage/repo";
import { describeInterval } from "@/lib/study/srs";
import { errorMessage } from "@/lib/utils";
import type { Card as CardT } from "@/lib/validation/schemas";

export default function DeckPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const { data: deck, loading } = useLive(() => getDeck(id), [id]);
  const { data: cards } = useLive(() => getDb().cards.where("deckId").equals(id).toArray(), [id]);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [editing, setEditing] = useState<CardT | null>(null);
  const [session, setSession] = useState<CardT[] | null>(null);
  const [summary, setSummary] = useState<{
    reviewed: number;
    known: number;
    difficult: number;
    forgotten: number;
  } | null>(null);

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  if (!deck)
    return (
      <EmptyState
        title="Deck not found"
        action={
          <Link href="/flashcards" className="text-brand-600 underline dark:text-brand-400">
            Back to flashcards
          </Link>
        }
      >
        It may have been deleted.
      </EmptyState>
    );

  const nowIsoStr = new Date().toISOString();
  const all = cards ?? [];
  const due = all.filter((c) => c.schedule.dueAt <= nowIsoStr);

  if (session)
    return (
      <>
        <PageHeader title={deck.title} />
        <StudySession
          cards={session}
          onDone={(s) => {
            setSession(null);
            setSummary(s);
          }}
        />
      </>
    );
  if (summary)
    return (
      <>
        <PageHeader title={deck.title} />
        <SessionSummary {...summary}>
          <Button onClick={() => setSummary(null)}>Back to deck</Button>
        </SessionSummary>
      </>
    );

  async function add() {
    if (!deck) return;
    try {
      await addCards(deck.id, [{ front: front.trim(), back: back.trim(), origin: "manual" }]);
      setFront("");
      setBack("");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function saveEdit() {
    if (!editing) return;
    try {
      await saveCard({ ...editing, origin: "manual" });
      setEditing(null);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function removeDeck() {
    if (!deck) return;
    const ok = await confirm({
      title: "Delete deck?",
      message: "The deck, its cards and review history will be removed.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await deleteDeck(deck.id);
    router.push("/flashcards");
  }

  return (
    <>
      <Link
        href="/flashcards"
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Flashcards
      </Link>
      <PageHeader
        title={deck.title}
        description={`${all.length} cards · ${due.length} due now`}
        actions={
          <>
            <Button disabled={due.length === 0} onClick={() => setSession(due)}>
              <Play className="h-4 w-4" aria-hidden /> Study due ({due.length})
            </Button>
            <Button variant="secondary" disabled={all.length === 0} onClick={() => setSession(all)}>
              Study all
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                downloadText(safeFileName(deck.title, "csv"), deckToCsv(all), "text/csv")
              }
            >
              <Download className="h-4 w-4" aria-hidden /> CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                downloadText(
                  safeFileName(deck.title, "md"),
                  deckToMarkdown(deck, all),
                  "text/markdown",
                )
              }
            >
              Markdown
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void duplicateDeck(deck.id)
                  .then((d) => router.push(`/flashcards/${d.id}`))
                  .catch((e) => toast(errorMessage(e), "error"))
              }
            >
              <Copy className="h-4 w-4" aria-hidden /> Duplicate
            </Button>
            <Button variant="secondary" onClick={() => void removeDeck()}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm">
          <OriginBadge origin={deck.origin} />{" "}
          {deck.documentId ? (
            <Link
              className="text-brand-600 underline dark:text-brand-400"
              href={`/documents/${deck.documentId}`}
            >
              Source document
            </Link>
          ) : null}
        </p>
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
            className="space-y-3"
          >
            <h2 className="font-semibold">Add a card</h2>
            <Field label="Front (question)">
              {(fid) => (
                <Input
                  id={fid}
                  required
                  value={front}
                  maxLength={2000}
                  onChange={(e) => setFront(e.target.value)}
                />
              )}
            </Field>
            <Field label="Back (answer)">
              {(fid) => (
                <Textarea
                  id={fid}
                  required
                  rows={2}
                  value={back}
                  maxLength={4000}
                  onChange={(e) => setBack(e.target.value)}
                />
              )}
            </Field>
            <Button type="submit" disabled={!front.trim() || !back.trim()}>
              <Plus className="h-4 w-4" aria-hidden /> Add card
            </Button>
          </form>
        </Card>

        {all.length === 0 ? (
          <EmptyState title="This deck is empty">Add your first card above.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {all.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                {editing?.id === c.id ? (
                  <div className="space-y-2">
                    <Input
                      aria-label="Front"
                      value={editing.front}
                      onChange={(e) => setEditing({ ...editing, front: e.target.value })}
                    />
                    <Textarea
                      aria-label="Back"
                      rows={2}
                      value={editing.back}
                      onChange={(e) => setEditing({ ...editing, back: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void saveEdit()}>
                        Save
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium" dir="auto">
                        {c.front}
                      </p>
                      <p
                        className="mt-1 whitespace-pre-line text-sm text-[var(--muted)]"
                        dir="auto"
                      >
                        {c.back}
                      </p>
                      <p className="mt-2 flex gap-2 text-xs text-[var(--muted)]">
                        <Badge>
                          {c.schedule.repetitions === 0
                            ? "new"
                            : `every ${describeInterval(c.schedule.intervalDays)}`}
                        </Badge>
                        {c.schedule.dueAt <= nowIsoStr ? <Badge tone="warn">due</Badge> : null}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Edit card"
                        onClick={() => setEditing(c)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Delete card"
                        onClick={() => void deleteCard(c.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Field label="Deck name">
          {(fid) => (
            <Input
              id={fid}
              defaultValue={deck.title}
              key={deck.title}
              maxLength={200}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== deck.title) void saveDeck({ ...deck, title: v });
              }}
            />
          )}
        </Field>
      </div>
    </>
  );
}
