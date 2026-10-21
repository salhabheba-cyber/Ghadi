"use client";
import { ArrowLeft, CheckCircle2, Copy, Download, Play, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { OriginBadge } from "@/components/origin-badge";
import { ExportDialog } from "@/components/quiz/export-dialog";
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
import { useSettings } from "@/hooks/use-settings";
import { downloadText, quizToMarkdown, safeFileName } from "@/lib/export";
import { getDb } from "@/lib/storage/db";
import { deleteQuiz, duplicateQuiz, getQuiz, saveAttempt } from "@/lib/storage/repo";
import { accuracy } from "@/lib/study/quiz-engine";
import { errorMessage, formatDateTime } from "@/lib/utils";
import type { Quiz, QuizAttempt } from "@/lib/validation/schemas";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type View =
  | { name: "overview" }
  | { name: "choice" }
  | { name: "play"; quiz: Quiz }
  | { name: "export-dialog" }
  | { name: "results"; attempt: QuizAttempt };

type Lang = "en" | "fr" | "ar";

// ─────────────────────────────────────────────────────────────────────────────
// Choice screen — "Take Exam in Ghadi" vs "Export Exam"
// ─────────────────────────────────────────────────────────────────────────────

function ChoiceScreen({
  quiz,
  onTakeInApp,
  onExport,
  onBack,
}: {
  quiz: Quiz;
  onTakeInApp: () => void;
  onExport: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </button>

      <div className="text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-brand-500" aria-hidden />
        <h1 className="text-2xl font-bold">Your exam is ready</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {quiz.questions.length} questions · {quiz.difficulty}
        </p>
      </div>

      <p className="text-center font-medium">How would you like to take this exam?</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Option A: Take in Ghadi */}
        <button
          onClick={onTakeInApp}
          className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-6 text-left transition-all hover:border-brand-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Take exam in Ghadi — interactive experience"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 transition-colors group-hover:bg-brand-200 dark:bg-brand-900/30 dark:text-brand-400">
            <Play className="h-8 w-8" aria-hidden />
          </div>
          <div>
            <p className="text-lg font-bold text-[var(--fg)]">Take Exam in Ghadi</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              One question at a time · navigation · auto-save · instant score
            </p>
            <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
              <li>✓ Previous / next navigation</li>
              <li>✓ Optional timer</li>
              <li>✓ Auto-saved progress</li>
              <li>✓ Score + review wrong answers</li>
            </ul>
          </div>
        </button>

        {/* Option B: Export */}
        <button
          onClick={onExport}
          className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-6 text-left transition-all hover:border-brand-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Export exam — download a file to print or share"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--muted)] transition-colors group-hover:bg-brand-100 group-hover:text-brand-600 dark:group-hover:bg-brand-900/30 dark:group-hover:text-brand-400">
            <Download className="h-8 w-8" aria-hidden />
          </div>
          <div>
            <p className="text-lg font-bold text-[var(--fg)]">Export Exam</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Download a file to print, share, or use offline
            </p>
            <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
              <li>✓ PDF, Word (.docx) or Excel (.xlsx)</li>
              <li>✓ Quiz only, with separate key, or key only</li>
              <li>✓ Optional title, name and date</li>
              <li>✓ Preview before download</li>
            </ul>
          </div>
        </button>
      </div>

      <p className="text-center text-xs text-[var(--muted)]">
        You can always export later from the quiz overview.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Play settings panel (shown in overview before starting)
// ─────────────────────────────────────────────────────────────────────────────

function PlaySettings({
  quiz,
  onStart,
  onGoToChoice,
}: {
  quiz: Quiz;
  onStart: (opts: {
    feedback: "immediate" | "end";
    aiCheck: boolean;
    lang: Lang;
    timerMin: number;
  }) => void;
  onGoToChoice: () => void;
}) {
  const settings = useSettings();
  const [feedback, setFeedback] = useState<"immediate" | "end">(quiz.feedbackMode ?? "end");
  const [aiCheck, setAiCheck] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [timerMin, setTimerMin] = useState(0);
  const aiAllowed = settings.provider !== "offline" && settings.hostedConsent;
  const hasFillQuestions = quiz.questions.some((q) => q.type === "fill" || q.type === "short");

  return (
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

        {/* AI check (only for fill/short questions) */}
        {hasFillQuestions ? (
          <div className="space-y-2 rounded-lg bg-[var(--surface-2)] p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={aiCheck && aiAllowed}
                disabled={!aiAllowed}
                onChange={(e) => setAiCheck(e.target.checked)}
                className="accent-brand-600"
              />
              <Sparkles className="h-4 w-4 text-brand-500" aria-hidden />
              Use Ghadi AI to check fill-in-blank answers
            </label>
            <p className="text-xs text-[var(--muted)]">
              {aiAllowed
                ? "Synonyms and paraphrases are accepted. Each checked answer is sent to your AI provider and may cost money."
                : "Off. To enable it, choose a cloud or Ollama generator in Settings and allow sending text to it."}
            </p>
            {aiCheck && aiAllowed ? (
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

      <label className="flex items-center gap-2 text-sm">
        Timer
        <select
          value={timerMin}
          onChange={(e) => setTimerMin(Number(e.target.value))}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
        >
          <option value={0}>No timer</option>
          {[5, 10, 15, 30, 45, 60].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          onClick={() => onStart({ feedback, aiCheck: aiCheck && aiAllowed, lang, timerMin })}
        >
          <Play className="h-4 w-4" aria-hidden /> Take Exam in Ghadi
        </Button>
        <Button variant="secondary" onClick={onGoToChoice}>
          <Download className="h-4 w-4" aria-hidden /> Export Exam
        </Button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

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
  // Options chosen on the play-settings card; AI answer-checking stays off unless the user ticks it.
  const [playOpts, setPlayOpts] = useState<{
    feedback: "immediate" | "end";
    aiCheck: boolean;
    lang: Lang;
    timerMin: number;
  }>({ feedback: "end", aiCheck: false, lang: "en", timerMin: 0 });
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

  // ── Finish handler ──
  async function finish(attempt: QuizAttempt) {
    setView({ name: "results", attempt });
    try {
      await saveAttempt(attempt);
      setSaveError(null);
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  }

  // ── Delete handler ──
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

  // ── Play view ──
  if (view.name === "play") {
    return (
      <QuizPlayer
        quiz={view.quiz}
        feedbackMode={playOpts.feedback}
        aiCheckEnabled={playOpts.aiCheck}
        lang={playOpts.lang}
        timeLimitMin={playOpts.timerMin || undefined}
        onFinish={(a) => void finish(a)}
        onExit={() => setView({ name: "overview" })}
      />
    );
  }

  // ── Results view ──
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

  // ── Choice view ──
  if (view.name === "choice") {
    return (
      <ChoiceScreen
        quiz={quiz}
        onTakeInApp={() => setView({ name: "play", quiz })}
        onExport={() => setView({ name: "export-dialog" })}
        onBack={() => setView({ name: "overview" })}
      />
    );
  }

  // ── Export dialog view ──
  if (view.name === "export-dialog") {
    return (
      <ExportDialog
        quiz={quiz}
        onBack={() => setView({ name: "overview" })}
        onSuccess={() => undefined}
      />
    );
  }

  // ── Overview ──
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
        {quiz.tags?.includes("topic-based") ? (
          <Notice tone="warn">
            This practice quiz was written from the AI&apos;s general knowledge, not from one of
            your documents, so it is not source-grounded. Double-check facts that matter.
          </Notice>
        ) : null}
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

        {/* ── Play settings + Exam options ── */}
        <PlaySettings
          quiz={quiz}
          onStart={(opts) => {
            setPlayOpts(opts);
            setView({ name: "play", quiz: { ...quiz } });
          }}
          onGoToChoice={() => setView({ name: "export-dialog" })}
        />

        {/* ── Quick export strip (non-disruptive, no auto-download) ── */}
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Export</p>
            <p className="text-xs text-[var(--muted)]">
              Download a Word or Excel file to print or share.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setView({ name: "export-dialog" })}>
            <Download className="h-4 w-4" aria-hidden /> Export options
          </Button>
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
