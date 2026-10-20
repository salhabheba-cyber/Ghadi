"use client";
import { ArrowLeft, Copy, Download, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { OriginBadge } from "@/components/origin-badge";
import { QuizPlayer } from "@/components/quiz/player";
import { QuizResults } from "@/components/quiz/results";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  useConfirm,
  useToast,
} from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import { downloadText, quizToMarkdown, safeFileName } from "@/lib/export";
import { getDb } from "@/lib/storage/db";
import { deleteQuiz, duplicateQuiz, getQuiz, saveAttempt } from "@/lib/storage/repo";
import { accuracy } from "@/lib/study/quiz-engine";
import { errorMessage, formatDateTime } from "@/lib/utils";
import type { Quiz, QuizAttempt } from "@/lib/validation/schemas";

type View =
  { name: "overview" } | { name: "play"; quiz: Quiz } | { name: "results"; attempt: QuizAttempt };

export default function QuizPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const { data: quiz, loading } = useLive(() => getQuiz(id), [id]);
  const { data: attempts } = useLive(
    () => getDb().attempts.where("quizId").equals(id).reverse().sortBy("completedAt"),
    [id],
  );
  const [view, setView] = useState<View>({ name: "overview" });
  const [feedback, setFeedback] = useState<"immediate" | "end">("immediate");
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  if (!quiz)
    return (
      <EmptyState
        title="Quiz not found"
        action={
          <Link href="/quizzes" className="text-brand-600 underline dark:text-brand-400">
            Back to quizzes
          </Link>
        }
      >
        It may have been deleted.
      </EmptyState>
    );

  async function finish(attempt: QuizAttempt) {
    setView({ name: "results", attempt });
    try {
      await saveAttempt(attempt);
      setSaveError(null);
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  }

  if (view.name === "play") {
    return (
      <QuizPlayer
        quiz={view.quiz}
        feedbackMode={feedback}
        onFinish={(a) => void finish(a)}
        onExit={() => setView({ name: "overview" })}
      />
    );
  }
  if (view.name === "results") {
    return (
      <>
        {saveError ? (
          <div className="mb-3">
            <Notice tone="error">Your result could not be saved: {saveError}</Notice>
          </div>
        ) : null}
        <QuizResults
          quiz={quiz}
          attempt={view.attempt}
          onRetry={() => setView({ name: "play", quiz })}
          onRetryMissed={(ids) =>
            setView({
              name: "play",
              quiz: { ...quiz, questions: quiz.questions.filter((q) => ids.includes(q.id)) },
            })
          }
          onClose={() => setView({ name: "overview" })}
        />
      </>
    );
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete quiz?",
      message: "The quiz and its attempt history will be removed.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok || !quiz) return;
    await deleteQuiz(quiz.id);
    router.push("/quizzes");
  }

  return (
    <>
      <Link
        href="/quizzes"
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Quizzes
      </Link>
      <PageHeader
        title={quiz.title}
        description={`${quiz.questions.length} questions · ${quiz.difficulty}`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                downloadText(safeFileName(quiz.title, "md"), quizToMarkdown(quiz), "text/markdown")
              }
            >
              <Download className="h-4 w-4" aria-hidden /> Markdown
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void duplicateQuiz(quiz.id)
                  .then((c) => {
                    toast("Duplicated.", "good");
                    router.push(`/quizzes/${c.id}`);
                  })
                  .catch((e) => toast(errorMessage(e), "error"))
              }
            >
              <Copy className="h-4 w-4" aria-hidden /> Duplicate
            </Button>
            <Button variant="secondary" onClick={() => void remove()}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm">
          <OriginBadge origin={quiz.origin} />{" "}
          {quiz.documentId ? (
            <Link
              className="text-brand-600 underline dark:text-brand-400"
              href={`/documents/${quiz.documentId}`}
            >
              Source document
            </Link>
          ) : null}
        </p>
        {quiz.origin === "heuristic" ? (
          <Notice tone="info">
            These questions were built by rule-based text analysis, not an AI model. Some may be
            imperfect: check them against your source.
          </Notice>
        ) : null}
        <Card className="space-y-3">
          <fieldset>
            <legend className="mb-2 font-semibold">Feedback</legend>
            <label className="mr-4 inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="fb"
                checked={feedback === "immediate"}
                onChange={() => setFeedback("immediate")}
              />{" "}
              After each question
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="fb"
                checked={feedback === "end"}
                onChange={() => setFeedback("end")}
              />{" "}
              At the end
            </label>
          </fieldset>
          <Button size="lg" onClick={() => setView({ name: "play", quiz })}>
            <Play className="h-4 w-4" aria-hidden /> Start quiz
          </Button>
        </Card>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Attempt history</h2>
          {attempts && attempts.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {attempts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-3 py-2"
                >
                  <span>
                    {formatDateTime(a.completedAt)}{" "}
                    <Badge>
                      {a.feedbackMode === "immediate" ? "instant feedback" : "feedback at end"}
                    </Badge>
                  </span>
                  <span className="flex items-center gap-3">
                    <strong>
                      {a.score}/{a.total} ({accuracy(a.score, a.total) ?? 0}%)
                    </strong>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setView({ name: "results", attempt: a })}
                    >
                      Review
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">No attempts yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
