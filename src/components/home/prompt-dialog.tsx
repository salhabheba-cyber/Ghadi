"use client";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Dialog, Field, Notice, Textarea, useToast } from "@/components/ui/primitives";
import { useLanguage } from "@/hooks/use-language";
import { useSettings } from "@/hooks/use-settings";
import { processPastedText, toStudyDocument } from "@/lib/document-processing/process";
import { generateQuizFromTopic } from "@/lib/actions";
import { saveDocument } from "@/lib/storage/repo";
import { errorMessage } from "@/lib/utils";

type Phase = "idle" | "working" | "done";

/** Reads the server-sent-event stream from /api/ai/chat and reports each text chunk. */
async function streamAnswer(
  prompt: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }], consent: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `The AI service answered with an error (${res.status}).`;
    try {
      const j = (await res.json()) as { message?: string; error?: { message?: string } };
      message = j.error?.message ?? j.message ?? message;
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      const line = ev.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      const parsed: unknown = JSON.parse(data);
      if (typeof parsed === "string") onChunk(parsed);
      else if (parsed && typeof parsed === "object" && "error" in parsed)
        throw new Error(String((parsed as { error: unknown }).error));
    }
  }
}

export function PromptDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (docId: string) => void;
}) {
  const { t } = useLanguage();
  const settings = useSettings();
  const toast = useToast();
  const router = useRouter();
  const [quizBusy, setQuizBusy] = useState(false);
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<"not-configured" | "needs-consent" | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const trimmed = text.trim();
  const busy = phase === "working" || quizBusy;

  function close() {
    abortRef.current?.abort();
    setPhase("idle");
    onClose();
  }

  async function ask() {
    setError(null);
    setNotice(null);
    setAnswer("");
    if (!settings.hostedConsent) {
      setNotice("needs-consent");
      return;
    }
    setPhase("working");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const status = await fetch("/api/ai/status", { signal: ctrl.signal });
      const s = (await status.json()) as { configured?: boolean };
      if (!status.ok || !s.configured) {
        setNotice("not-configured");
        setPhase("idle");
        return;
      }
      let acc = "";
      await streamAnswer(
        trimmed,
        (chunk) => {
          acc += chunk;
          setAnswer(acc);
        },
        ctrl.signal,
      );
      if (!acc.trim()) throw new Error("The AI service returned an empty answer.");
      setPhase("done");
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(errorMessage(e));
      setPhase("idle");
    }
  }

  async function topicQuiz() {
    setError(null);
    setNotice(null);
    if (settings.provider === "offline") {
      setNotice("not-configured");
      return;
    }
    if (settings.provider === "hosted" && !settings.hostedConsent) {
      setNotice("needs-consent");
      return;
    }
    setQuizBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await generateQuizFromTopic(
        trimmed,
        {
          count: 8,
          difficulty: "medium",
          types: ["mcq", "tf", "short"],
          includeExplanations: true,
          feedbackMode: "end",
        },
        { signal: ctrl.signal },
      );
      toast(`Saved “${r.item.title}”.`, "good");
      onClose();
      router.push(`/quizzes/${r.item.id}`);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(errorMessage(e));
    } finally {
      setQuizBusy(false);
    }
  }

  async function save(title: string, body: string, aiGenerated: boolean) {
    try {
      const doc = toStudyDocument(processPastedText(title.slice(0, 80), body));
      if (aiGenerated) doc.warnings = [t.promptAiNotice];
      const saved = await saveDocument(doc);
      if (saved.status === "empty") {
        toast("No readable text to save.", "error");
        return;
      }
      toast(`Saved “${saved.title}”.`, "good");
      onSaved(saved.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Dialog open={open} onClose={close} title={t.promptTitle} size="lg">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && !busy) void ask();
        }}
      >
        <Field label={t.promptLabel}>
          {(id) => (
            <Textarea
              id={id}
              rows={5}
              required
              maxLength={4000}
              value={text}
              placeholder={t.promptPlaceholder}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>

        {notice === "not-configured" ? (
          <Notice tone="warn">
            {t.promptNotConfigured} {t.promptOffline}
          </Notice>
        ) : null}
        {notice === "needs-consent" ? (
          <Notice tone="warn">
            <span className="block">{t.promptNeedsConsent}</span>
            <Link href="/settings" className="mt-1 inline-block font-medium underline">
              {t.openSettings}
            </Link>
            <span className="mt-1 block">{t.promptOffline}</span>
          </Notice>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!trimmed || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? t.promptThinking : t.promptAsk}
          </Button>
          <Button
            variant="secondary"
            disabled={!trimmed || busy}
            onClick={() => void save(trimmed.split("\n")[0] ?? "Prompt", trimmed, false)}
          >
            {t.promptUseAsSource}
          </Button>
          <Button variant="secondary" disabled={!trimmed || busy} onClick={() => void topicQuiz()}>
            {quizBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {quizBusy ? t.promptTopicQuizWorking : t.promptTopicQuiz}
          </Button>
        </div>
        <p className="text-xs text-[var(--muted)]">{t.promptTopicQuizNotice}</p>
      </form>

      {answer ? (
        <div className="mt-4 space-y-3" aria-live="polite">
          <Notice tone="info">{t.promptAiNotice}</Notice>
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
            {answer}
          </div>
          {phase === "done" ? (
            <Button onClick={() => void save(`AI: ${trimmed}`, answer, true)}>
              {t.promptSaveAnswer}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
