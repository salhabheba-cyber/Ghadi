"use client";
import { ArrowLeft, Loader2, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { GuideView } from "@/components/study/guide-view";
import { TextReview } from "@/components/study/text-review";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Notice,
  PageHeader,
  Select,
  useConfirm,
  useToast,
} from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import { useEnsureAiConsent } from "@/hooks/use-ai-consent";
import {
  generateDeckFromDocument,
  generateStudyGuide,
  UnreadableTextError,
  type GuideProgress,
} from "@/lib/actions";
import { ProviderError } from "@/lib/ai/types";
import { getDocument, getGuideForDocument, saveGuide } from "@/lib/storage/repo";
import { analyzeTextQuality } from "@/lib/study/quality";
import { hashText } from "@/lib/study/hash";
import { errorMessage } from "@/lib/utils";

const LANGS = [
  ["same as source", "Same as the document"],
  ["English", "English"],
  ["French", "French"],
  ["Modern Standard Arabic", "Arabic"],
] as const;

export default function StudyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const ensureConsent = useEnsureAiConsent();
  const { data: doc, loading: docLoading } = useLive(() => getDocument(id), [id]);
  const { data: guide, loading: guideLoading } = useLive(() => getGuideForDocument(id), [id]);
  const [language, setLanguage] = useState("same as source");
  const [progress, setProgress] = useState<GuideProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipReview, setSkipReview] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const quality = useMemo(() => (doc ? analyzeTextQuality(doc.text) : null), [doc]);
  const generating = progress !== null;
  const stale = !!doc && !!guide?.sourceHash && guide.sourceHash !== hashText(doc.text);

  async function generate(useOffline = false) {
    if (!doc) return;
    if (!useOffline && !(await ensureConsent("text"))) return;
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setProgress({ done: 0, total: 1, label: "Starting" });
    try {
      await generateStudyGuide(
        doc,
        { language, onProgress: setProgress },
        { signal: controller.signal, useOffline },
      );
      toast("Your study guide is ready.", "good");
    } catch (e) {
      if (e instanceof ProviderError && e.code === "cancelled")
        setError("Generation was cancelled.");
      else if (e instanceof UnreadableTextError) setError(e.message);
      else setError(errorMessage(e));
    } finally {
      setProgress(null);
      abort.current = null;
    }
  }
  if (docLoading || guideLoading) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  if (!doc && !guide)
    return (
      <EmptyState
        title="Nothing to study here"
        action={
          <Link href="/library" className="text-brand-600 underline dark:text-brand-400">
            Open the library
          </Link>
        }
      >
        This document may have been deleted.
      </EmptyState>
    );

  async function regenerate() {
    const ok = await confirm({
      title: "Write the guide again?",
      message: "The current guide is replaced. Your own notes are kept.",
      confirmLabel: "Write again",
    });
    if (ok) void generate();
  }
  async function flashcards() {
    if (!doc) return;
    if (!(await ensureConsent("text"))) return;
    setAction("cards");
    try {
      const r = await generateDeckFromDocument(doc, 15);
      toast("Flashcards created.", "good");
      router.push(`/flashcards/${r.item.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setAction(null);
    }
  }

  const title = guide?.title ?? doc?.title ?? "Study";
  return (
    <>
      <Link
        href={doc ? `/documents/${doc.id}` : "/library"}
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> {doc ? "Document" : "Library"}
      </Link>
      <PageHeader
        title={title}
        description="Study guide: a step-by-step explanation of your material"
      />
      <div className="space-y-4">
        {doc && !guide ? (
          <Card className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">Source:</span> {doc.kind.toUpperCase()} ·{" "}
              {doc.wordCount.toLocaleString()} words · read by{" "}
              <span className="font-medium">{doc.extractionMethod}</span> ·{" "}
              <span
                className={
                  quality?.level === "good"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-amber-800 dark:text-amber-200"
                }
              >
                text quality: {quality?.level}
              </span>
            </p>
            <p
              className="line-clamp-3 rounded-lg bg-[var(--surface-2)] p-2 text-sm text-[var(--muted)]"
              dir="auto"
            >
              {doc.text.slice(0, 400)}
            </p>
          </Card>
        ) : null}

        {doc && !guide && quality && quality.level === "poor" ? (
          <TextReview doc={doc} mode="blocked" />
        ) : null}
        {doc && !guide && quality && quality.level === "fair" && !skipReview ? (
          <TextReview doc={doc} mode="warn" onContinue={() => setSkipReview(true)} />
        ) : null}

        {doc &&
        !guide &&
        quality &&
        (quality.level === "good" || (quality.level === "fair" && skipReview)) ? (
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">Teach me this material</h2>
            <p className="text-sm text-[var(--muted)]">
              Written by OpenAI through this app&apos;s server. Nothing is sent until you press the
              button, and OpenAI API usage may cost money (it is separate from a ChatGPT
              subscription).
            </p>
            <Field label="Explain in">
              {(fid) => (
                <Select
                  id={fid}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={generating}
                >
                  {LANGS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {!generating ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void generate()}>
                  <Sparkles className="h-4 w-4" aria-hidden /> Write my study guide
                </Button>
                <Button variant="secondary" onClick={() => void generate(true)}>
                  Basic outline (no AI)
                </Button>
              </div>
            ) : null}
          </Card>
        ) : null}

        {generating && progress ? (
          <Card className="space-y-2" aria-live="polite">
            <p className="flex items-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {progress.label}
            </p>
            <div
              className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              aria-label="Study guide progress"
            >
              <div
                className="h-full bg-brand-600 transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
            <Button size="sm" variant="secondary" onClick={() => abort.current?.abort()}>
              <Square className="h-3 w-3" aria-hidden /> Cancel
            </Button>
          </Card>
        ) : null}

        {error ? (
          <Notice tone="error">
            <span className="block">{error}</span>
            {doc && !(error.startsWith("The text") || error.includes("not reliable")) ? (
              <span className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void generate()}>
                  Try OpenAI again
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void generate(true)}>
                  Make a basic outline without AI
                </Button>
              </span>
            ) : null}
          </Notice>
        ) : null}

        {guide && stale ? (
          <Notice tone="warn">
            The text of this document changed (for example you corrected it) after this guide was
            written. Write the guide again to use the corrected text.
          </Notice>
        ) : null}

        {guide ? (
          <GuideView
            guide={guide}
            documentAvailable={!!doc}
            busyAction={generating ? "generating" : action}
            onNotes={(userNotes) =>
              void saveGuide({ ...guide, userNotes })
                .then(() => toast("Notes saved.", "good"))
                .catch((e: unknown) => toast(errorMessage(e), "error"))
            }
            onRegenerate={() => void regenerate()}
            onFlashcards={() => void flashcards()}
          />
        ) : null}
      </div>
    </>
  );
}
