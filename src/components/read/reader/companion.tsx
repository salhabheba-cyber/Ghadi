"use client";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { ApiFailure, patch, post } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";
import { useMe } from "../student-shell";

type Task = "define" | "simplify" | "ask" | "vocab";

/** Optional AI reading helper. Reading never depends on it; nothing is sent until the child agrees. */
export function CompanionPanel({
  slug,
  getSelection,
  pageText,
  dir,
}: {
  slug: string;
  getSelection: () => { text: string; context: string };
  pageText: string;
  dir: "rtl" | "ltr";
}) {
  const { t } = useReadLang();
  const { me, aiAvailable, refresh } = useMe();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [vocab, setVocab] = useState<{ word: string; options: string[]; answer: number }[] | null>(
    null,
  );
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);

  if (!aiAvailable) {
    return (
      <section
        aria-label={t("helper")}
        className="rounded-xl border border-[var(--border)] p-3 text-sm"
      >
        <h3 className="mb-1 flex items-center gap-2 font-bold">
          <Sparkles aria-hidden className="h-4 w-4" />
          {t("helper")}
        </h3>
        <p className="text-[var(--muted)]">{t("aiOff")}</p>
      </section>
    );
  }

  async function run(task: Task) {
    setErr(null);
    setAnswer(null);
    setVocab(null);
    setPicked({});
    const sel = getSelection();
    const needsSelection = task === "define" || task === "simplify";
    if (needsSelection && !sel.text) {
      setErr(t("selectText"));
      return;
    }
    const passage =
      task === "vocab" || (task === "ask" && !sel.text)
        ? pageText
        : task === "define"
          ? sel.context || sel.text
          : sel.text;
    setBusy(true);
    try {
      const body = {
        book: slug,
        passage: passage.slice(0, 1500),
        word: task === "define" ? sel.text.slice(0, 60) : undefined,
        question: task === "ask" ? question : undefined,
      };
      const r = await post<{ text?: string; items?: typeof vocab }>(`ai/${task}`, body);
      if (task === "vocab") setVocab(r.items ?? []);
      else setAnswer(r.text ?? "");
    } catch (e) {
      if (e instanceof ApiFailure && e.code === "ai-consent") setConsentOpen(true);
      else setErr(e instanceof ApiFailure && e.status > 0 ? e.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  }
  async function consent(yes: boolean) {
    setConsentOpen(false);
    if (!yes) return;
    await patch("me", { aiConsent: true }).catch(() => undefined);
    refresh();
  }

  const btn =
    "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-50";
  return (
    <section aria-label={t("helper")} className="flex flex-col gap-3 text-sm">
      <div>
        <h3 className="flex items-center gap-2 font-bold">
          <Sparkles aria-hidden className="h-4 w-4 text-amber-500" />
          {t("helper")}
        </h3>
        <p className="text-xs text-[var(--muted)]">{t("helperOptional")}</p>
      </div>
      {!me.aiConsent ? (
        <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-900/30">
          <p className="mb-2 font-semibold">{t("consentTitle")}</p>
          <p className="mb-3 text-xs leading-relaxed">{t("consentBody")}</p>
          <div className="flex gap-2">
            <button
              onClick={() => consent(true)}
              className="rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white hover:bg-brand-700"
            >
              {t("consentYes")}
            </button>
            <button
              onClick={() => consent(false)}
              className="rounded-lg border border-[var(--border)] px-3 py-2"
            >
              {t("consentNo")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2">
            <button className={btn} disabled={busy} onClick={() => run("define")}>
              {t("defineWord")}
            </button>
            <button className={btn} disabled={busy} onClick={() => run("simplify")}>
              {t("simplify")}
            </button>
            <button className={btn} disabled={busy} onClick={() => run("vocab")}>
              {t("wordGame")}
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim()) void run("ask");
            }}
            className="flex gap-2"
          >
            <input
              dir="auto"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              placeholder={t("yourQuestion")}
              aria-label={t("askQuestion")}
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            />
            <button
              disabled={busy || !question.trim()}
              className="rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white disabled:opacity-50"
            >
              {t("send")}
            </button>
          </form>
        </>
      )}
      <div aria-live="polite">
        {busy ? <p className="text-[var(--muted)]">{t("thinking")}</p> : null}
        {err ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-2 text-red-800 dark:bg-red-950/40 dark:text-red-200"
          >
            {err}
          </p>
        ) : null}
        {answer ? (
          <div dir={dir} className="rounded-xl bg-[var(--surface-2)] p-3 leading-relaxed">
            <p className="whitespace-pre-wrap">{answer}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{t("aiMayErr")}</p>
          </div>
        ) : null}
        {vocab ? (
          <ol className="flex flex-col gap-3">
            {vocab.map((v, i) => (
              <li key={i} dir={dir} className="rounded-xl border border-[var(--border)] p-3">
                <p className="mb-1 font-semibold">{v.word}</p>
                {v.options.map((o, oi) => {
                  const chosen = picked[i] === oi;
                  const done = picked[i] !== undefined;
                  return (
                    <button
                      key={oi}
                      disabled={done}
                      onClick={() => setPicked((p) => ({ ...p, [i]: oi }))}
                      className={`mb-1 block w-full rounded-lg border px-2 py-1.5 text-start ${done && oi === v.answer ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15" : chosen ? "border-red-400 bg-red-50 dark:bg-red-950/30" : "border-[var(--border)]"}`}
                    >
                      {o}
                    </button>
                  );
                })}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      {consentOpen ? (
        <p role="status" className="text-xs">
          {t("consentTitle")}
        </p>
      ) : null}
    </section>
  );
}
