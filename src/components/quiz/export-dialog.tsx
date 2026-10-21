"use client";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileText,
  FileType2,
  Loader2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, Notice } from "@/components/ui/primitives";
import {
  buildExportDoc,
  LABELS,
  languageFor,
  letter,
  type ExportContent,
  type ExportFormat,
} from "@/lib/export/types";
import { safeFileName } from "@/lib/export";
import { errorMessage } from "@/lib/utils";
import type { Quiz } from "@/lib/validation/schemas";

const FORMATS: { value: ExportFormat; label: string; hint: string; Icon: typeof FileText }[] = [
  { value: "pdf", label: "PDF", hint: "A4, print-ready", Icon: FileType2 },
  { value: "docx", label: "Word (.docx)", hint: "Editable", Icon: FileText },
  { value: "xlsx", label: "Excel (.xlsx)", hint: "Structured sheets", Icon: FileSpreadsheet },
];

const CONTENTS: { value: ExportContent; label: string; desc: string }[] = [
  { value: "quiz", label: "Quiz only", desc: "Questions with no answers anywhere in the file." },
  {
    value: "quiz-and-key",
    label: "Quiz + separate answer key",
    desc: "Questions first, then the key on its own page (or sheet).",
  },
  {
    value: "key",
    label: "Answer key only",
    desc: "Correct answers, with explanations if enabled.",
  },
];

export function toExportQuestions(quiz: Quiz) {
  return quiz.questions.map((q) => ({
    type: q.type,
    prompt: q.prompt,
    options: q.options ?? undefined,
    correct: q.correct,
    explanation: q.explanation ?? undefined,
    difficulty: q.difficulty,
  }));
}

