"use client";
import { ImagePlus, Scissors } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, Notice, useToast } from "@/components/ui/primitives";
import { correctDocumentText, restoreOriginalText } from "@/lib/storage/repo";
import { analyzeTextQuality } from "@/lib/study/quality";
import { errorMessage } from "@/lib/utils";
import type { StudyDocument } from "@/lib/validation/schemas";

/**
 * Shown when the extracted text is garbled. The learner can strip the noise, fix the text by hand, or
 * go back and upload a clearer file. Generation stays blocked until the text passes the check.
 */
export function TextReview({
  doc,
  onContinue,
  mode,
}: {
  doc: StudyDocument;
  /** Called after the (possibly corrected) text is usable and the user chooses to go on. */
  onContinue?: () => void;
  mode: "blocked" | "warn";
}) {
  const toast = useToast();
  const [text, setText] = useState(doc.text);
  const [busy, setBusy] = useState(false);
  const q = useMemo(() => analyzeTextQuality(text), [text]);

  async function save(next: string) {
    setBusy(true);
    try {
      await correctDocumentText(doc.id, next);
      setText(next);
      toast("Text saved. Every later AI request will use your corrected text.", "good");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      const restored = await restoreOriginalText(doc.id);
      setText(restored.text);
      toast("Original extraction restored.", "good");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 border-2 border-amber-400">
      <h2 className="text-lg font-semibold">
        {mode === "blocked"
          ? "This text is not readable enough to study"
          : "Check the extracted text"}
      </h2>
      <Notice tone={q.level === "poor" ? "error" : "warn"}>
        <span className="block">{q.message}</span>
        <span className="block text-xs">
          {Math.round(q.score * 100)}% of the words look real · {q.noisyLines} of {q.lines} lines
          look like noise
        </span>
      </Notice>
      {q.issues.length > 0 ? (
        <ul className="list-disc space-y-1 ps-5 text-sm">
          {q.issues.map((i) => (
            <li key={i.code}>
              <span className={i.severity === "block" ? "font-medium" : undefined}>
                {i.message}
              </span>
              {i.examples.length > 0 ? (
                <span
                  className="mt-0.5 block break-all font-mono text-xs text-[var(--muted)]"
                  dir="auto"
                >
                  {i.examples.slice(0, 2).join("  ·  ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {q.examples.length > 0 ? (
        <div>
          <p className="text-sm font-medium">Examples of unreadable lines:</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5 font-mono text-xs text-[var(--muted)]">
            {q.examples.map((e) => (
              <li key={e} className="break-all">
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-sm">
        This usually happens with photos that are blurry, tilted, handwritten, or have several
        columns. Upload a clearer photo or the original PDF/Word file (you can choose “Read with
        OpenAI” when importing a photo or scan), or correct the text below. Ghadi will not write a
        confident study guide from text it cannot trust.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          <ImagePlus className="h-4 w-4" aria-hidden /> Upload a clearer file
        </Link>
        {q.noisyLines > 0 && q.cleaned.trim() ? (
          <Button variant="secondary" disabled={busy} onClick={() => void save(q.cleaned)}>
            <Scissors className="h-4 w-4" aria-hidden /> Remove {q.noisyLines} noisy lines
          </Button>
        ) : null}
      </div>
      {doc.originalText ? (
        <details className="rounded-lg border border-[var(--border)] p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Compare with the original extraction
          </summary>
          <pre
            className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--muted)]"
            dir="auto"
          >
            {doc.originalText.slice(0, 6000)}
          </pre>
          <Button
            className="mt-2"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void restore()}
          >
            Restore the original extraction
          </Button>
        </details>
      ) : null}
      <div className="space-y-1">
        <label htmlFor="text-fix" className="text-sm font-medium">
          Correct the text yourself
        </label>
        <textarea
          id="text-fix"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-mono text-sm"
          dir="auto"
          maxLength={500_000}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy || text === doc.text} onClick={() => void save(text)}>
            Save corrections
          </Button>
          <span className="text-xs text-[var(--muted)]" aria-live="polite">
            {q.level === "poor"
              ? "Still unreadable"
              : q.level === "fair"
                ? "Better, but still check it"
                : "Looks readable now"}
          </span>
        </div>
      </div>
      {mode === "warn" && onContinue ? (
        <Button onClick={onContinue} disabled={text !== doc.text}>
          Continue with this text
        </Button>
      ) : null}
    </Card>
  );
}
