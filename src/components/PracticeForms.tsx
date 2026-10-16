"use client";
import { useActionState, useState, useSyncExternalStore } from "react";
import type { DictationState, ReadingState } from "@/app/[locale]/actions";
import { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/schemas";

const noop = () => () => {};
const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

function useSpeech(lang: string) {
  const supported = useSyncExternalStore(noop, speechSupported, () => false);
  const say = (text: string, slow: boolean) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === "ar" ? "ar" : lang === "fr" ? "fr-FR" : "en-US";
      u.rate = slow ? 0.6 : 0.85;
      window.speechSynthesis.speak(u);
    } catch { /* speech is an enhancement; the grown-up can read aloud */ }
  };
  return { supported, say };
}

type Action<S> = (s: S, f: FormData) => Promise<S>;

export function DictationForm({ locale, childId, textId, text, lang, backHref, action }: {
  locale: Locale; childId: string; textId: string; text: string; lang: "en" | "fr" | "ar"; backHref: string; action: Action<DictationState>;
}) {
  const m = getMessages(locale).practice;
  const [state, formAction, pending] = useActionState(action, {});
  const { supported, say } = useSpeech(lang);
  const r = state.result;
  const errMsg = state.error === "subscription" ? m.subscription : state.error ? m.error : null;
  return (
    <div className="stack">
      <p>{m.dictationIntro}</p>
      <div className="row">
        {supported ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => say(text, false)}>🔊 {m.listen}</button>
            <button type="button" className="btn btn-secondary" onClick={() => say(text, true)}>{m.listenSlow}</button>
          </>
        ) : <div className="alert info" role="note">{m.speechOff}</div>}
      </div>
      {!supported && <details className="small"><summary>{m.showText}</summary><p lang={lang} style={{ fontSize: "1.5rem" }}>{text}</p></details>}
      {errMsg && <div className="alert error" role="alert">{errMsg}</div>}
      {!r ? (
        <form action={formAction} className="stack">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="childId" value={childId} />
          <input type="hidden" name="textId" value={textId} />
          <div className="field">
            <label htmlFor="typed">{m.yourAnswer}</label>
            <textarea id="typed" name="typed" className="input" rows={3} maxLength={1000} lang={lang} dir="auto" style={{ fontSize: "1.5rem" }} autoComplete="off" autoCorrect="off" spellCheck={false} />
            <span className="help">{m.typedOnly}</span>
          </div>
          <button className="btn btn-primary" disabled={pending}>{pending ? getMessages(locale).common.loading : m.check}</button>
        </form>
      ) : (
        <section className="stack" aria-live="polite" aria-labelledby="res">
          <h2 id="res">{m.resultTitle}</h2>
          <p><strong>{m.summary(r.correctWords, r.expectedWords)}</strong> — {r.accuracy === 1 ? m.allRight : m.niceTry}</p>
          <ul className="clean stack-sm">
            {r.items.filter((i) => i.kind !== "correct" || i.capitalDiff || i.punctDiff).map((i, idx) => (
              <li key={idx} className="card">
                <span className="badge">{i.kind === "correct" ? m.kinds.correct : m.kinds[i.kind]}</span>{" "}
                <span lang={lang} dir="auto" style={{ fontSize: "1.25rem" }}>{i.typed ?? ""}</span>
                <p className="small muted" style={{ margin: 0 }}>
                  {i.kind === "misspelled" && m.explain.misspelled(i.expected ?? "")}
                  {i.kind === "wrong" && m.explain.wrong(i.expected ?? "")}
                  {i.kind === "missing" && m.explain.missing(i.expected ?? "")}
                  {i.kind === "extra" && m.explain.extra()}
                  {i.kind === "correct" && i.capitalDiff && m.explain.capital}
                  {i.kind === "correct" && i.punctDiff && ` ${m.explain.punct}`}
                </p>
              </li>
            ))}
          </ul>
          <p className="muted">{m.expectedLabel}: <span lang={lang} dir="auto" style={{ fontSize: "1.25rem" }}>{text}</span></p>
          <div className="row"><a className="btn btn-primary" href={backHref}>{m.tryAnother}</a></div>
        </section>
      )}
    </div>
  );
}

type Mark = "ok" | "help" | "skipped";
const NEXT: Record<Mark, Mark> = { ok: "help", help: "skipped", skipped: "ok" };

export function ReadingForm({ locale, childId, textId, text, lang, backHref, action }: {
  locale: Locale; childId: string; textId: string; text: string; lang: "en" | "fr" | "ar"; backHref: string; action: Action<ReadingState>;
}) {
  const m = getMessages(locale).practice;
  const words = text.trim().split(/\s+/);
  const [marks, setMarks] = useState<Mark[]>(() => words.map(() => "ok"));
  const [state, formAction, pending] = useActionState(action, {});
  const payload = JSON.stringify(marks.map((status, i) => ({ i, status })));
  const count = (s: Mark) => marks.filter((x) => x === s).length;
  const errMsg = state.error === "subscription" ? m.subscription : state.error ? m.error : null;
  return (
    <div className="stack">
      <p>{m.readingIntro}</p>
      <p className="small muted">{m.tapHint}</p>
      <p lang={lang} dir="auto" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", fontSize: "1.8rem", lineHeight: 1.6 }}>
        {words.map((w, i) => (
          <button
            key={i} type="button" disabled={state.saved}
            onClick={() => setMarks((cur) => cur.map((x, j) => (j === i ? NEXT[x] : x)))}
            className={`btn ${marks[i] === "ok" ? "btn-quiet" : marks[i] === "help" ? "btn-accent" : "btn-secondary"}`}
            style={{ fontSize: "inherit", minHeight: "3.5rem" }}
            aria-label={`${w}: ${m.mark[marks[i]!]}`}
          >
            {w}{marks[i] !== "ok" && <span className="small"> · {m.mark[marks[i]!]}</span>}
          </button>
        ))}
      </p>
      <p className="muted" role="status">{m.readingSummary(count("ok"), count("help"), count("skipped"))}</p>
      <div className="alert info" role="note">{m.noSpeechNote}</div>
      {errMsg && <div className="alert error" role="alert">{errMsg}</div>}
      {state.saved ? (
        <div className="stack-sm"><div className="alert info" role="status">{m.saved}</div><a className="btn btn-primary" href={backHref}>{m.tryAnother}</a></div>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="childId" value={childId} />
          <input type="hidden" name="textId" value={textId} />
          <input type="hidden" name="marks" value={payload} />
          <button className="btn btn-primary" disabled={pending}>{pending ? getMessages(locale).common.loading : m.save}</button>
        </form>
      )}
    </div>
  );
}
