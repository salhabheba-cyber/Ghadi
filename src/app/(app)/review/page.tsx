"use client";
import { Brain } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { StudySession } from "@/components/flashcards/session";
import { SessionSummary } from "@/components/flashcards/summary";
import { Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import { getDueCards } from "@/lib/storage/repo";
import { useSettings } from "@/hooks/use-settings";
import type { Card } from "@/lib/validation/schemas";

export default function ReviewPage() {
  const settings = useSettings();
  const { data: due, loading } = useLive(() => getDueCards(new Date()), []);
  const [session, setSession] = useState<Card[] | null>(null);
  const [summary, setSummary] = useState<{
    reviewed: number;
    known: number;
    difficult: number;
    forgotten: number;
  } | null>(null);

  if (summary) {
    return (
      <>
        <PageHeader title="Review" />
        <SessionSummary {...summary}>
          <Link href="/dashboard" className="text-brand-600 underline dark:text-brand-400">
            Back to dashboard
          </Link>
        </SessionSummary>
      </>
    );
  }
  if (session) {
    return (
      <>
        <PageHeader title="Review" description="Due cards from all decks." />
        <StudySession
          cards={session}
          onDone={(s) => {
            setSession(null);
            setSummary(s);
          }}
        />
      </>
    );
  }
  if (loading) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  const list = (due ?? []).slice(0, settings.dailyGoalCards);
  return (
    <>
      <PageHeader
        title="Review"
        description="Spaced repetition brings each card back just before you would forget it."
      />
      {due && due.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-lg font-semibold">
            {due.length} card{due.length === 1 ? " is" : "s are"} due
          </p>
          <p className="text-sm text-[var(--muted)]">
            This session covers up to {settings.dailyGoalCards} cards (change the limit in
            Settings).
          </p>
          <Button size="lg" onClick={() => setSession(list)}>
            <Brain className="h-4 w-4" aria-hidden /> Start review ({list.length})
          </Button>
        </div>
      ) : (
        <EmptyState
          icon={<Brain className="h-8 w-8" />}
          title="Nothing due right now"
          action={
            <Link href="/flashcards" className="text-brand-600 underline dark:text-brand-400">
              Go to flashcards
            </Link>
          }
        >
          You are all caught up. Create flashcards from a document, or come back later.
        </EmptyState>
      )}
    </>
  );
}
