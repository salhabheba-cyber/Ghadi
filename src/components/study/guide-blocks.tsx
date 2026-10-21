"use client";
import {
  AlertTriangle,
  BookMarked,
  CheckCircle2,
  ChevronDown,
  Lightbulb,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { simplifyPassage } from "@/lib/actions";
import { errorMessage } from "@/lib/utils";
import type { GuideBlock } from "@/lib/validation/schemas";
import { FlowDiagram } from "./flow-diagram";

/** One accent per section so a long guide is easy to scan. Text always stays on the normal foreground colour. */
export const ACCENTS = [
  {
    bar: "border-violet-500",
    tint: "bg-violet-50 dark:bg-violet-950/40",
    chip: "bg-violet-600 text-white",
  },
  {
    bar: "border-teal-600",
    tint: "bg-teal-50 dark:bg-teal-950/40",
    chip: "bg-teal-700 text-white",
  },
  {
    bar: "border-amber-500",
    tint: "bg-amber-50 dark:bg-amber-950/40",
    chip: "bg-amber-700 text-white",
  },
  {
    bar: "border-rose-500",
    tint: "bg-rose-50 dark:bg-rose-950/40",
    chip: "bg-rose-700 text-white",
  },
  { bar: "border-sky-600", tint: "bg-sky-50 dark:bg-sky-950/40", chip: "bg-sky-700 text-white" },
  {
    bar: "border-emerald-600",
    tint: "bg-emerald-50 dark:bg-emerald-950/40",
    chip: "bg-emerald-700 text-white",
  },
] as const;
export type Accent = (typeof ACCENTS)[number];

/** "Explain simpler" for one passage. Calls the configured AI and shows the answer in place. */
export function SimplerButton({
  text,
  context,
  language,
}: {
  text: string;
  context?: string;
  language: string;
}) {
  const [state, setState] = useState<{ busy: boolean; answer?: string; error?: string }>({
    busy: false,
  });
  async function go() {
    setState({ busy: true });
    try {
      const answer = await simplifyPassage(text, context, language);
      setState({ busy: false, answer });
    } catch (e) {
      setState({ busy: false, error: errorMessage(e) });
    }
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void go()}
        disabled={state.busy}
        className="inline-flex items-center gap-1 rounded-md px-1 text-xs font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
      >
        {state.busy ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-3 w-3" aria-hidden />
        )}
        {state.busy ? "Simplifying…" : "Explain simpler"}
      </button>
      <div aria-live="polite">
        {state.answer ? (
          <p
            className="mt-1 rounded-lg border border-dashed border-violet-400 bg-[var(--surface)] p-2 text-sm"
            dir="auto"
          >
            <span className="font-semibold">In simpler words: </span>
            {state.answer}
          </p>
        ) : null}
        {state.error ? (
          <p className="mt-1 text-xs text-red-700 dark:text-red-300">{state.error}</p>
        ) : null}
      </div>
    </div>
  );
}

const CALLOUT = {
  important: {
    Icon: CheckCircle2,
    label: "Important",
    cls: "border-violet-500 bg-violet-50 dark:bg-violet-950/40",
  },
  warning: {
    Icon: AlertTriangle,
    label: "Watch out",
    cls: "border-amber-500 bg-amber-50 dark:bg-amber-950/40",
  },
  tip: {
    Icon: Lightbulb,
    label: "Tip",
    cls: "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
  },
} as const;

