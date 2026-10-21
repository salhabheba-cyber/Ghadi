"use client";
import { useState } from "react";
import { post } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";
import { errorText } from "../common";
import { useMe } from "../student-shell";

export interface Elig {
  eligible: boolean;
  percent: number;
  neededPercent: number;
  seconds: number;
  neededSeconds: number;
  alreadyCompleted: boolean;
}
interface Check {
  checkId: string;
  attemptsLeft: number;
  questions: { kind: string; prompt: string; options: string[] }[];
}

/** The completion step: shows what is still needed, or the short comprehension check when the book is eligible. */
export function FinishPanel({
  slug,
  elig,
  dir,
  onDone,
}: {
  slug: string;
  elig: Elig | null;
  dir: "rtl" | "ltr";
  onDone: () => void;
}) {
  const { t, lang } = useReadLang();
  const { achievements } = useMe();
  const [check, setCheck] = useState<Check | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    passed: boolean;
    attemptsLeft: number;
    completed: boolean;
    newAchievements: string[];
  } | null>(null);

  if (!elig) return null;
  if (elig.alreadyCompleted && !result)
    return (
      <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
        ✓ {t("finished")}
      </p>
    );

  async function start() {
    setBusy(true);
    setMsg(null);
    try {
      const c = await post<Check>(`read/${encodeURIComponent(slug)}/check`);
      setCheck(c);
      setAnswers(new Array(c.questions.length).fill(-1));
    } catch (e) {
      setMsg(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!check) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await post<NonNullable<typeof result>>(`check/${check.checkId}/answer`, {
        answers,
      });
      setResult(r);
      if (r.passed) onDone();
      else setCheck({ ...check, attemptsLeft: r.attemptsLeft });
    } catch (e) {
      setMsg(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }

  if (result?.passed) {
    const badges = achievements.filter((a) => result.newAchievements.includes(a.code));
    return (
      <div
        role="status"
        className="rounded-2xl bg-emerald-50 p-4 text-center dark:bg-emerald-500/15"
      >
        <p className="text-lg font-extrabold text-emerald-800 dark:text-emerald-200">
          🎉 {t("checkPassed")}
        </p>
        {badges.length > 0 ? (
          <p className="mt-2 text-sm">
            {t("newBadges")} {badges.map((b) => `${b.icon} ${b[lang]}`).join(" · ")}
          </p>
        ) : null}
      </div>
    );
  }

  if (!check) {
    if (!elig.eligible) {
      const minutes = Math.max(1, Math.ceil((elig.neededSeconds - elig.seconds) / 60));
      const needMore = elig.percent < elig.neededPercent;
      return (
        <p className="rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-900/30">
          {t("almostThere")}.{" "}
          {needMore ? (
            <>
              {t("needMoreRead")} {elig.neededPercent}% ({Math.round(elig.percent)}%).{" "}
            </>
          ) : null}
          {elig.seconds < elig.neededSeconds ? (
            <>
              {t("needMoreTime")} {minutes}.
            </>
          ) : null}
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {msg ? (
          <p role="alert" className="text-sm">
            {msg}
          </p>
        ) : null}
        <button
          onClick={start}
          disabled={busy}
          className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {t("finishBook")}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <h3 className="font-bold">{t("checkTitle")}</h3>
        <p className="text-sm text-[var(--muted)]">{t("checkIntro")}</p>
      </div>
      {check.questions.map((q, qi) => (
        <fieldset key={qi} className="rounded-xl border border-[var(--border)] p-3">
          <legend dir={dir} className="px-1 text-sm font-semibold">
            {qi + 1}. {q.prompt}
          </legend>
          <div className="mt-1 flex flex-col gap-1.5">
            {q.options.map((o, oi) => (
              <label
                key={oi}
                dir={dir}
                className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-2)]"
              >
                <input
                  type="radio"
                  name={`q${qi}`}
                  checked={answers[qi] === oi}
                  onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                  className="mt-1 h-4 w-4 accent-brand-600"
                />
                <span className="text-sm">{o}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {result && !result.passed ? (
        <p role="status" className="text-sm">
          {t("checkFailed")}
        </p>
      ) : null}
      {msg ? (
        <p role="alert" className="text-sm">
          {msg}
        </p>
      ) : null}
      <p className="text-xs text-[var(--muted)]">
        {check.attemptsLeft} {t("attemptsLeft")}
      </p>
      <button
        disabled={busy || answers.some((a) => a < 0) || check.attemptsLeft <= 0}
        className="rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {t("checkSubmit")}
      </button>
    </form>
  );
}
