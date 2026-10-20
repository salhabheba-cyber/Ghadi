"use client";
import { ArrowLeft, Copy, Download, FileText, Loader2, Play, Sparkles, Trash2 } from "lucide-react";
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
  | { name: "overview" }
  | { name: "play"; quiz: Quiz }
  | { name: "results"; attempt: QuizAttempt };

type Lang = "en" | "fr" | "ar";

/** Download quiz as a Word (.docx) file via the export API */
async function downloadDocx(quiz: Quiz, includeAnswers: boolean): Promise<void> {
  const body = {
    title: quiz.title,
    subject: undefined as string | undefined,
    questions: quiz.questions.map((q) => ({
      type: q.type,
      prompt: q.prompt,
      options: q.options ?? undefined,
      correct: q.correct,
      explanation: q.explanation ?? undefined,
    })),
    includeAnswers,
    format: "docx" as const,
  };

  const res = await fetch("/api/quiz/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `Export failed (HTTP ${res.status})`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(quiz.title, "docx")}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
  const [aiCheck, setAiCheck] = useState(true);
  const [lang, setLang] = useState<Lang>("en");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"student" | "answers" | null>(null);

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

  const hasFillQuestions = quiz.questions.some((q) => q.type === "fill" || q.type === "short");

  async function finish(attempt: QuizAttempt) {
    setView({ name: "results", attempt });
    try {
      await saveAttempt(attempt);
      setSaveError(null);
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  }

  async function handleExport(includeAnswers: boolean) {
    if (!quiz) return;
    const key = includeAnswers ? "answers" : "student";
    setExporting(key);
    try {
      await downloadDocx(quiz, includeAnswers);
      toast("Word file downloaded.", "good");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setExporting(null);
    }
  }

  if (view.name === "play") {
    return (
      <QuizPlayer
        quiz={view.quiz}
        feedbackMode={feedback}
        aiCheckEnabled={aiCheck}
        lang={lang}
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

        {/* ── Play options ── */}
        <Card className="space-y-4">
          <div className="space-y-3">
            {/* Feedback mode */}
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

            {/* AI check (only shown when quiz has fill/short questions) */}
            {hasFillQuestions ? (
              <div className="space-y-2 rounded-lg bg-[var(--surface-2)] p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={aiCheck}
                    onChange={(e) => setAiCheck(e.target.checked)}
                    className="accent-brand-600"
                  />
                  <Sparkles className="h-4 w-4 text-brand-500" aria-hidden />
                  Use Ghadi AI to check fill-in-blank answers
                </label>
                {aiCheck ? (
                  <p className="text-xs text-[var(--muted)]">
                    Synonyms and paraphrases are accepted. Requires AI to be configured on this
                    server.
                  </p>
                ) : null}
                {aiCheck ? (
                  <fieldset>
                    <legend className="mb-1 text-xs font-medium text-[var(--muted)]">
                      Feedback language
                    </legend>
                    <div className="flex gap-3">
                      {(["en", "fr", "ar"] as Lang[]).map((l) => (
                        <label key={l} className="flex items-center gap-1.5 text-sm">
                          <input
                            type="radio"
                            name="lang"
                            checked={lang === l}
                            onChange={() => setLang(l)}
                            className="accent-brand-600"
                          />
                          {l === "en" ? "English" : l === "fr" ? "Français" : "العربية"}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
              </div>
            ) : null}
          </div>

          <Button size="lg" onClick={() => setView({ name: "play", quiz })}>
            <Play className="h-4 w-4" aria-hidden /> Start quiz
          </Button>
        </Card>

        {/* ── Export ── */}
        <Card className="space-y-3">
          <h2 className="font-semibold">Export quiz</h2>
          <p className="text-sm text-[var(--muted)]">
            Download a Word (.docx) file for printing or sharing.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={exporting !== null}
              onClick={() => void handleExport(false)}
            >
              {exporting === "student" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileText className="h-4 w-4" aria-hidden />
              )}
              Student sheet (no answers)
            </Button>
            <Button
              variant="secondary"
              disabled={exporting !== null}
              onClick={() => void handleExport(true)}
            >
              {exporting === "answers" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileText className="h-4 w-4" aria-hidden />
              )}
              Answer key
            </Button>
          </div>
        </Card>

        {/* ── Attempt history ── */}
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