export function Block({
  block,
  language,
  accent,
}: {
  block: GuideBlock;
  language: string;
  accent: Accent;
}) {
  switch (block.type) {
    case "paragraph":
      return (
        <div>
          <p className="leading-7" dir="auto">
            {block.text}
          </p>
          {block.text.length > 220 ? <SimplerButton text={block.text} language={language} /> : null}
        </div>
      );
    case "keyPoints":
      return (
        <section
          className={`rounded-xl border-s-4 p-3 ${accent.bar} ${accent.tint}`}
          aria-label={block.title}
        >
          <h4 className="mb-1 flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {block.title}
          </h4>
          <ul className="list-disc space-y-1 ps-5" dir="auto">
            {block.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      );
    case "definition":
      return (
        <div className="rounded-xl border border-violet-300 bg-violet-50 p-3 dark:border-violet-700 dark:bg-violet-950/40">
          <p className="flex flex-wrap items-center gap-2">
            <BookMarked className="h-4 w-4 text-violet-700 dark:text-violet-300" aria-hidden />
            <dfn className="font-bold not-italic" dir="auto">
              {block.term}
            </dfn>
            {block.verified === false ? (
              <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                not matched to a quote in your document
              </span>
            ) : null}
          </p>
          <p className="mt-1" dir="auto">
            {block.definition}
          </p>
          {block.sourceExcerpt ? (
            <p className="mt-1 text-xs italic text-[var(--muted)]" dir="auto">
              From your material: “{block.sourceExcerpt}”
            </p>
          ) : null}
          <SimplerButton text={`${block.term}: ${block.definition}`} language={language} />
        </div>
      );
    case "steps":
      return (
        <section aria-label={block.title}>
          <h4 className="mb-2 font-semibold">{block.title}</h4>
          <ol className="space-y-2">
            {block.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${accent.chip}`}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div dir="auto">
                  <p className="font-medium">{s.title}</p>
                  {s.detail ? <p className="text-sm text-[var(--muted)]">{s.detail}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      );
    case "table":
      return (
        <section aria-label={block.title}>
          <h4 className="mb-1 font-semibold">{block.title}</h4>
          <div
            className="overflow-x-auto rounded-lg border border-[var(--border)]"
            tabIndex={0}
            role="region"
            aria-label={`${block.title} table`}
          >
            <table className="w-full min-w-[20rem] text-sm" dir="auto">
              <thead className={accent.tint}>
                <tr>
                  {block.columns.map((c, i) => (
                    <th key={i} scope="col" className="px-3 py-2 text-start font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((r, ri) => (
                  <tr key={ri} className="border-t border-[var(--border)]">
                    {r.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 align-top">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    case "example":
      return (
        <div className="rounded-xl border border-sky-400 bg-sky-50 p-3 dark:border-sky-700 dark:bg-sky-950/40">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            Example: {block.title}
            <span
              className={`rounded px-1.5 text-xs font-medium ${block.source === "document" ? "bg-emerald-700 text-white" : "bg-sky-700 text-white"}`}
            >
              {block.source === "document" ? "From your material" : "Added by Ghadi to clarify"}
            </span>
          </p>
          <p className="mt-1" dir="auto">
            {block.text}
          </p>
          {block.sourceExcerpt ? (
            <p className="mt-1 text-xs italic text-[var(--muted)]" dir="auto">
              “{block.sourceExcerpt}”
            </p>
          ) : null}
        </div>
      );
    case "formula":
      return (
        <div className="rounded-xl border-2 border-violet-500 p-3">
          <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">{block.name}</p>
          <p
            className="my-2 overflow-x-auto rounded-lg bg-[var(--surface-2)] px-3 py-2 text-center font-mono text-lg"
            dir="ltr"
            tabIndex={0}
            role="region"
            aria-label={`Formula ${block.name}`}
          >
            {block.expression}
          </p>
          {block.explanation ? <p dir="auto">{block.explanation}</p> : null}
          {block.workedExample ? (
            <p className="mt-2 rounded-lg bg-[var(--surface-2)] p-2 text-sm" dir="auto">
              <span className="font-semibold">Worked example: </span>
              {block.workedExample}
            </p>
          ) : null}
        </div>
      );
    case "timeline":
      return (
        <section aria-label={block.title}>
          <h4 className="mb-2 font-semibold">{block.title}</h4>
          <ol className={`relative space-y-3 border-s-2 ps-5 ${accent.bar}`}>
            {block.events.map((e, i) => (
              <li key={i} className="relative">
                <span
                  className={`absolute -start-[1.65rem] top-1 h-3 w-3 rounded-full ${accent.chip}`}
                  aria-hidden
                />
                <p className="font-semibold" dir="auto">
                  {e.label}
                </p>
                {e.detail ? (
                  <p className="text-sm text-[var(--muted)]" dir="auto">
                    {e.detail}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      );
    case "flow":
      return (
        <section aria-label={block.title}>
          <h4 className="mb-1 font-semibold">{block.title}</h4>
          <FlowDiagram flow={block} />
        </section>
      );
    case "callout": {
      const c = CALLOUT[block.tone];
      return (
        <div className={`flex gap-2 rounded-xl border-s-4 p-3 ${c.cls}`} role="note">
          <c.Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p dir="auto">
            <span className="font-semibold">{c.label}: </span>
            {block.text}
          </p>
        </div>
      );
    }
    case "detail":
      return (
        <details className="group rounded-xl border border-[var(--border)] p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium">
            <span dir="auto">{block.title}</span>
            <ChevronDown
              className="h-4 w-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <p className="mt-2 leading-7" dir="auto">
            {block.text}
          </p>
          <SimplerButton text={block.text} language={language} />
        </details>
      );
  }
}
