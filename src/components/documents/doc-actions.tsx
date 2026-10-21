"use client";
import { BookOpen, FileText, Layers, ListChecks, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, Notice, useToast } from "@/components/ui/primitives";
import { generateDeckFromDocument, generateNoteFromDocument } from "@/lib/actions";
import { analyzeTextQuality } from "@/lib/study/quality";
import { errorMessage } from "@/lib/utils";
import type { StudyDocument } from "@/lib/validation/schemas";

const linkCls =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors";

/** The four things you can do with a document, each opening its own workflow. Nothing generates by itself. */
export function DocActions({ doc }: { doc: StudyDocument }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"notes" | "cards" | null>(null);
  const quality = useMemo(() => analyzeTextQuality(doc.text), [doc.text]);
  const blocked = doc.status !== "ready" || quality.level === "poor";

  async function go(kind: "notes" | "cards") {
    setBusy(kind);
    try {
      if (kind === "notes") router.push(`/notes/${(await generateNoteFromDocument(doc)).item.id}`);
      else router.push(`/flashcards/${(await generateDeckFromDocument(doc, 15)).item.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">What would you like to do?</h2>
      {blocked ? (
        <Notice tone="warn">
          Fix the extracted text below first. Ghadi will not explain or quiz you on unreadable text.
        </Notice>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {blocked ? (
          <>
            <span
              className={`${linkCls} cursor-not-allowed bg-[var(--surface-2)] text-[var(--muted)]`}
              aria-disabled="true"
            >
              <BookOpen className="h-4 w-4" aria-hidden /> Study this material
            </span>
            <span
              className={`${linkCls} cursor-not-allowed bg-[var(--surface-2)] text-[var(--muted)]`}
              aria-disabled="true"
            >
              <ListChecks className="h-4 w-4" aria-hidden /> Make a quiz
            </span>
          </>
        ) : (
          <>
            <Link
              href={`/study/${doc.id}`}
              className={`${linkCls} bg-brand-600 text-white hover:bg-brand-700`}
            >
              <BookOpen className="h-4 w-4" aria-hidden /> Study this material
            </Link>
            <Link
              href={`/quizzes/new?doc=${doc.id}`}
              className={`${linkCls} border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]`}
            >
              <ListChecks className="h-4 w-4" aria-hidden /> Make a quiz
            </Link>
          </>
        )}
        <Button
          variant="secondary"
          size="lg"
          disabled={blocked || busy !== null}
          onClick={() => void go("notes")}
        >
          {busy === "notes" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <FileText className="h-4 w-4" aria-hidden />
          )}
          Quick study notes
        </Button>
        <Button
          variant="secondary"
          size="lg"
          disabled={blocked || busy !== null}
          onClick={() => void go("cards")}
        >
          {busy === "cards" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Layers className="h-4 w-4" aria-hidden />
          )}
          Flashcards
        </Button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        <strong>Study</strong> teaches you the material. <strong>Quiz</strong> tests what you know.
        They are separate.
      </p>
    </Card>
  );
}
