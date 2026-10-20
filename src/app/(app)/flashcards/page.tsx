"use client";
import { Layers, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OriginBadge } from "@/components/origin-badge";
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  useToast,
} from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import { getDb } from "@/lib/storage/db";
import { saveDeck } from "@/lib/storage/repo";
import { errorMessage, newId, nowIso } from "@/lib/utils";

export default function FlashcardsPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, error } = useLive(async () => {
    const db = getDb();
    const [decks, cards] = await Promise.all([
      db.decks.orderBy("updatedAt").reverse().toArray(),
      db.cards.toArray(),
    ]);
    const now = new Date().toISOString();
    const stats = new Map<string, { total: number; due: number }>();
    for (const c of cards) {
      const s = stats.get(c.deckId) ?? { total: 0, due: 0 };
      s.total += 1;
      if (c.schedule.dueAt <= now) s.due += 1;
      stats.set(c.deckId, s);
    }
    return { decks, stats };
  }, []);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  async function create() {
    try {
      const now = nowIso();
      const deck = await saveDeck({
        id: newId(),
        title: title.trim(),
        description: "",
        origin: "manual",
        tags: [],
        createdAt: now,
        updatedAt: now,
      });
      setOpen(false);
      setTitle("");
      router.push(`/flashcards/${deck.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Flashcards"
        description="Decks of question-and-answer cards, scheduled with spaced repetition."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> New deck
          </Button>
        }
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {data && data.decks.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-8 w-8" />}
          title="No decks yet"
          action={<Button onClick={() => setOpen(true)}>Create a deck</Button>}
        >
          Create one by hand, or generate cards from a document.
        </EmptyState>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {data?.decks.map((d) => {
          const s = data.stats.get(d.id) ?? { total: 0, due: 0 };
          return (
            <li key={d.id}>
              <Link
                href={`/flashcards/${d.id}`}
                className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-brand-400"
              >
                <p className="font-medium">{d.title}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  <OriginBadge origin={d.origin} /> {s.total} cards · {s.due} due
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
      <Dialog open={open} onClose={() => setOpen(false)} title="New deck">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
          className="space-y-3"
        >
          <Field label="Deck name">
            {(id) => (
              <Input
                id={id}
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
