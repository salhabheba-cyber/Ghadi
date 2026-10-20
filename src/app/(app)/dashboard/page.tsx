"use client";
import {
  BookOpen,
  Brain,
  FileText,
  Flame,
  Layers,
  ListChecks,
  NotebookPen,
  Target,
} from "lucide-react";
import Link from "next/link";
import { Bars } from "@/components/bars";
import { Button, Card, EmptyState, Notice, PageHeader } from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import { useSettings } from "@/hooks/use-settings";
import { getDb } from "@/lib/storage/db";
import {
  activityDays,
  cardStats,
  currentStreak,
  longestStreak,
  quizAccuracy,
  reviewsPerDay,
  reviewsToday,
  upcomingReviews,
} from "@/lib/stats";
import { formatDateTime } from "@/lib/utils";

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <Icon className="h-4 w-4 text-brand-500" aria-hidden /> {label}
      </p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {hint ? <p className="text-xs text-[var(--muted)]">{hint}</p> : null}
    </Card>
  );
}

export default function DashboardPage() {
  const settings = useSettings();
  const { data, loading, error } = useLive(async () => {
    const db = getDb();
    const [documents, notes, quizzes, decks, cards, attempts, reviews] = await Promise.all([
      db.documents.count(),
      db.notes.count(),
      db.quizzes.count(),
      db.decks.count(),
      db.cards.toArray(),
      db.attempts.orderBy("completedAt").toArray(),
      db.reviews.toArray(),
    ]);
    return { documents, notes, quizzes, decks, cards, attempts, reviews };
  }, []);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (loading || !data) return <p className="text-sm text-[var(--muted)]">Loading…</p>;

  const { documents, notes, quizzes, decks, cards, attempts, reviews } = data;
  const empty = documents + notes + quizzes + decks === 0;
  const now = new Date();
  const cs = cardStats(cards, now);
  const days = activityDays(reviews, attempts);
  const streak = currentStreak(days, now);
  const acc = quizAccuracy(attempts);
  const today = reviewsToday(reviews, now);

  if (empty) {
    return (
      <>
        <PageHeader title="Dashboard" description="Your real study activity will appear here." />
        <EmptyState
          icon={<BookOpen className="h-8 w-8" />}
          title="Welcome to Ghadi"
          action={
            <Link href="/documents">
              <Button>Add your first document</Button>
            </Link>
          }
        >
          Nothing here is fake: once you import a document and start studying, this page fills up
          with your own progress.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything below is computed from your activity on this device."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={Flame}
          label="Study streak"
          value={`${streak} day${streak === 1 ? "" : "s"}`}
          hint={days.size ? `Longest: ${longestStreak(days)}` : "Study today to start one"}
        />
        <Stat
          icon={Target}
          label="Quiz accuracy"
          value={acc === null ? "—" : `${acc}%`}
          hint={`${attempts.length} attempt${attempts.length === 1 ? "" : "s"}`}
        />
        <Stat
          icon={Brain}
          label="Cards due"
          value={cs.due}
          hint={`${today} / ${settings.dailyGoalCards} reviewed today`}
        />
        <Stat
          icon={Layers}
          label="Mature cards"
          value={cs.mature}
          hint={`${cs.total} total · ${cs.new} new`}
        />
      </div>

      {cs.due > 0 ? (
        <div className="mt-4">
          <Notice tone="info">
            <span className="flex flex-wrap items-center justify-between gap-2">
              {cs.due} card{cs.due === 1 ? " is" : "s are"} ready to review.{" "}
              <Link className="font-medium underline" href="/review">
                Start review
              </Link>
            </span>
          </Notice>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Upcoming reviews (7 days)</h2>
          {cs.total === 0 ? (
            <p className="text-sm text-[var(--muted)]">No flashcards yet.</p>
          ) : (
            <Bars label="Cards due per day" data={upcomingReviews(cards, 7, now)} />
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Reviews, last 14 days</h2>
          {reviews.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No reviews yet.</p>
          ) : (
            <Bars label="Cards reviewed per day" data={reviewsPerDay(reviews, 14, now)} />
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Quiz scores over time</h2>
          {attempts.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Take a quiz to see your progress.</p>
          ) : (
            <Bars
              label="Quiz score percent per attempt"
              unit="%"
              data={attempts.slice(-12).map((a) => ({
                label: new Date(a.completedAt).toLocaleDateString(undefined, {
                  month: "numeric",
                  day: "numeric",
                }),
                count: a.total ? Math.round((a.score / a.total) * 100) : 0,
              }))}
            />
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Library</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <li className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand-500" aria-hidden /> {documents} document
              {documents === 1 ? "" : "s"}
            </li>
            <li className="flex items-center gap-2">
              <NotebookPen className="h-4 w-4 text-brand-500" aria-hidden /> {notes} note
              {notes === 1 ? "" : "s"}
            </li>
            <li className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-brand-500" aria-hidden /> {quizzes} quiz
              {quizzes === 1 ? "" : "zes"}
            </li>
            <li className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-brand-500" aria-hidden /> {decks} deck
              {decks === 1 ? "" : "s"}
            </li>
          </ul>
          {attempts.length > 0 ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Last quiz: {attempts[attempts.length - 1]!.quizTitle} ·{" "}
              {formatDateTime(attempts[attempts.length - 1]!.completedAt)}
            </p>
          ) : null}
        </Card>
      </div>
    </>
  );
}
