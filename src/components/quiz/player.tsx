"use client";
import { ArrowLeft, ArrowRight, Flag } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button, Card, Input, Notice } from "@/components/ui/primitives";
import { gradeResponse, prepareQuestionsForAttempt, scoreQuiz } from "@/lib/study/quiz-engine";
import { newId, nowIso } from "@/lib/utils";
import type { Quiz, QuizAttempt } from "@/lib/validation/schemas";

export function QuizPlayer({
  quiz,
  feedbackMode,
  onFinish,
  onExit,
}: {
  quiz: Quiz;
  feedbackMode: "immediate" | "end";
  onFinish: (attempt: QuizAttempt) => void;
  onExit: () => void;
}) {
  const questions = useMemo(() => prepareQuestionsForAttempt(quiz.questions), [quiz]);
  const startedAt = useRef(nowIso());
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const q = questions[index]!;
  const response = responses[q.id] ?? "";
  const isChecked = feedbackMode === "immediate" && checked[q.id] === true;
  const correct = isChecked ? gradeResponse(q, response) : false;
  const last = index === questions.length - 1;
  const answeredCount = Object.values(responses).filter((r) => r.trim() !== "").length;

  const set = (v: string) => setResponses((r) => ({ ...r, [q.id]: v }));

  function finish() {
    const result = scoreQuiz({ questions }, responses);
    onFinish({
      id: newId(),
      quizId: quiz.id,
      quizTitle: quiz.title,
      feedbackMode,
      answers: result.answers,
      score: result.score,
      total: result.total,
      startedAt: startedAt.current,
      completedAt: nowIso(),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span aria-live="polite">
          Question {index + 1} of {questions.length}
        </span>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit quiz
        </Button>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={answeredCount}
        aria-label="Questions answered"
      >
        <div
          className="h-full bg-brand-600 transition-all"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      <Card className="space-y-4">
        <fieldset disabled={isChecked} className="space-y-3">
          <legend className="text-lg font-semibold" dir="auto">
            {q.prompt}
          </legend>
          {q.options ? (
            <div className="space-y-2" role="radiogroup" aria-label="Answer choices">
              {q.options.map((o) => (
                <label
                  key={o}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${response === o ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30" : "border-[var(--border)]"}`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={o}
                    checked={response === o}
                    onChange={() => set(o)}
                  />
                  <span dir="auto">{o}</span>
                </label>
              ))}
            </div>
          ) : (
            <Input
              aria-label="Your answer"
              value={response}
              dir="auto"
              autoComplete="off"
              onChange={(e) => set(e.target.value)}
              placeholder={
                q.type === "fill" ? "Type the missing word or phrase" : "Type your answer"
              }
            />
          )}
        </fieldset>

        {isChecked ? (
          <div className="space-y-2" aria-live="polite">
            <Notice tone={correct ? "good" : "error"}>
              <span className="font-medium">{correct ? "Correct" : "Not quite"}</span>
              {!correct ? (
                <span className="block">Correct answer: {q.correct.join(" / ")}</span>
              ) : null}
              {q.explanation ? <span className="mt-1 block">{q.explanation}</span> : null}
            </Notice>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Previous
        </Button>
        <div className="flex gap-2">
          {feedbackMode === "immediate" && !isChecked ? (
            <Button
              variant="secondary"
              disabled={response.trim() === ""}
              onClick={() => setChecked((c) => ({ ...c, [q.id]: true }))}
            >
              Check answer
            </Button>
          ) : null}
          {last ? (
            <Button onClick={finish}>
              <Flag className="h-4 w-4" aria-hidden /> Finish
            </Button>
          ) : (
            <Button onClick={() => setIndex(index + 1)}>
              {response.trim() === "" ? "Skip" : "Next"}{" "}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>
      {last && answeredCount < questions.length ? (
        <p className="text-sm text-[var(--muted)]">
          {questions.length - answeredCount} question(s) unanswered; they will count as incorrect.
        </p>
      ) : null}
    </div>
  );
}
