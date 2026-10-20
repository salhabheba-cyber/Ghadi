"use client";
import { ListChecks } from "lucide-react";
import Link from "next/link";
import { OriginBadge } from "@/components/origin-badge";
import { EmptyState, Notice, PageHeader } from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import { getDb } from "@/lib/storage/db";
import { accuracy } from "@/lib/study/quiz-engine";
import { formatDate, formatDateTime } from "@/lib/utils";

export default function QuizzesPage() {
  const { data, error } = useLive(async () => {
    const db = getDb();
    const [quizzes, attempts] = await Promise.all([
      db.quizzes.orderBy("updatedAt").reverse().toArray(),
      db.attempts.orderBy("completedAt").reverse().toArray(),
    ]);
    return { quizzes, attempts };
  }, []);

  return (
    <>
      <PageHeader
        title="Quizzes"
        description="Practise with questions built from your documents."
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {data && data.quizzes.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-8 w-8" />}
          title="No quizzes yet"
          action={
            <Link href="/documents" className="text-brand-600 underline dark:text-brand-400">
              Add a document
            </Link>
          }
        >
          Import a document, then choose “Generate quiz”.
        </EmptyState>
      ) : null}
      <ul className="space-y-2">
        {data?.quizzes.map((q) => {
          const mine = data.attempts.filter((a) => a.quizId === q.id);
          const best = mine.length
            ? Math.max(...mine.map((a) => accuracy(a.score, a.total) ?? 0))
            : null;
          return (
            <li key={q.id}>
              <Link
                href={`/quizzes/${q.id}`}
                className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-brand-400"
              >
                <p className="font-medium">{q.title}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  <OriginBadge origin={q.origin} /> {q.questions.length} questions · {q.difficulty}{" "}
                  · {formatDate(q.createdAt)}
                  {best !== null
                    ? ` · best ${best}% over ${mine.length} attempt${mine.length === 1 ? "" : "s"}`
                    : " · not attempted"}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
      {data && data.attempts.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">Recent attempts</h2>
          <ul className="space-y-1 text-sm">
            {data.attempts.slice(0, 10).map((a) => (
              <li
                key={a.id}
                className="flex justify-between rounded-lg bg-[var(--surface)] px-3 py-2"
              >
                <span className="truncate">{a.quizTitle}</span>
                <span className="shrink-0 text-[var(--muted)]">
                  {a.score}/{a.total} · {formatDateTime(a.completedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