export function ExportDialog({
  quiz,
  onBack,
  onSuccess,
}: {
  quiz: Quiz;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [content, setContent] = useState<ExportContent>("quiz");
  const [includeExplanations, setIncludeExplanations] = useState(false);
  const [studentFields, setStudentFields] = useState(true);
  const [title, setTitle] = useState(quiz.title);
  const [studentName, setStudentName] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const language = languageFor(
    (quiz as { language?: string }).language,
    quiz.questions.map((q) => q.prompt).join(" "),
  );

  // Preview uses the very same projection the server uses, so what you see is what the file holds.
  const preview = useMemo(
    () =>
      buildExportDoc({
        title: title.trim() || quiz.title,
        questions: toExportQuestions(quiz),
        content,
        includeExplanations,
        studentFields,
        studentName,
        date,
        language,
        generatedAt: new Date().toISOString(),
      }),
    [quiz, title, content, includeExplanations, studentFields, studentName, date, language],
  );
  const L = LABELS[preview.language];

  async function download() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/quiz/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || quiz.title,
          questions: toExportQuestions(quiz),
          format,
          content,
          includeExplanations,
          studentFields,
          studentName: studentName.trim() || undefined,
          date: date.trim() || undefined,
          language: (quiz as { language?: string }).language,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? `Export failed (HTTP ${res.status}).`);
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("The server returned an empty file. Nothing was saved.");
      const suffix =
        content === "key" ? "answer_key" : content === "quiz-and-key" ? "with_key" : "quiz";
      const name = safeFileName(`${title.trim() || quiz.title}_${suffix}`, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDone(`${name} was downloaded.`);
      onSuccess();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const radio = (active: boolean) =>
    `flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors ${
      active
        ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
        : "border-[var(--border)] hover:border-brand-300"
    }`;

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </button>
      <h1 className="text-xl font-bold">Export Exam</h1>

      <Card className="space-y-3">
        <h2 className="font-semibold">1. Format</h2>
        <div role="radiogroup" aria-label="Format" className="grid gap-3 sm:grid-cols-3">
          {FORMATS.map(({ value, label, hint, Icon }) => (
            <label key={value} className={radio(format === value)}>
              <input
                type="radio"
                name="export-format"
                value={value}
                checked={format === value}
                onChange={() => setFormat(value)}
                className="mt-1 accent-brand-600"
              />
              <span>
                <span className="flex items-center gap-2 font-medium">
                  <Icon className="h-4 w-4" aria-hidden /> {label}
                </span>
                <span className="text-xs text-[var(--muted)]">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {format === "pdf" && language === "ar" ? (
          <Notice tone="warn">
            PDF export does not support Arabic yet. Choose Word or Excel for this quiz.
          </Notice>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">2. What to include</h2>
        <div role="radiogroup" aria-label="What to include" className="space-y-2">
          {CONTENTS.map((o) => (
            <label key={o.value} className={radio(content === o.value)}>
              <input
                type="radio"
                name="export-content"
                value={o.value}
                checked={content === o.value}
                onChange={() => setContent(o.value)}
                className="mt-1 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="text-xs text-[var(--muted)]">{o.desc}</span>
              </span>
            </label>
          ))}
        </div>
        <label
          className={`flex items-center gap-2 text-sm ${content === "quiz" ? "opacity-50" : ""}`}
        >
          <input
            type="checkbox"
            checked={includeExplanations && content !== "quiz"}
            disabled={content === "quiz"}
            onChange={(e) => setIncludeExplanations(e.target.checked)}
            className="accent-brand-600"
          />
          Include explanations in the answer key
        </label>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">3. Details (optional)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Student name
            <input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Date
            <input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              maxLength={40}
              placeholder="e.g. 21/10/2026"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={studentFields}
            onChange={(e) => setStudentFields(e.target.checked)}
            className="accent-brand-600"
          />
          Show Name / Date / Score fields
        </label>
      </Card>

      <Card className="space-y-3" aria-label="Preview">
        <h2 className="font-semibold">Preview</h2>
        <div
          data-testid="export-preview"
          // Scrollable region: must be keyboard-reachable (WCAG 2.1.1).
          tabIndex={0}
          role="region"
          aria-label="Export preview"
          dir={preview.language === "ar" ? "rtl" : "ltr"}
          className="max-h-80 overflow-auto rounded-lg border border-[var(--border)] bg-white p-4 text-sm text-neutral-900"
        >
          <p className="text-lg font-bold text-brand-700">{preview.title}</p>
          {preview.items ? (
            <>
              {preview.studentFields ? (
                <p className="mt-1 text-xs text-neutral-500">
                  {L.name}: {preview.studentName ?? "________"} · {L.date}:{" "}
                  {preview.date ?? "________"} · {L.score}: ____
                </p>
              ) : null}
              <ol className="mt-3 space-y-3">
                {preview.items.slice(0, 3).map((q) => (
                  <li key={q.number}>
                    <span className="font-medium">
                      {q.number}. {q.prompt}
                    </span>
                    {q.options.map((o, i) => (
                      <span key={i} className="ms-4 block text-neutral-700">
                        {letter(i)}. {o}
                      </span>
                    ))}
                  </li>
                ))}
              </ol>
              {preview.items.length > 3 ? (
                <p className="mt-2 text-xs text-neutral-500">
                  …and {preview.items.length - 3} more questions
                </p>
              ) : null}
            </>
          ) : null}
          {preview.key ? (
            <div
              className={
                preview.items ? "mt-4 border-t border-dashed border-neutral-300 pt-3" : "mt-3"
              }
            >
              <p className="font-semibold">{L.answerKey}</p>
              <ol className="mt-1 space-y-1">
                {preview.key.slice(0, 3).map((k) => (
                  <li key={k.number}>
                    {k.number}. <strong>{k.answer}</strong>
                    {k.explanation ? (
                      <span className="block text-xs text-neutral-500">{k.explanation}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {content === "quiz" ? (
            <p className="mt-3 text-xs text-green-700">No answers are included in this export.</p>
          ) : null}
        </div>
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="info">{done}</Notice> : null}

      <div className="flex flex-wrap gap-3">
        <Button size="lg" disabled={busy} onClick={() => void download()}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          {busy ? "Preparing…" : "Download"}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onBack}>
          <X className="h-4 w-4" aria-hidden /> Cancel
        </Button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Nothing is generated or downloaded until you press Download.
      </p>
    </div>
  );
}
