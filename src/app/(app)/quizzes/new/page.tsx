import { Suspense } from "react";
import { QuizSetup } from "@/components/quiz/quiz-setup";
import { PageHeader } from "@/components/ui/primitives";

export default function NewQuizPage() {
  return (
    <>
      <PageHeader
        title="Quick Quiz"
        description="Test what you know. Pick a source, set it up, and create your exam."
      />
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}>
        <QuizSetup />
      </Suspense>
    </>
  );
}
