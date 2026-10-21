"use client";
import { Trophy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { get } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";
import { BoardList, errorText, periodLabel, useLoad, type BoardData } from "./common";
import { useMe } from "./student-shell";

export function LeaderboardCard() {
  const { t } = useReadLang();
  const { me } = useMe();
  const [scope, setScope] = useState<"school" | "class">("school");
  const [period, setPeriod] = useState("");
  const { data, error, loading } = useLoad(
    () =>
      get<{ leaderboard: BoardData }>(
        `leaderboard?scope=${scope}${period ? `&period=${encodeURIComponent(period)}` : ""}`,
      ),
    [scope, period],
  );
  if (!me.leaderboardEnabled) return null;
  return (
    <section
      aria-labelledby="lb-h"
      className="rounded-3xl border border-[var(--border)] bg-gradient-to-b from-brand-50 to-[var(--surface)] p-4 dark:from-brand-900/30"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2
          id="lb-h"
          className="flex items-center gap-2 text-lg font-extrabold text-brand-800 dark:text-brand-100"
        >
          <Trophy aria-hidden className="h-5 w-5 text-amber-500" />
          {t("topReaders")}
        </h2>
        <div className="ms-auto flex flex-wrap gap-2">
          {me.classLeaderboardEnabled && me.className ? (
            <div
              role="group"
              aria-label={t("topReaders")}
              className="flex overflow-hidden rounded-lg border border-[var(--border)] text-xs"
            >
              {(["school", "class"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  aria-pressed={scope === s}
                  className={cn(
                    "px-3 py-1.5 font-medium",
                    scope === s ? "bg-brand-600 text-white" : "bg-[var(--surface)]",
                  )}
                >
                  {s === "school" ? t("schoolView") : t("classView")}
                </button>
              ))}
            </div>
          ) : null}
          <label>
            <span className="sr-only">{t("period")}</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"
            >
              <option value="">
                {data
                  ? periodLabel(data.leaderboard.period.key, data.leaderboard.period.label, t)
                  : t("periodMonth")}
              </option>
              {[
                ["month", t("periodMonth")],
                ["year", t("periodYear")],
                ["all", t("periodAll")],
              ]
                .filter(([k]) => k !== (period || data?.leaderboard.period.key))
                .map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>
      {loading ? (
        <p className="py-6 text-center text-sm text-[var(--muted)]">{t("loading")}</p>
      ) : error || !data ? (
        <p className="py-4 text-center text-sm">{errorText(error, t)}</p>
      ) : (
        <BoardList board={data.leaderboard} />
      )}
    </section>
  );
}
