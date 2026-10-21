"use client";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
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
type ExportFormat = "docx" | "xlsx";
type ExportContent = "questions-only" | "with-answers" | "answers-only";

// ─────────────────────────────────────────────────────────────────────────────
// Export helper — only runs when user presses "Generate Export"
// ─────────────────────────────────────────────────────────────────────────────

interface ExportConfig {
  format: ExportFormat;
  content: ExportContent;
  includeExplanations: boolean;
  studentFields: boolean;
}

async function generateExport(quiz: Quiz, cfg: ExportConfig): Promise<void> {
  const includeAnswers = cfg.content === "with-answers" || cfg.content === "answers-only";
  const questionsOnly = cfg.content === "answers-only";

  const body = {
    title: quiz.title,
    subject: undefined as string | undefined,
    questions: questionsOnly
      ? []
      : quiz.questions.map((q) => ({
          type: q.type,
          prompt: q.prompt,
          options: q.options ?? undefined,
          correct: q.correct,
          explanation: cfg.includeExplanations ? (q.explanation ?? undefined) : undefined,
        })),
    includeAnswers,
    includeExplanations: cfg.includeExplanations,
    studentFields: cfg.studentFields,
    format: cfg.format,
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
  a.download = safeFileName(
    `${quiz.title}_${cfg.content === "answers-only" ? "answer_key" : cfg.content === "with-answers" ? "with_answers" : "student"}`,
    cfg.format,
  );
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
              <li>✓ Word (.docx) or Excel (.xlsx)</li>
              <li>✓ Student sheet or answer key</li>
              <li>✓ Optional student name fields</li>
              <li>✓ Grading table included</li>
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
// Export Dialog — format picker + options + explicit generate button
// ─────────────────────────────────────────────────────────────────────────────

function ExportDialog({
  quiz,
  onBack,
  onSuccess,
}: {
  quiz: Quiz;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [format, setFormat] = useState<ExportFormat>("docx");
  const [content, setContent] = useState<ExportContent>("questions-only");
  const [includeExplanations, setIncludeExplanations] = useState(false);
  const [studentFields, setStudentFields] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generateExport(quiz, { format, content, includeExplanations, studentFields });
      toast("File downloaded.", "good");
      onSuccess();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setGenerating(false);
    }
  }

  const mcqCount = quiz.questions.filter((q) => q.type === "mcq" || q.type === "tf").length;
  const xlsxSuited = mcqCount > 0;

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </button>

      <h1 className="text-xl font-bold">Export Exam</h1>
      <p className="text-sm text-[var(--muted)]">{quiz.title}</p>

      {/* ── Format picker ── */}
      <Card className="space-y-3">
        <h2 className="font-semibold">1. Choose format</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${
              format === "docx"
                ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                : "border-[var(--border)] hover:border-brand-300"
            }`}
          >
            <input
              type="radio"
              name="export-format"
              value="docx"
              checked={format === "docx"}
              onChange={() => setFormat("docx")}
              className="accent-brand-600"
            />
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" aria-hidden />
                <span className="font-medium">Word (.docx)</span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Editable · print-ready · all question types
              </p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${
              format === "xlsx"
                ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                : "border-[var(--border)] hover:border-brand-300"
            } ${!xlsxSuited ? "opacity-60" : ""}`}
          >
            <input
              type="radio"
              name="export-format"
              value="xlsx"
              checked={format === "xlsx"}
              onChange={() => setFormat("xlsx")}
              className="accent-brand-600"
              aria-describedby={!xlsxSuited ? "xlsx-note" : undefined}
            />
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-green-600" aria-hidden />
                <span className="font-medium">Excel (.xlsx)</span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                MCQ answer sheets · grading tables
              </p>
              {!xlsxSuited ? (
                <p id="xlsx-note" className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                  Best suited for MCQ / True-False exams
                </p>
              ) : null}
            </div>
          </label>
        </div>
      </Card>

      {/* ── Content options ── */}
      <Card className="space-y-3">
        <h2 className="font-semibold">2. What to include</h2>
        <div className="space-y-2">
          {(
            [
              {
                value: "questions-only",
                label: "Questions only",
                desc: "Student exam sheet — no answers",
              },
              {
                value: "with-answers",
                label: "Questions + answer key",
                desc: "Both on the same document",
              },
              {
                value: "answers-only",
                label: "Answer key only",
                desc: "Correct answers and explanations",
              },
            ] as { value: ExportContent; label: string; desc: string }[]
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                content === opt.value
                  ? "border-brand-400 bg-brand-50 dark:bg-brand-900/20"
                  : "border-[var(--border)] hover:border-brand-300"
              }`}
            >
              <input
                type="radio"
                name="export-content"
                value={opt.value}
                checked={content === opt.value}
                onChange={() => setContent(opt.value)}
                className="mt-0.5 accent-brand-600"
              />
              <div>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-[var(--muted)]">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </Card>

      {/* ── Advanced options (collapsible) ── */}
      <Card className="space-y-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-sm font-semibold"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
        >
          <span>3. More options</span>
          {advancedOpen ? (
            <ChevronUp className="h-4 w-4 text-[var(--muted)]" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--muted)]" aria-hidden />
          )}
        </button>

        {advancedOpen ? (
          <div className="space-y-3 border-t border-[var(--border)] pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeExplanations}
                onChange={(e) => setIncludeExplanations(e.target.checked)}
                className="accent-brand-600"
              />
              Include explanations
              <span className="text-xs text-[var(--muted)]">(where available)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={studentFields}
                onChange={(e) => setStudentFields(e.target.checked)}
                className="accent-brand-600"
              />
              Add student name / class / date fields
            </label>
          </div>
        ) : null}
      </Card>

      {/* ── Generate button ── */}
      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          disabled={generating}
          onClick={() => void handleGenerate()}
          aria-label={`Generate and download ${format.toUpperCase()} file`}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          {generating ? "Generating…" : "Generate Export"}
        </Button>
        <Button variant="secondary" disabled={generating} onClick={onBack}>
          <X className="h-4 w-4" aria-hidden /> Cancel
        </Button>
      </div>

      <p className="text-xs text-[var(--muted)]">
        The file is generated and downloaded only when you press &quot;Generate Export&quot;.
        Nothing is downloaded automatically.
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
  onStart: (opts: { feedback: "immediate" | "end"; aiCheck: boolean; lang: Lang }) => void;
  onGoToChoice: () => void;
}) {
  const [feedback, setFeedback] = useState<"immediate" | "end">("immediate");
  const [aiCheck, setAiCheck] = useState(true);
  const [lang, setLang] = useState<Lang>("en");
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
                checked={aiCheck}
                onChange={(e) => setAiCheck(e.target.checked)}
                className="accent-brand-600"
              />
              <Sparkles className="h-4 w-4 text-brand-500" aria-hidden />
              Use Ghadi AI to check fill-in-blank answers
            </label>
            {aiCheck ? (
              <p className="text-xs text-[var(--muted)]">
                Synonyms and paraphrases are accepted. Requires AI to be configured on this server.
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

      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={() => onStart({ feedback, aiCheck, lang })}>
          <Play className="h-4 w-4" aria-hidden /> Start quiz
        </Button>
        <Button
          variant="secondary"
          onClick={onGoToChoice}
          aria-label="Go to exam options: take in Ghadi or export"
        >
          <BookOpen className="h-4 w-4" aria-hidden /> Exam options
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
  }>({ feedback: "immediate", aiCheck: false, lang: "en" });
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
        onBack={() => setView({ name: "choice" })}
        onSuccess={() => setView({ name: "overview" })}
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
          onGoToChoice={() => setView({ name: "choice" })}
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
