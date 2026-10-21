"use client";
import {
  BookOpen,
  ChevronsDownUp,
  Layers,
  ListChecks,
  ListTree,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Notice } from "@/components/ui/primitives";
import { simplifyPassage } from "@/lib/actions";
import { errorMessage } from "@/lib/utils";
import type { StudyGuide } from "@/lib/validation/schemas";
import { ACCENTS, Block } from "./guide-blocks";

function readPos(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

export function GuideView({
  guide,
  documentAvailable,
  busyAction,
  onNotes,
  onRegenerate,
  onFlashcards,
}: {
  guide: StudyGuide;
  documentAvailable: boolean;
  busyAction: string | null;
  onNotes: (text: string) => void;
  onRegenerate: () => void;
  onFlashcards: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const selection = useRef("");
  const [simple, setSimple] = useState<{ busy: boolean; text?: string; error?: string }>({
    busy: false,
  });
  const [notes, setNotes] = useState(guide.userNotes);
  const posKey = `ghadi:guide-pos:${guide.id}`;

  // Remember which section is on screen so "Continue reading" returns to it.
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>("[data-section]");
    if (!els || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            try {
              localStorage.setItem(posKey, e.target.getAttribute("data-section") ?? "0");
            } catch {
              /* optional convenience only */
            }
          }
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [posKey, guide.sections.length]);

  // Phones clear the text selection when a button is tapped, so remember the last selection.
  useEffect(() => {
    const on = () => {
      const t = window.getSelection()?.toString().trim() ?? "";
      if (t.length > 3) selection.current = t;
    };
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, []);

  function jump(i: number) {
    document.getElementById(`sec-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function toggleAll() {
    const all = Array.from(root.current?.querySelectorAll("details") ?? []);
    const open = all.some((d) => !d.open);
    all.forEach((d) => (d.open = open));
  }
  async function explainSelection() {
    const t = selection.current;
    if (!t) {
      setSimple({
        busy: false,
        error: "Select some text in the guide first, then press this button.",
      });
      return;
    }
    setSimple({ busy: true });
    try {
      setSimple({ busy: false, text: await simplifyPassage(t, undefined, guide.language) });
    } catch (e) {
      setSimple({ busy: false, error: errorMessage(e) });
    }
  }

  return (
    <div ref={root} className="space-y-5">
      <Card className="space-y-3 border-2 border-violet-300 dark:border-violet-700">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={guide.origin === "heuristic" ? "warn" : "brand"}>
            {guide.origin === "heuristic"
              ? "Automatic outline"
              : guide.origin === "hosted-ai"
                ? "Written by cloud AI"
                : "Written by local AI"}
          </Badge>
          <span className="text-xs text-[var(--muted)]">{guide.sections.length} sections</span>
        </div>
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="leading-7" dir="auto">
          {guide.overview}
        </p>
        {guide.objectives.length > 0 ? (
          <div>
            <h3 className="mb-1 flex items-center gap-1.5 font-semibold">
              <Target className="h-4 w-4" aria-hidden /> Learning objectives
            </h3>
            <ul className="list-disc space-y-1 ps-5" dir="auto">
              {guide.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {guide.notices.map((n) => (
        <Notice key={n} tone={guide.origin === "heuristic" ? "warn" : "info"}>
          {n}
        </Notice>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => jump(readPos(posKey))}>
          <BookOpen className="h-4 w-4" aria-hidden /> Continue reading
        </Button>
        <Button variant="secondary" size="sm" onClick={toggleAll}>
          <ChevronsDownUp className="h-4 w-4" aria-hidden /> Expand / collapse details
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void explainSelection()}
          disabled={simple.busy}
        >
          <Sparkles className="h-4 w-4" aria-hidden /> Explain selected text simpler
        </Button>
      </div>
      <div aria-live="polite">
        {simple.text ? (
          <Notice tone="info">
            <span className="font-semibold">In simpler words: </span>
            {simple.text}
          </Notice>
        ) : null}
        {simple.error ? <Notice tone="warn">{simple.error}</Notice> : null}
      </div>

      <nav aria-label="Table of contents">
        <details
          className="rounded-xl border border-[var(--border)] p-3"
          open={guide.sections.length <= 6}
        >
          <summary className="flex cursor-pointer items-center gap-2 font-semibold">
            <ListTree className="h-4 w-4" aria-hidden /> Contents
          </summary>
          <ol className="mt-2 space-y-1 ps-1">
            {guide.sections.map((s, i) => (
              <li key={i}>
                <a
                  href={`#sec-${i}`}
                  onClick={(e) => {
                    e.preventDefault();
                    jump(i);
                  }}
                  className="inline-flex items-center gap-2 py-1 text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${ACCENTS[i % ACCENTS.length]!.chip}`}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span dir="auto">{s.heading}</span>
                </a>
              </li>
            ))}
            <li>
              <a
                href="#glossary"
                className="py-1 text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
              >
                Summary and glossary
              </a>
            </li>
          </ol>
        </details>
      </nav>

      {guide.sections.map((s, i) => {
        const accent = ACCENTS[i % ACCENTS.length]!;
        return (
          <section
            key={i}
            id={`sec-${i}`}
            data-section={i}
            className="scroll-mt-20 space-y-4"
            aria-labelledby={`sec-h-${i}`}
          >
            <header className={`rounded-xl border-s-8 p-4 ${accent.bar} ${accent.tint}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Section {i + 1}
              </p>
              <h3 id={`sec-h-${i}`} className="text-xl font-bold" dir="auto">
                {s.heading}
              </h3>
              {s.intro ? (
                <p className="mt-1" dir="auto">
                  {s.intro}
                </p>
              ) : null}
            </header>
            {s.blocks.map((b, bi) => (
              <Block key={bi} block={b} language={guide.language} accent={accent} />
            ))}
            {s.recap ? (
              <aside
                className={`rounded-xl border-2 border-dashed p-3 ${accent.bar}`}
                aria-label={`Recap of section ${i + 1}`}
              >
                <p className="font-semibold">Recap</p>
                <p dir="auto">{s.recap}</p>
              </aside>
            ) : null}
          </section>
        );
      })}

      <Card className="space-y-2 border-2 border-violet-300 dark:border-violet-700" id="glossary">
        <h2 className="text-lg font-semibold">Summary of the whole material</h2>
        <p className="leading-7" dir="auto">
          {guide.finalSummary}
        </p>
      </Card>

      {guide.glossary.length > 0 ? (
        <Card className="space-y-2">
          <h2 className="text-lg font-semibold">Glossary</h2>
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {guide.glossary.map((g) => (
              <div key={g.term} className="rounded-lg bg-[var(--surface-2)] p-2" dir="auto">
                <dt className="font-semibold">{g.term}</dt>
                <dd className="text-sm">{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      <Card className="space-y-2">
        <label htmlFor="guide-notes" className="text-lg font-semibold">
          My notes
        </label>
        <textarea
          id="guide-notes"
          rows={5}
          maxLength={20000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== guide.userNotes && onNotes(notes)}
          placeholder="Write your own notes here. They are saved on this device when you leave the box."
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
          dir="auto"
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Keep studying</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onFlashcards} disabled={!documentAvailable || busyAction !== null}>
            <Layers className="h-4 w-4" aria-hidden />{" "}
            {busyAction === "cards" ? "Creating…" : "Create flashcards from this material"}
          </Button>
          {documentAvailable ? (
            <Link
              href={`/quizzes/new?doc=${guide.documentId}`}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              <ListChecks className="h-4 w-4" aria-hidden /> Create a quiz from this material
            </Link>
          ) : null}
          <Button
            variant="secondary"
            onClick={onRegenerate}
            disabled={!documentAvailable || busyAction !== null}
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Write the guide again
          </Button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Flashcards and quizzes are only created when you choose them here.
        </p>
      </Card>
    </div>
  );
}
