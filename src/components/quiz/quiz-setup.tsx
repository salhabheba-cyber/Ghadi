"use client";
import { FileText, Loader2, Sparkles, Square, Type } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Field,
  Notice,
  Select,
  Textarea,
  useToast,
} from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import { useSettings } from "@/hooks/use-settings";
import { generateQuizFromDocument, generateQuizFromTopic } from "@/lib/actions";
import { ProviderError, type CallOptions } from "@/lib/ai/types";
import { getDb } from "@/lib/storage/db";
import { analyzeTextQuality } from "@/lib/study/quality";
import { errorMessage } from "@/lib/utils";
import type { Difficulty, QuestionType } from "@/lib/validation/schemas";

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  tf: "True / false",
  short: "Short answer",
  fill: "Fill in the blank",
};

/** The dedicated Quick Quiz workflow: choose a source, configure, generate, then take or export the exam. */
export function QuizSetup() {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const settings = useSettings();
  const abort = useRef<AbortController | null>(null);
  const { data: docs } = useLive(
    () => getDb().documents.orderBy("updatedAt").reverse().toArray(),
    [],
  );
  const [source, setSource] = useState<"document" | "topic">(
    params.get("topic") ? "topic" : "document",
  );
  const [docId, setDocId] = useState(params.get("doc") ?? "");
  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const [count, setCount] = useState(8);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [language, setLanguage] = useState("same as source");
  const [types, setTypes] = useState<QuestionType[]>(["mcq", "tf", "short"]);
  const [includeExplanations, setIncludeExplanations] = useState(true);
  const [feedbackMode, setFeedbackMode] = useState<"immediate" | "end">("end");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineRetry, setOfflineRetry] = useState(false);

  const usable = (docs ?? []).filter((d) => d.status === "ready");
  const selected = usable.find((d) => d.id === (docId || usable[0]?.id));
  const quality = useMemo(() => (selected ? analyzeTextQuality(selected.text) : null), [selected]);
  const blocked = source === "document" && (!selected || quality?.level === "poor");
  const topicOffline = source === "topic" && settings.provider === "offline";
  const needsConsent = settings.provider === "hosted" && !settings.hostedConsent;
  const generatorName =
    settings.provider === "offline"
      ? "offline rules"
      : settings.provider === "ollama"
        ? `Ollama (${settings.ollamaModel})`
        : "OpenAI / hosted AI";

  async function run(allowOfflineFallback: boolean) {
    const controller = new AbortController();
    abort.current = controller;
    const call: CallOptions = { signal: controller.signal, allowOfflineFallback };
    setBusy(true);
    setError(null);
    setOfflineRetry(false);
    const req = { count, difficulty, types, language, includeExplanations, feedbackMode };
    try {
      const r =
        source === "topic"
          ? await generateQuizFromTopic(topic.trim(), req, call)
          : await generateQuizFromDocument(selected!, req, call);
      toast("Your quiz is ready.", "good");
      router.push(`/quizzes/${r.item.id}`);
    } catch (e) {
      if (e instanceof ProviderError && e.code === "cancelled")
        setError("Generation was cancelled.");
      else {
        setError(errorMessage(e));
        if (source === "document" && settings.provider !== "offline" && !allowOfflineFallback)
          setOfflineRetry(true);
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  const tab = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium ${
      active ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "border-[var(--border)]"
    }`;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-semibold">1. What should the quiz be about?</h2>
        <div role="radiogroup" aria-label="Quiz source" className="flex gap-2">
          <label className={tab(source === "document")}>
            <input
              type="radio"
              className="sr-only"
              name="src"
              checked={source === "document"}
              onChange={() => setSource("document")}
            />
            <FileText className="h-4 w-4" aria-hidden /> A saved document
          </label>
          <label className={tab(source === "topic")}>
            <input
              type="radio"
              className="sr-only"
              name="src"
              checked={source === "topic"}
              onChange={() => setSource("topic")}
            />
            <Type className="h-4 w-4" aria-hidden /> A topic
          </label>
        </div>
        {source === "document" ? (
          usable.length === 0 ? (
            <Notice tone="info">
              You have no readable documents yet.{" "}
              <Link href="/" className="font-medium underline">
                Add one from the home screen
              </Link>
              .
            </Notice>
          ) : (
            <>
              <Field label="Document">
                {(id) => (
                  <Select
                    id={id}
                    value={selected?.id ?? ""}
                    onChange={(e) => setDocId(e.target.value)}
                  >
                    {usable.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {quality && quality.level !== "good" ? (
                <Notice tone={quality.level === "poor" ? "error" : "warn"}>
                  {quality.message}{" "}
                  {selected ? (
                    <Link href={`/study/${selected.id}`} className="font-medium underline">
                      Review the text
                    </Link>
                  ) : null}
                </Notice>
              ) : null}
            </>
          )
        ) : (
          <>
            <Field label="Topic">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={300}
                  value={topic}
                  placeholder="e.g. The causes of World War I"
                  onChange={(e) => setTopic(e.target.value)}
                />
              )}
            </Field>
            <Notice tone="info">
              Topic quizzes come from the AI&apos;s general knowledge, not from your documents, so
              they are not source-grounded. Check facts that matter.
            </Notice>
            {topicOffline ? (
              <Notice tone="warn">
                Topic quizzes need an AI model.{" "}
                <Link href="/settings" className="font-medium underline">
                  Choose OpenAI or Ollama in Settings
                </Link>
                .
              </Notice>
            ) : null}
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">2. Set it up</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Questions">
            {(id) => (
              <Select id={id} value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[5, 8, 10, 15, 20, 30].map((n) => (
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
              <option value="same as source">Same as the source</option>
              <option value="English">English</option>
              <option value="French">French</option>
              <option value="Modern Standard Arabic">Arabic</option>
            </Select>
          )}
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Question types</legend>
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
            <label key={t} className="flex items-center gap-2 py-0.5 text-sm">
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeExplanations}
            onChange={(e) => setIncludeExplanations(e.target.checked)}
          />
          Include explanations
        </label>
        <Field label="Reveal answers">
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
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">3. Create</h2>
        <p className="text-sm text-[var(--muted)]">
          Generator: {generatorName}. Change it in Settings.
        </p>
        {needsConsent ? (
          <Notice tone="warn">
            Creating the quiz sends text to the cloud AI and may cost money.{" "}
            <Link href="/settings" className="font-medium underline">
              Allow it in Settings
            </Link>
            .
          </Notice>
        ) : null}
        {error ? (
          <Notice tone="error">
            <span className="block">{error}</span>
            {offlineRetry ? (
              <span className="mt-2 block">
                <Button size="sm" variant="secondary" onClick={() => void run(true)}>
                  Make it with offline rules instead
                </Button>
                <span className="ms-2 text-xs">
                  Rule-based, not written by an AI model, and labelled as such.
                </span>
              </span>
            ) : null}
          </Notice>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            disabled={
              busy ||
              types.length === 0 ||
              blocked ||
              needsConsent ||
              topicOffline ||
              (source === "topic" && topic.trim().length < 2)
            }
            onClick={() => void run(false)}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {busy ? "Creating your quiz…" : "Create quiz"}
          </Button>
          {busy ? (
            <Button variant="secondary" onClick={() => abort.current?.abort()}>
              <Square className="h-3 w-3" aria-hidden /> Cancel
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-[var(--muted)]">
          When it is ready you can take the exam in Ghadi or export it as PDF, Word or Excel.
        </p>
      </Card>
    </div>
  );
}
