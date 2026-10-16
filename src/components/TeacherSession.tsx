"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Avatar } from "@/components/Avatar";
import { VisualView } from "@/components/VisualView";
import { getMessages } from "@/lib/i18n/messages";
import type { AnswerFeedback, SessionView } from "@/lib/repo/sessions";
import { isRtl, type Locale } from "@/lib/schemas";
import { lineClipUrl, lineKey, MANIFEST_URL } from "@/lib/teaching/line-clips";

const BCP47: Record<Locale, string> = { en: "en-US", fr: "fr-FR", ar: "ar" };

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// Tiny external stores keep browser-only facts out of effects and out of the server-rendered HTML.
const noopSubscribe = () => () => {};
const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;
const AUTO_KEY = "ghadi.autoRead";
const autoReadStore = {
  subscribe(cb: () => void) { window.addEventListener("ghadi-autoread", cb); return () => window.removeEventListener("ghadi-autoread", cb); },
  get(): boolean { try { return window.localStorage.getItem(AUTO_KEY) === "1"; } catch { return false; } },
  set(v: boolean) { try { window.localStorage.setItem(AUTO_KEY, v ? "1" : "0"); } catch { /* storage unavailable */ } window.dispatchEvent(new Event("ghadi-autoread")); },
};

export function TeacherSession({ initialView, locale, homeHref }: { initialView: SessionView; locale: Locale; homeHref: string }) {
  const m = getMessages(locale).session;
  const [view, setView] = useState(initialView);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechFailed, setSpeechFailed] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState<number | null>(null);
  const [breakDismissed, setBreakDismissed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [mountedAt] = useState(() => Date.now());
  const first = useRef(true);

  // Browser speech is feature-detected, never assumed (null = not yet known on the server render).
  // No audio is ever captured by this component.
  const supported = useSyncExternalStore(noopSubscribe, speechSupported, () => null);
  const speechOk: boolean | null = supported === null ? null : supported && !speechFailed;
  const autoRead = useSyncExternalStore(autoReadStore.subscribe, autoReadStore.get, () => false);

  useEffect(() => () => { if (speechSupported()) window.speechSynthesis.cancel(); }, []);

  // Pre-rendered lip-synced clips exist only for fixed sentences; the manifest lists which ones were actually made.
  const [clipKeys, setClipKeys] = useState<Set<string>>(new Set());
  const clipKeysRef = useRef(clipKeys);
  const [clip, setClip] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    fetch(MANIFEST_URL).then((r) => (r.ok ? r.json() : { keys: [] })).then((d: { keys?: string[] }) => {
      if (off) return;
      const set = new Set(d.keys ?? []);
      clipKeysRef.current = set;
      setClipKeys(set);
    }).catch(() => {});
    return () => { off = true; };
  }, []);

  const speak = useCallback((text: string, lang: Locale, allowClip = true) => {
    const key = lineKey(lang, text);
    if (allowClip && clipKeysRef.current.has(key)) {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      setClip(lineClipUrl(key));
      setSpeaking(true);
      return;
    }
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = BCP47[lang];
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => { setSpeaking(false); setSpeechFailed(true); };
      window.speechSynthesis.speak(u);
    } catch { setSpeechFailed(true); }
  }, []);

  const stop = () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); setClip(null); setSpeaking(false); };

  // Move focus to the stage when the step changes (keyboard / screen-reader users).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    stageRef.current?.focus();
  }, [view.state, view.activityNumber, view.explanation?.step, view.hintsShown]);

  // Read aloud only if the grown-up opted in, and only from the handler that changed the step.
  const apply = (v: SessionView, prefix = "") => {
    setView(v);
    if (autoReadStore.get() && speechSupported()) speak(`${prefix} ${v.teacher.utterance}`.trim(), v.teacher.language);
  };

  // A gentle break reminder; never forced, never a streak or penalty.
  useEffect(() => {
    const t = setInterval(() => {
      const elapsed = (Date.now() - mountedAt) / 60000;
      if (elapsed >= view.sessionMinutes) setBreakMinutes(Math.max(1, Math.round(elapsed)));
    }, 15000);
    return () => clearInterval(t);
  }, [view.sessionMinutes, mountedAt]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(false);
    try { await fn(); } catch { setError(true); } finally { setBusy(false); }
  };
  const advance = () => run(async () => { stop(); setFeedback(null); apply((await post<{ view: SessionView }>(`/api/sessions/${view.id}/advance`)).view); });
  const hint = () => run(async () => { apply((await post<{ view: SessionView }>(`/api/sessions/${view.id}/hint`)).view); });
  const answer = (a: { optionIds: string[] } | { value: number }) => run(async () => {
    const r = await post<{ view: SessionView; feedback: AnswerFeedback }>(`/api/sessions/${view.id}/answer`, { activityId: view.activity!.id, answer: a });
    setFeedback(r.feedback); apply(r.view, r.feedback.teacher.utterance);
  });
  const refresh = () => run(async () => {
    const res = await fetch(`/api/sessions/${view.id}`); if (!res.ok) throw new Error();
    setView((await res.json()).view);
  });

  const a = view.activity;
  const inCorrection = view.state === "correction";
  const answering = view.state === "guided_practice" || view.state === "independent_attempt";
  const progressPct = Math.round(((view.state === "completion" ? view.totalActivities : Math.max(0, view.activityNumber - 1)) / Math.max(1, view.totalActivities)) * 100);
  const toggleAuto = (v: boolean) => autoReadStore.set(v);

  return (
    <div className="session" dir={isRtl(locale) ? "rtl" : "ltr"}>
      <aside className="teacher-panel" aria-label={m.ai}>
        <Avatar speaking={speaking && !clip} listening={!speaking && !view.done} label={m.ai} clipSrc={clip}
          onClipEnd={() => { setClip(null); setSpeaking(false); }}
          onClipFail={() => { setClip(null); setSpeaking(false); if (speechSupported()) speak(view.teacher.utterance, view.teacher.language, false); }} />
        <p className="avatar-label badge">{m.ai}</p>
        <p className="small" style={{ marginBlockStart: "0.75rem" }}>{view.teacherMode === "demo" ? m.demo : view.teacherLabel}</p>
        {view.teacherNote && <p className="small muted">{view.teacherNote}</p>}
        <div className="stack-sm" style={{ marginBlockStart: "0.75rem", alignItems: "center" }}>
          {speechOk === false && <p className="small alert info">{m.speechUnavailable}</p>}
          {(speechOk || clipKeys.has(lineKey(view.teacher.language, view.teacher.utterance))) && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => (speaking ? stop() : speak(view.teacher.utterance, view.teacher.language))} aria-pressed={speaking}>
                {speaking ? "■ " + m.stop : "🔊 " + m.listen}
              </button>
              <label className="checkbox small"><input type="checkbox" checked={autoRead} onChange={(e) => toggleAuto(e.target.checked)} /><span>{m.autoRead}</span></label>
            </>
          )}
        </div>
      </aside>

      <section className="stage" ref={stageRef} tabIndex={-1} aria-labelledby="lesson-title">
        <div className="row between">
          <h1 id="lesson-title" lang={view.lesson.language} style={{ fontSize: "1.3rem", margin: 0 }}>{view.lesson.title}</h1>
          <a className="btn btn-sm btn-quiet" href={homeHref}>{m.home}</a>
        </div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct} aria-label={view.totalActivities ? m.activity(Math.max(view.activityNumber, 1), view.totalActivities) : undefined}><span style={{ width: `${progressPct}%` }} /></div>

        {breakMinutes !== null && !breakDismissed && !view.done && (
          <div className="alert warn" role="status">
            <strong>{m.breakTitle}</strong> {m.breakBody(breakMinutes)}
            <div className="row" style={{ marginBlockStart: "0.5rem" }}>
              <button className="btn btn-sm btn-secondary" onClick={() => setBreakDismissed(true)}>{m.keepGoing}</button>
              <a className="btn btn-sm btn-primary" href={homeHref}>{m.finish}</a>
            </div>
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">{m.error} <button className="btn btn-sm btn-secondary" onClick={refresh}>{m.retry}</button></div>
        )}
        {feedback && !inCorrection && (
          <div className={`alert ${feedback.correct ? "info" : "warn"}`} role="status" lang={feedback.teacher.language}>{feedback.teacher.utterance}</div>
        )}

        <div className="bubble" role="status" aria-live="polite" lang={view.teacher.language} dir="auto">{view.teacher.utterance}</div>

        {view.explanation?.visual && <div className="visual-row"><VisualView visual={view.explanation.visual} /></div>}
        {view.explanation && <p className="meta">{m.step(view.explanation.step, view.explanation.total)}</p>}

        {a && (
          <div className="stack" lang={view.lesson.language} dir={isRtl(view.lesson.language) ? "rtl" : "ltr"}>
            <p className="meta">{m.activity(view.activityNumber, view.totalActivities)}</p>
            <p className="prompt">{a.prompt}</p>
            {a.kind === "choice" && a.promptVisual && <div className="visual-row"><VisualView visual={a.promptVisual} /></div>}
            {a.kind === "count" && (
              <div className="count-row" role="img" aria-label={m.count(a.countVisual.count, a.countVisual.emoji)}>
                {Array.from({ length: a.countVisual.count }, (_, i) => <span key={i} aria-hidden="true">{a.countVisual.emoji}</span>)}
              </div>
            )}
            <div className="choices" role="group" aria-label={m.yourAnswer}>
              {a.kind === "choice" && a.options.map((o) => (
                <button key={o.id} className={`choice${inCorrection && view.reveal?.correctOptionIds?.includes(o.id) ? " is-right" : ""}`} disabled={busy || !answering}
                  onClick={() => answer({ optionIds: [o.id] })} aria-label={o.label}>
                  {o.visual && <VisualView visual={o.visual} small />}
                  <span>{o.label}</span>
                </button>
              ))}
              {a.kind === "count" && a.numberOptions.map((n) => (
                <button key={n} className={`choice${inCorrection && view.reveal?.correctValue === n ? " is-right" : ""}`} disabled={busy || !answering} onClick={() => answer({ value: n })}>
                  <span className="num">{n}</span>
                </button>
              ))}
            </div>
            {answering && <p className="meta">{m.voice}</p>}
            {inCorrection && <p className="meta">{m.rightAnswer}</p>}
          </div>
        )}

        <div className="row" style={{ marginBlockStart: "auto" }}>
          {view.canHint && <button className="btn btn-accent" onClick={hint} disabled={busy}>💡 {m.hint}</button>}
          {(view.state === "introduction" || view.state === "explanation" || view.state === "correction" || view.state === "recap") && (
            <button className="btn btn-primary" onClick={advance} disabled={busy}>{m.next} →</button>
          )}
          {view.done && <a className="btn btn-primary" href={homeHref}>{m.home}</a>}
        </div>

        {view.state === "recap" && view.summary && (
          <p className="meta">{m.recapTitle}: {view.summary.correct}/{view.summary.total}</p>
        )}
        <details className="small muted">
          <summary>{m.objectives} · {m.about}</summary>
          <ul>{view.lesson.objectives.map((o) => <li key={o.code}>{o.description}</li>)}</ul>
          <p>{view.lesson.sourceTitle} · {view.lesson.licenseName} · v{view.lesson.version}</p>
          <p>{view.lesson.alignmentNote}</p>
        </details>
      </section>
    </div>
  );
}
