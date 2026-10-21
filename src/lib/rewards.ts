import { activityDays } from "@/lib/stats";
import type { QuizAttempt, ReviewLog } from "@/lib/validation/schemas";

/**
 * XP and coins are derived from real, persisted study activity. Nothing is stored separately,
 * so they can never drift, reset unexpectedly or be awarded for actions that did not happen.
 *
 *  XP    = 1 per flashcard review + 1 per correct quiz answer
 *  Coins = 1 per completed quiz attempt + 1 per day with any study activity
 */
export function computeRewards(
  reviews: Pick<ReviewLog, "reviewedAt">[],
  attempts: Pick<QuizAttempt, "score" | "completedAt">[],
): { xp: number; coins: number } {
  const xp = reviews.length + attempts.reduce((s, a) => s + a.score, 0);
  const coins = attempts.length + activityDays(reviews, attempts).size;
  return { xp, coins };
}
