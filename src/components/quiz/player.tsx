"use client";
import { ArrowLeft, ArrowRight, Bookmark, Clock, Flag, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Input, Notice } from "@/components/ui/primitives";
import { gradeResponse, prepareQuestionsForAttempt, scoreQuiz } from "@/lib/study/quiz-engine";
import { newId, nowIso } from "@/lib/utils";
import type { Quiz, QuizAttempt } from "@/lib/validation/schemas";

// ── Ghadi mascot speech bubble shown after AI check ─────────────────────────

function GhadiFeedback({
  loading,
  correct,
  feedback,
  correctAnswer,
}: {
  loading: boolean;
  correct: boolean | null;
  feedback: string | null;
  correctAnswer: string | null;
}) {
  if (!loading && feedback === null) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl bg-[var(--surface-2)] p-3" aria-live="polite">
      {/* Ghadi avatar */}
      <div className="shrink-0">
        <svg
          width="40"
          height="40"
          viewBox="0 0 80 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          {/* body */}
          <ellipse cx="40" cy="44" rx="24" ry="22" fill="#7C3AED" />
          {/* head */}
          <circle cx="40" cy="28" r="18" fill="#7C3AED" />
          {/* eyes */}
          <circle cx="33" cy="26" r="5" fill="white" />
          <circle cx="47" cy="26" r="5" fill="white" />
          <circle cx="34" cy="27" r="2.5" fill="#1a1a2e" />
          <circle cx="48" cy="27" r="2.5" fill="#1a1a2e" />
          {/* smile or sad mouth */}
          {correct === false ? (
            <path
              d="M33 35 Q40 31 47 35"
              stroke="white"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M33 33 Q40 39 47 33"
              stroke="white"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          )}
          {/* graduation cap */}
          <rect x="24" y="11" width="32" height="5" rx="2" fill="#4C1D95" />
          <polygon points="40,4 28,11 52,11" fill="#4C1D95" />
          <line
            x1="52"
            y1="11"
            x2="56"
            y2="18"
            stroke="#FCD34D"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="56" cy="19" r="2" fill="#FCD34D" />
        </svg>
      </div>

      {/* Speech bubble */}
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ghadi is checking your answer…
          </div>
        ) : (
          <div className="space-y-1">
            <p
              className={`text-sm font-semibold ${correct ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            >
              {correct ? "✓ Correct!" : "✗ Not quite"}
            </p>
            {feedback ? (
              <p className="text-sm text-[var(--fg)]" dir="auto">
                {feedback}
              </p>
            ) : null}
            {!correct && correctAnswer ? (
              <p className="text-sm text-[var(--muted)]">
                <span className="font-medium">Correct answer:</span> {correctAnswer}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ── AI check hook ─────────────────────────────────────────────────────────────

interface AiCheckResult {
  correct: boolean;
  feedback: string;
  correctAnswer: string;
}

interface AiCheckState {
  loading: boolean;
  result: AiCheckResult | null;
  error: string | null;
}

async function callAiCheck(payload: {
  question: string;
  correctAnswer: string;
  userAnswer: string;
  language: "en" | "fr" | "ar";
  sourceExcerpt?: string;
}): Promise<AiCheckResult> {
  const res = await fetch("/api/quiz/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, consent: true }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `The check failed (HTTP ${res.status}).`);
  }
  return res.json() as Promise<AiCheckResult>;
}

// ── Draft persistence (localStorage; best-effort, never required) ─────────────

interface Draft {
  index: number;
  responses: Record<string, string>;
  marked: Record<string, boolean>;
  deadline: number | null;
  quizUpdatedAt?: string;
}

function loadDraft(key: string, quiz: Quiz): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (d.quizUpdatedAt && quiz.updatedAt && d.quizUpdatedAt !== quiz.updatedAt) return null;
    const ids = new Set(quiz.questions.map((x) => x.id));
    const responses = Object.fromEntries(
      Object.entries(d.responses ?? {}).filter(([id, v]) => ids.has(id) && typeof v === "string"),
    );
    const marked = Object.fromEntries(Object.entries(d.marked ?? {}).filter(([id]) => ids.has(id)));
    // An expired deadline is kept on purpose: the exam submits at once instead of restarting the clock.
    const deadline = typeof d.deadline === "number" ? d.deadline : null;
    return { index: Number(d.index) || 0, responses, marked, deadline };
  } catch {
    return null;
  }
}

function saveDraft(key: string, d: Draft) {
  try {
    localStorage.setItem(key, JSON.stringify(d));
  } catch {
    /* storage unavailable: the exam still works, it just cannot be recovered */
  }
}

function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function QuizPlayer({
  quiz,
  feedbackMode,
  aiCheckEnabled,
  lang,
  timeLimitMin,
  onFinish,
  onExit,
}: {
  quiz: Quiz;
  feedbackMode: "immediate" | "end";
  /** When true, fill-in-blank questions use Ghadi AI to check answers instead of exact-match. */
  aiCheckEnabled?: boolean;
  /** Language for AI feedback: "en" | "fr" | "ar" — defaults to "en" */
  lang?: "en" | "fr" | "ar";
  /** Optional countdown in minutes. Persisted as an absolute deadline so a refresh cannot reset it. */
  timeLimitMin?: number;
  onFinish: (attempt: QuizAttempt) => void;
  onExit: () => void;
}) {
  const questions = useMemo(() => prepareQuestionsForAttempt(quiz.questions), [quiz]);
  const startedAt = useRef(nowIso());
  const storageKey = `ghadi:exam:${quiz.id}`;
  const saved = useMemo(() => loadDraft(storageKey, quiz), [storageKey, quiz]);
  const [index, setIndex] = useState(() => Math.min(saved?.index ?? 0, questions.length - 1));
  const [responses, setResponses] = useState<Record<string, string>>(saved?.responses ?? {});
  const [marked, setMarked] = useState<Record<string, boolean>>(saved?.marked ?? {});
  const [confirming, setConfirming] = useState(false);
  const [restored] = useState(Boolean(saved && Object.keys(saved.responses).length > 0));
  const [deadline] = useState<number | null>(() =>
    timeLimitMin && timeLimitMin > 0
      ? (saved?.deadline ?? Date.now() + timeLimitMin * 60_000)
      : null,
  );
  const [now, setNow] = useState(() => Date.now());
  // Local exact-match checked state (non-AI path)
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // Per-question AI check state
  const [aiChecks, setAiChecks] = useState<Record<string, AiCheckState>>({});

  // Auto-save every change so a refresh or accidental close loses nothing.
  useEffect(() => {
    saveDraft(storageKey, { index, responses, marked, deadline, quizUpdatedAt: quiz.updatedAt });
  }, [storageKey, index, responses, marked, deadline, quiz.updatedAt]);

  const q = questions[index]!;
  const response = responses[q.id] ?? "";
  const isFillOrShort = q.type === "fill" || q.type === "short";
  const useAi = aiCheckEnabled && isFillOrShort;

  // Local exact-match check (MCQ / TF)
  const isLocalChecked = feedbackMode === "immediate" && checked[q.id] === true;
  const localCorrect = isLocalChecked ? gradeResponse(q, response) : false;

  // AI check state for this question
  const aiState = aiChecks[q.id] ?? { loading: false, result: null, error: null };
  const isAiChecked = aiState.result !== null || aiState.loading;

  // Combined "is checked" for blocking navigation
  const isChecked = useAi ? isAiChecked : isLocalChecked;
  const last = index === questions.length - 1;
  const answeredCount = Object.values(responses).filter((r) => r.trim() !== "").length;

  const set = (v: string) => setResponses((r) => ({ ...r, [q.id]: v }));

  // ── AI check handler ──────────────────────────────────────────────────────
  async function triggerAiCheck() {
    if (!q) return;
    setAiChecks((prev) => ({
      ...prev,
      [q.id]: { loading: true, result: null, error: null },
    }));
    try {
      const result = await callAiCheck({
        question: q.prompt,
        correctAnswer: q.correct[0] ?? "",
        userAnswer: response,
        language: lang ?? "en",
      });
      setAiChecks((prev) => ({
        ...prev,
        [q.id]: { loading: false, result, error: null },
      }));
      // Mirror AI result into the response map so scoring reflects it
      // (the AI result's "correct" governs the attempt)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI check failed";
      setAiChecks((prev) => ({
        ...prev,
        [q.id]: { loading: false, result: null, error: msg },
      }));
    }
  }

  // ── Finish ─────────────────────────────────────────────────────────────────
  function finish() {
    clearDraft(storageKey);
    const result = scoreQuiz({ questions }, responses, aiChecks);
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

  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= deadline) {
        clearInterval(t);
        finishRef.current();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline]);
  const remainingSec = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const unanswered = questions.filter((x) => (responses[x.id] ?? "").trim() === "");
  const markedCount = questions.filter((x) => marked[x.id]).length;

  return (
    <div className="space-y-4">
      {restored ? <Notice tone="info">Your saved progress was restored.</Notice> : null}
      {/* Progress bar */}
      <div className="flex items-center justify-between text-sm">
        <span aria-live="polite">
          Question {index + 1} of {questions.length} · {answeredCount} answered
        </span>
        <span className="flex items-center gap-2">
          {remainingSec !== null ? (
            <span
              role="timer"
              aria-label={`Time left ${formatClock(remainingSec)}`}
              className={`inline-flex items-center gap-1 font-mono ${remainingSec <= 60 ? "text-red-600 dark:text-red-400" : ""}`}
            >
              <Clock className="h-4 w-4" aria-hidden /> {formatClock(remainingSec)}
            </span>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onExit}>
            Exit (progress is kept)
          </Button>
        </span>
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

      {/* Question navigator */}
      <nav aria-label="Question navigator">
        <ul className="flex flex-wrap gap-1.5">
          {questions.map((x, i) => {
            const answered = (responses[x.id] ?? "").trim() !== "";
            const state = `${answered ? "answered" : "unanswered"}${marked[x.id] ? ", marked for review" : ""}`;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    setIndex(i);
                  }}
                  aria-label={`Question ${i + 1}, ${state}`}
                  aria-current={i === index ? "step" : undefined}
                  className={`relative h-9 min-w-9 rounded-lg border px-2 text-sm font-medium ${
                    i === index
                      ? "border-brand-600 bg-brand-600 text-white"
                      : answered
                        ? "border-brand-300 bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
                        : "border-dashed border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {i + 1}
                  {marked[x.id] ? (
                    <Bookmark
                      className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-amber-400 text-amber-500"
                      aria-hidden
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Question card */}
      <Card className="space-y-4">
        <fieldset disabled={isChecked} className="space-y-3">
          <legend className="text-lg font-semibold" dir="auto">
            {q.prompt}
          </legend>

          {/* MCQ / TF: radio options */}
          {q.options ? (
            <div className="space-y-2" role="radiogroup" aria-label="Answer choices">
              {q.options.map((o) => (
                <label
                  key={o}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                    response === o
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30"
                      : "border-[var(--border)] hover:border-brand-400"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={o}
                    checked={response === o}
                    onChange={() => set(o)}
                    className="accent-brand-600"
                  />
                  <span dir="auto">{o}</span>
                </label>
              ))}
            </div>
          ) : (
            /* Fill-in-blank / short answer: text input */
            <div className="space-y-1">
              <Input
                aria-label="Your answer"
                value={response}
                dir="auto"
                autoComplete="off"
                onChange={(e) => set(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && response.trim() && !isChecked) {
                    if (useAi) void triggerAiCheck();
                    else setChecked((c) => ({ ...c, [q.id]: true }));
                  }
                }}
                placeholder={
                  q.type === "fill" ? "Type the missing word or phrase…" : "Type your answer…"
                }
                className={
                  isChecked && aiState.result
                    ? aiState.result.correct
                      ? "border-green-500 dark:border-green-400"
                      : "border-red-500 dark:border-red-400"
                    : ""
                }
              />
              {useAi && !isChecked ? (
                <p className="text-xs text-[var(--muted)]">
                  <Sparkles className="mr-0.5 inline h-3 w-3" aria-hidden />
                  Ghadi will check your answer with AI — synonyms and paraphrases accepted
                </p>
              ) : null}
            </div>
          )}
        </fieldset>

        <button
          type="button"
          onClick={() => setMarked((m) => ({ ...m, [q.id]: !m[q.id] }))}
          aria-pressed={Boolean(marked[q.id])}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:underline"
        >
          <Bookmark
            className={`h-4 w-4 ${marked[q.id] ? "fill-amber-400 text-amber-500" : ""}`}
            aria-hidden
          />
          {marked[q.id] ? "Marked for review" : "Mark for review"}
        </button>

        {/* ── Feedback area ── */}

        {/* Ghadi AI feedback (fill/short) */}
        {useAi && (aiState.loading || aiState.result) ? (
          <GhadiFeedback
            loading={aiState.loading}
            correct={aiState.result?.correct ?? null}
            feedback={aiState.result?.feedback ?? null}
            correctAnswer={aiState.result?.correctAnswer ?? null}
          />
        ) : null}

        {/* AI check error */}
        {useAi && aiState.error ? (
          <Notice tone="error">
            <span className="font-medium">Ghadi couldn&apos;t check this answer:</span>{" "}
            {aiState.error}.
            <button
              className="ml-2 underline"
              onClick={() =>
                setAiChecks((prev) => ({
                  ...prev,
                  [q.id]: { loading: false, result: null, error: null },
                }))
              }
            >
              Try again
            </button>
          </Notice>
        ) : null}

        {/* Exact-match feedback (MCQ / TF) */}
        {isLocalChecked && !useAi ? (
          <div className="space-y-2" aria-live="polite">
            <Notice tone={localCorrect ? "good" : "error"}>
              <span className="font-medium">{localCorrect ? "Correct!" : "Not quite"}</span>
              {!localCorrect ? (
                <span className="block">Correct answer: {q.correct.join(" / ")}</span>
              ) : null}
              {q.explanation && quiz.includeExplanations !== false ? (
                <span className="mt-1 block">{q.explanation}</span>
              ) : null}
            </Notice>
          </div>
        ) : null}
      </Card>

      {/* Navigation */}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Previous
        </Button>
        <div className="flex gap-2">
          {feedbackMode === "immediate" && !isChecked ? (
            useAi ? (
              /* AI check button for fill-in-blank */
              <Button
                variant="secondary"
                disabled={response.trim() === "" || aiState.loading}
                onClick={() => void triggerAiCheck()}
              >
                {aiState.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden />
                )}
                Check with Ghadi
              </Button>
            ) : (
              /* Exact-match check for MCQ / TF */
              <Button
                variant="secondary"
                disabled={response.trim() === ""}
                onClick={() => setChecked((c) => ({ ...c, [q.id]: true }))}
              >
                Check answer
              </Button>
            )
          ) : null}

          {last ? (
            <Button onClick={() => setConfirming(true)}>
              <Flag className="h-4 w-4" aria-hidden /> Review &amp; submit
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                <Flag className="h-4 w-4" aria-hidden /> Submit
              </Button>
              <Button onClick={() => setIndex(index + 1)}>
                {response.trim() === "" ? "Skip" : "Next"}{" "}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>

      {confirming ? (
        <Card
          className="space-y-3 border-2 border-brand-400"
          role="alertdialog"
          aria-labelledby="submit-title"
        >
          <h2 id="submit-title" className="text-lg font-semibold">
            Submit your exam?
          </h2>
          <p className="text-sm">
            {answeredCount} of {questions.length} answered.
            {unanswered.length > 0
              ? ` ${unanswered.length} unanswered (${unanswered
                  .map((x) => questions.indexOf(x) + 1)
                  .join(", ")}) will count as incorrect.`
              : ""}
            {markedCount > 0 ? ` ${markedCount} marked for review.` : ""}
          </p>
          <p className="text-xs text-[var(--muted)]">You cannot change answers after submitting.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={finish}>Submit exam</Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep working
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
