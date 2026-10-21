"use client";
import { BookOpenCheck, Layers, ListChecks, Loader2, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Card, Field, Notice, Select, useToast } from "@/components/ui/primitives";
import { ProviderError, type CallOptions } from "@/lib/ai/types";
import {
  generateDeckFromDocument,
  generateNoteFromDocument,
  generateQuizFromDocument,
} from "@/lib/actions";
import { useSettings } from "@/hooks/use-settings";
import { errorMessage } from "@/lib/utils";
import type { Difficulty, QuestionType, StudyDocument } from "@/lib/validation/schemas";

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  tf: "True / false",
  short: "Short answer",
  fill: "Fill in the blank",
};

export function GeneratePanel({ doc }: { doc: StudyDocument }) {
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const abort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [count, setCount] = useState(8);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [types, setTypes] = useState<QuestionType[]>(["mcq", "tf", "short", "fill"]);
  const [cardCount, setCardCount] = useState(15);
  const [language, setLanguage] = useState("same as source");
  const [includeExplanations, setIncludeExplanations] = useState(true);
  const [feedbackMode, setFeedbackMode] = useState<"immediate" | "end">("end");

  const disabled = doc.status !== "ready" || busy !== null;
  const providerName =
    settings.provider === "offline"
      ? "offline heuristics (no AI model)"
      : settings.provider === "ollama"
        ? `Ollama (${settings.ollamaModel})`
        : "hosted AI";

  const [offlineRetry, setOfflineRetry] = useState<(() => void) | null>(null);

  async function run<T>(
    label: string,
    job: (call: CallOptions) => Promise<{ item: T; notices: string[] }>,
    go: (item: T) => string,
    allowOfflineFallback = false,
  ) {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(label);
    setError(null);
    setNotices([]);
    setOfflineRetry(null);
    try {
      const r = await job({ signal: controller.signal, allowOfflineFallback });
      toast(`${label} done.`, "good");
      router.push(go(r.item));
    } catch (e) {
      if (e instanceof ProviderError && e.code === "cancelled")
        setError("Generation was cancelled.");
      else {
        setError(errorMessage(e));
        // Never swap generators silently: offer offline generation as an explicit choice.
        if (settings.provider !== "offline" && !allowOfflineFallback)
          setOfflineRetry(() => () => void run(label, job, go, true));
      }
    } finally {
      setBusy(null);
      abort.current = null;
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Create study material</h2>
        <p className="text-sm text-[var(--muted)]">
          Generator: {providerName}. Change this in Settings.
        </p>
      </div>
      {doc.status !== "ready" ? (
        <Notice tone="warn">
          This document has no readable text yet, so material cannot be generated.
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="error">
          <span className="block">{error}</span>
          {offlineRetry ? (
            <span className="mt-2 block">
              <Button size="sm" variant="secondary" onClick={offlineRetry}>
                Generate with offline heuristics instead
              </Button>
              <span className="ml-2 text-xs">
                Offline output is rule-based, not written by an AI model, and is labelled as such.
              </span>
            </span>
          ) : null}
        </Notice>
      ) : null}
      {notices.map((n) => (
        <Notice key={n} tone="info">
          {n}
        </Notice>
      ))}

      <div className="grid gap-4 md:grid-cols-3">
        <section
          aria-labelledby="gen-notes"
          className="space-y-3 rounded-lg border border-[var(--border)] p-4"
        >
          <h3 id="gen-notes" className="flex items-center gap-2 font-medium">
            <BookOpenCheck className="h-4 w-4 text-brand-500" aria-hidden /> Study notes
          </h3>
          <p className="text-xs text-[var(--muted)]">
            Summary, key terms, definitions, facts and examples.
          </p>
          <Button
            disabled={disabled}
            onClick={() =>
              void run(
                "Study notes",
                (call) => generateNoteFromDocument(doc, call),
                (n) => `/notes/${n.id}`,
              )
            }
          >
            Generate notes
          </Button>
        </section>

        <section
          aria-labelledby="gen-quiz"
          className="space-y-3 rounded-lg border border-[var(--border)] p-4"
        >
          <h3 id="gen-quiz" className="flex items-center gap-2 font-medium">
            <ListChecks className="h-4 w-4 text-brand-500" aria-hidden /> Quiz
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Questions">
              {(id) => (
                <Select id={id} value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[5, 8, 10, 15, 20].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Difficulty">
              {(id) => (
                <Select
                  id={id}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </Select>
              )}
            </Field>
          </div>
          <Field label="Language">
            {(id) => (
              <Select id={id} value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="same as source">Same as the document</option>
                <option value="English">English</option>
                <option value="French">French</option>
                <option value="Modern Standard Arabic">Arabic</option>
              </Select>
            )}
          </Field>
          <Field label="Show answers">
            {(id) => (
              <Select
                id={id}
                value={feedbackMode}
                onChange={(e) => setFeedbackMode(e.target.value as "immediate" | "end")}
              >
                <option value="end">After I submit the whole quiz</option>
                <option value="immediate">After each question</option>
              </Select>
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeExplanations}
              onChange={(e) => setIncludeExplanations(e.target.checked)}
            />
            Include explanations
          </label>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Question types</legend>
            {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={types.includes(t)}
                  onChange={(e) =>
                    setTypes((cur) => (e.target.checked ? [...cur, t] : cur.filter((x) => x !== t)))
                  }
                />
                {TYPE_LABELS[t]}
              </label>
            ))}
          </fieldset>
          <Button
            disabled={disabled || types.length === 0}
            onClick={() =>
              void run(
                "Quiz",
                (call) =>
                  generateQuizFromDocument(
                    doc,
                    { count, difficulty, types, language, includeExplanations, feedbackMode },
                    call,
                  ),
                (q) => `/quizzes/${q.id}`,
              )
            }
          >
            Generate quiz
          </Button>
        </section>

        <section
          aria-labelledby="gen-cards"
          className="space-y-3 rounded-lg border border-[var(--border)] p-4"
        >
          <h3 id="gen-cards" className="flex items-center gap-2 font-medium">
            <Layers className="h-4 w-4 text-brand-500" aria-hidden /> Flashcards
          </h3>
          <Field label="Cards">
            {(id) => (
              <Select
                id={id}
                value={cardCount}
                onChange={(e) => setCardCount(Number(e.target.value))}
              >
                {[10, 15, 25, 40].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            )}
          </Field>
          <Button
            disabled={disabled}
            onClick={() =>
              void run(
                "Flashcards",
                (call) => generateDeckFromDocument(doc, cardCount, call),
                (d) => `/flashcards/${d.id}`,
              )
            }
          >
            Generate deck
          </Button>
        </section>
      </div>

      {busy ? (
        <div className="flex items-center gap-3" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span className="text-sm">Generating {busy.toLowerCase()}…</span>
          <Button size="sm" variant="secondary" onClick={() => abort.current?.abort()}>
            <Square className="h-3 w-3" aria-hidden /> Cancel
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
