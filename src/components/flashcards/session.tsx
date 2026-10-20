"use client";
import { RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Notice, useToast } from "@/components/ui/primitives";
import { reviewCard } from "@/lib/storage/repo";
import { previewIntervals } from "@/lib/study/srs";
import { errorMessage } from "@/lib/utils";
import type { Card as CardT, Rating } from "@/lib/validation/schemas";

/**
 * Flip-card study session. Keyboard: Space/Enter flips; 1 = Forgotten, 2 = Difficult, 3 = Known.
 * Cards rated "forgotten" return to the end of this session's queue (they are still due today).
 */
export function StudySession({
  cards,
  onDone,
}: {
  cards: CardT[];
  onDone: (summary: {
    reviewed: number;
    known: number;
    difficult: number;
    forgotten: number;
  }) => void;
}) {
  const toast = useToast();
  const [queue, setQueue] = useState<CardT[]>(cards);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const stats = useRef({ reviewed: 0, known: 0, difficult: 0, forgotten: 0 });
  const total = cards.length;
  const current = queue[0];

  const rate = useCallback(
    async (rating: Rating) => {
      if (!current || busy) return;
      setBusy(true);
      try {
        const updated = await reviewCard(current.id, rating);
        stats.current.reviewed += 1;
        stats.current[rating] += 1;
        const rest = queue.slice(1);
        const next = rating === "forgotten" ? [...rest, updated] : rest;
        setFlipped(false);
        if (next.length === 0) onDone({ ...stats.current });
        else setQueue(next);
      } catch (e) {
        toast(errorMessage(e), "error");
      } finally {
        setBusy(false);
      }
    },
    [current, busy, queue, onDone, toast],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select")) return;
      if (e.key === " " || e.key === "Enter") {
        if (t.closest("button")) return;
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && e.key === "1") void rate("forgotten");
      else if (flipped && e.key === "2") void rate("difficult");
      else if (flipped && e.key === "3") void rate("known");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, rate]);

  if (!current) return null;
  const preview = previewIntervals(current.schedule);
  const done = Math.max(0, total - new Set(queue.map((c) => c.id)).size);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]" aria-live="polite">
        {done} of {total} done · {queue.length} left in queue
      </p>
      <Card className="min-h-56">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          className="flex min-h-48 w-full flex-col items-center justify-center gap-3 text-center"
        >
          <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
            {flipped ? "Answer" : "Question"}
          </span>
          <span className="whitespace-pre-line text-xl font-semibold" dir="auto">
            {flipped ? current.back : current.front}
          </span>
          {flipped && current.explanation ? (
            <span className="text-sm text-[var(--muted)]" dir="auto">
              {current.explanation}
            </span>
          ) : null}
          {!flipped ? (
            <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
              <RotateCw className="h-3 w-3" aria-hidden /> Press Space or click to reveal the answer
            </span>
          ) : null}
        </button>
      </Card>
      {flipped ? (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="danger" disabled={busy} onClick={() => void rate("forgotten")}>
            Forgotten <span className="text-xs font-normal">({preview.forgotten}) · 1</span>
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void rate("difficult")}>
            Difficult <span className="text-xs font-normal">({preview.difficult}) · 2</span>
          </Button>
          <Button disabled={busy} onClick={() => void rate("known")}>
            Known <span className="text-xs font-normal">({preview.known}) · 3</span>
          </Button>
        </div>
      ) : (
        <Button className="w-full" onClick={() => setFlipped(true)}>
          Show answer
        </Button>
      )}
      {queue.length > 1 || current.schedule.lapses > 0 ? null : (
        <Notice tone="info">Last card in this session.</Notice>
      )}
    </div>
  );
}
