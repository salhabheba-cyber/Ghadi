"use client";
import { Check, Minus, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { accuracy } from "@/lib/study/quiz-engine";
import { cn } from "@/lib/utils";
import type { Quiz, QuizAttempt } from "@/lib/validation/schemas";

export function QuizResults({
  quiz,
  attempt,
  onRetry,
  onRetryMissed,
  onClose,
}: {
  quiz: Quiz;
  attempt: QuizAttempt;
  onRetry: () => void;
  onRetryMissed: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [onlyWrong, setOnlyWrong] = useState(false);
  const pct = accuracy(attempt.score, attempt.total) ?? 0;
  const byId = new Map(quiz.questions.map((q) => [q.id, q]));
  const wrongIds = attempt.answers.filter((a) => !a.correct).map((a) => a.questionId);
  const rows = attempt.answers.filter((a) => !onlyWrong || !a.correct);

  return (
    <div className="space-y-4">
      <Card className="text-center">
        <p className="text-sm text-[var(--muted)]">Your score</p>
        <p className="text-5xl font-extrabold" data-testid="score">
          {attempt.score} / {attempt.total}
        </p>
        <p className="mt-1 text-lg">{pct}% correct</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={onRetry}>Retry whole quiz</Button>
          <Button
            variant="secondary"
            disabled={wrongIds.length === 0}
            onClick={() => onRetryMissed(wrongIds)}
          >
            Retry missed ({wrongIds.length})
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Back to quiz
          </Button>
        </div>
      </Card>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={onlyWrong}
          onChange={(e) => setOnlyWrong(e.target.checked)}
        />{" "}
        Show only questions I missed
      </label>

      <ol className="space-y-3">
        {rows.map((a) => {
          const q = byId.get(a.questionId);
          if (!q) return null;
          const n = quiz.questions.findIndex((x) => x.id === q.id) + 1;
          return (
            <li key={a.questionId}>
              <Card
                className={cn(
                  "space-y-2",
                  a.correct ? "border-emerald-400/60" : "border-red-400/60",
                )}
              >
                <p className="flex items-start gap-2 font-medium" dir="auto">
                  {a.correct ? (
                    <Check
                      className="mt-1 h-4 w-4 shrink-0 text-emerald-600"
                      aria-label="Correct"
                    />
                  ) : a.skipped ? (
                    <Minus className="mt-1 h-4 w-4 shrink-0" aria-label="Skipped" />
                  ) : (
                    <X className="mt-1 h-4 w-4 shrink-0 text-red-600" aria-label="Incorrect" />
                  )}
                  <span>
                    {n}. {q.prompt}
                  </span>
                </p>
                <p className="text-sm" dir="auto">
                  <span className="text-[var(--muted)]">Your answer: </span>
                  {a.skipped ? <Badge>skipped</Badge> : a.response}
                </p>
                {!a.correct ? (
                  <p className="text-sm" dir="auto">
                    <span className="text-[var(--muted)]">Correct answer: </span>
                    <strong>{q.correct.join(" / ")}</strong>
                  </p>
                ) : null}
                {q.explanation && quiz.includeExplanations !== false ? (
                  <p className="text-sm text-[var(--muted)]" dir="auto">
                    {q.explanation}
                  </p>
                ) : null}
                {q.sourceExcerpt ? (
                  <p className="text-xs italic text-[var(--muted)]" dir="auto">
                    Source: “{q.sourceExcerpt}”
                  </p>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
