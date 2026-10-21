"use client";
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  List,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ApiFailure, del, post } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";
import { errorText, useLoad } from "../common";
import { StudentShell } from "../student-shell";
import { CompanionPanel } from "./companion";
import { FinishPanel, type Elig } from "./finish";
import {
  READER_LOCALE,
  chapterText,
  percentForPages,
  percentOf,
  searchBook,
  validateBook,
  type BookFile,
} from "./model";

type Panel = null | "contents" | "bookmarks" | "search" | "helper" | "settings";
interface Prefs {
  size: number;
  spacing: number;
  theme: "light" | "sepia" | "dark";
}
const DEFAULT_PREFS: Prefs = { size: 20, spacing: 1.8, theme: "light" };
const THEMES: Record<Prefs["theme"], { bg: string; fg: string; sub: string }> = {
  light: { bg: "#ffffff", fg: "#1c1530", sub: "#6b6384" },
  sepia: { bg: "#f4ecd8", fg: "#433422", sub: "#7a6a52" },
  dark: { bg: "#15101f", fg: "#ece8f6", sub: "#a79fc0" },
};
const PREF_KEY = "ghadi_reader_prefs";

function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      size: typeof p.size === "number" ? Math.min(34, Math.max(14, p.size)) : DEFAULT_PREFS.size,
      spacing:
        typeof p.spacing === "number"
          ? Math.min(2.4, Math.max(1.4, p.spacing))
          : DEFAULT_PREFS.spacing,
      theme: p.theme === "sepia" || p.theme === "dark" ? p.theme : "light",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

interface Opened {
  book: {
    id: string;
    slug: string;
    title: string;
    author: string;
    language: "ar" | "fr" | "en";
    content_path: string;
    layout: "pages" | "scroll";
  };
  sessionId: string;
  progress: { locator: { ch?: number; y?: number }; furthestPercent: number };
  bookmarks: { id: string; locator: { ch?: number }; label: string }[];
  eligibility: Elig;
}

export function ReaderScreen({ slug }: { slug: string }) {
  return (
    <StudentShell bare>
      <Reader slug={slug} />
    </StudentShell>
  );
}

function Reader({ slug }: { slug: string }) {
  const { t } = useReadLang();
  const { data, error, loading, reload } = useLoad(async () => {
    const opened = await post<Opened>(`read/${encodeURIComponent(slug)}/open`);
    let file: BookFile;
    try {
      const res = await fetch(opened.book.content_path, { cache: "force-cache" });
      if (!res.ok) throw new Error("http");
      file = validateBook(await res.json());
    } catch {
      throw new ApiFailure(0, "content", "content");
    }
    return { opened, file };
  }, [slug]);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--muted)]">
        {t("loading")}
      </div>
    );
  if (error || !data) {
    const notFound = error instanceof ApiFailure && error.status === 404;
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p role="alert">
          {notFound
            ? t("bookNotFound")
            : error instanceof ApiFailure && error.code === "content"
              ? t("loadError")
              : errorText(error, t)}
        </p>
        <div className="flex gap-2">
          {!notFound ? (
            <button onClick={reload} className="rounded-lg bg-brand-600 px-4 py-2 text-white">
              {t("retry")}
            </button>
          ) : null}
          <Link href="/read" className="rounded-lg border border-[var(--border)] px-4 py-2">
            {t("home")}
          </Link>
        </div>
      </div>
    );
  }
  return <ReaderView opened={data.opened} file={data.file} />;
}

function ReaderView({ opened, file }: { opened: Opened; file: BookFile }) {
  const { t } = useReadLang();
  const { book, sessionId } = opened;
  const n = file.chapters.length;
  const startCh = Math.min(Math.max(Number(opened.progress.locator.ch) || 0, 0), n - 1);
  const [ch, setCh] = useState(startCh);
  const [panel, setPanel] = useState<Panel>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [marks, setMarks] = useState(opened.bookmarks);
  const [elig, setElig] = useState<Elig | null>(opened.eligibility);
  const [query, setQuery] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const startFrac = Number(opened.progress.locator.y) || 0;
  const scrollFrac = useRef(startFrac);
  const [frac, setFrac] = useState(startFrac);
  const lastSaved = useRef({ ch: -1, pct: -1, at: 0 });
  const articleRef = useRef<HTMLElement>(null);
  const lastActive = useRef(0);
  const chRef = useRef(ch);
  useEffect(() => {
    chRef.current = ch;
  }, [ch]);

  useEffect(() => {
    // Preferences live in this browser only; reading them after mount avoids a server/client mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(loadPrefs());
  }, []);
  function updatePrefs(next: Prefs) {
    setPrefs(next);
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch {
      /* private mode: settings still apply for this visit */
    }
  }

  const isPages = file.layout === "pages";
  const pct = useCallback(
    (c: number, frac: number) => (isPages ? percentForPages(c, n) : percentOf(c, n, frac)),
    [isPages, n],
  );

  const save = useCallback(
    async (force = false, keepalive = false) => {
      const c = chRef.current;
      const frac = scrollFrac.current;
      const percent = pct(c, frac);
      const now = Date.now();
      const prev = lastSaved.current;
      if (!force && c === prev.ch && Math.abs(percent - prev.pct) < 1) return;
      if (!force && now - prev.at < 4000 && c === prev.ch) return;
      lastSaved.current = { ch: c, pct: percent, at: now };
      try {
        const res = await fetch(`/api/app/read/${encodeURIComponent(book.slug)}/position`, {
          method: "PUT",
          credentials: "same-origin",
          keepalive,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locator: { ch: c, y: Math.round(frac * 1000) / 1000 }, percent }),
        });
        if (res.ok) {
          const j = (await res.json()) as { eligibility?: Elig };
          if (j.eligibility) setElig(j.eligibility);
        }
      } catch {
        /* offline: the next save carries the same information */
      }
    },
    [book.slug, pct],
  );

  // Save when the page changes, then keep saving gently while scrolling, and when the tab is hidden or closed.
  useEffect(() => {
    void save(true);
  }, [ch, save]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void save(true, true);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [save]);

  // Reading time: a beat every 15 s, only while the page is visible and the child touched it in the last minute.
  useEffect(() => {
    const mark = () => {
      lastActive.current = Date.now();
    };
    mark();
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const id = setInterval(() => {
      if (document.visibilityState !== "visible" || Date.now() - lastActive.current > 60_000)
        return;
      void post("read/heartbeat", { sessionId }).catch(() => undefined);
    }, 15_000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(id);
    };
  }, [sessionId]);

  // Scroll tracking for long books; restore the saved place on first paint.
  useEffect(() => {
    if (isPages) return;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const f = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
      scrollFrac.current = f;
      setFrac((prev) => (Math.abs(prev - f) >= 0.01 ? f : prev));
      void save(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isPages, save]);
  useEffect(() => {
    if (isPages) return;
    const y = scrollFrac.current;
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, y > 0 ? y * Math.max(0, max) : 0);
    });
    // Only on chapter change (and the first load, where scrollFrac holds the saved place).
  }, [ch, isPages]);

  const go = useCallback(
    (to: number) => {
      const next = Math.min(Math.max(to, 0), n - 1);
      if (next === chRef.current) return;
      scrollFrac.current = 0;
      setFrac(0);
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      setCh(next);
      if (!isPages) window.scrollTo(0, 0);
    },
    [n, isPages],
  );

  const forward = file.dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const back = file.dir === "rtl" ? "ArrowRight" : "ArrowLeft";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "Escape") setPanel(null);
      else if (e.key === forward) go(chRef.current + 1);
      else if (e.key === back) go(chRef.current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, forward, back]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function speak() {
    const synth = window.speechSynthesis;
    if (!synth) return setVoiceMsg(true);
    if (speaking) {
      synth.cancel();
      return setSpeaking(false);
    }
    const locale = READER_LOCALE[file.lang];
    const voice = synth
      .getVoices()
      .find((v) => v.lang.toLowerCase().startsWith(locale.slice(0, 2)));
    if (!voice) return setVoiceMsg(true);
    setVoiceMsg(false);
    const parts = chapterText(file.chapters[ch]!).split("\n").filter(Boolean);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.9;
      if (i === parts.length - 1) u.onend = () => setSpeaking(false);
      synth.speak(u);
    });
    setSpeaking(true);
  }

  async function addMark() {
    try {
      const chapter = file.chapters[ch]!;
      const label = chapter.title || `${t("pageOf")} ${ch + 1}`;
      const r = await post<{ id: string }>(`read/${encodeURIComponent(book.slug)}/bookmarks`, {
        locator: { ch },
        label,
      });
      setMarks((m) => [...m, { id: r.id, locator: { ch }, label }]);
      setToast(t("savedPlace"));
      setTimeout(() => setToast(null), 1800);
    } catch (e) {
      setToast(errorText(e, t));
      setTimeout(() => setToast(null), 2500);
    }
  }
  async function removeMark(id: string) {
    await del(`bookmarks/${id}`).catch(() => undefined);
    setMarks((m) => m.filter((x) => x.id !== id));
  }

  const getSelection = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim().slice(0, 600) ?? "";
    const node = sel?.anchorNode;
    const el = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
    const context = el?.closest("[data-p]")?.textContent?.trim().slice(0, 1200) ?? "";
    return { text, context };
  }, []);

  const theme = THEMES[prefs.theme];
  const chapter = file.chapters[ch]!;
  const hits = panel === "search" ? searchBook(file.chapters, query) : [];
  const percent = pct(ch, frac);
  const atEnd = ch === n - 1;
  const tabBtn = (p: Exclude<Panel, null>, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setPanel(panel === p ? null : p)}
      aria-pressed={panel === p}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-lg p-2",
        panel === p ? "bg-brand-600 text-white" : "hover:bg-black/10",
      )}
    >
      {icon}
    </button>
  );

  return (
    <div
      style={{ background: theme.bg, color: theme.fg }}
      className="min-h-screen"
      data-testid="reader"
      data-theme-name={prefs.theme}
    >
      <header
        className="sticky top-0 z-20 border-b"
        style={{ background: theme.bg, borderColor: `${theme.sub}55` }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-1 px-3 py-2" dir="ltr">
          <Link
            href={`/read/book/${book.slug}`}
            aria-label={t("back")}
            className="rounded-lg p-2 hover:bg-black/10"
          >
            <ArrowLeft aria-hidden className="h-5 w-5" />
          </Link>
          <p dir="auto" className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">
            {book.title}
          </p>
          {tabBtn("contents", t("contents"), <List aria-hidden className="h-5 w-5" />)}
          {tabBtn("search", t("searchInBook"), <Search aria-hidden className="h-5 w-5" />)}
          <button
            onClick={addMark}
            aria-label={t("addBookmark")}
            title={t("addBookmark")}
            className="rounded-lg p-2 hover:bg-black/10"
          >
            <BookmarkPlus aria-hidden className="h-5 w-5" />
          </button>
          <button
            onClick={speak}
            aria-pressed={speaking}
            aria-label={speaking ? t("stopReading") : t("readAloud")}
            title={speaking ? t("stopReading") : t("readAloud")}
            className={cn(
              "rounded-lg p-2",
              speaking ? "bg-brand-600 text-white" : "hover:bg-black/10",
            )}
          >
            {speaking ? (
              <VolumeX aria-hidden className="h-5 w-5" />
            ) : (
              <Volume2 aria-hidden className="h-5 w-5" />
            )}
          </button>
          {tabBtn("helper", t("helper"), <Sparkles aria-hidden className="h-5 w-5" />)}
          {tabBtn("settings", t("settings"), <Settings2 aria-hidden className="h-5 w-5" />)}
        </div>
        <div
          className="h-1"
          style={{ background: `${theme.sub}33` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-label={book.title}
        >
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </header>

      {voiceMsg ? (
        <p
          role="status"
          className="mx-auto mt-3 max-w-3xl rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900"
        >
          {t("noVoice")}
        </p>
      ) : null}

      <article
        ref={articleRef}
        dir={file.dir}
        lang={file.lang}
        data-testid="reader-text"
        className="mx-auto max-w-3xl px-5 pb-40 pt-6"
        style={{ fontSize: `${prefs.size}px`, lineHeight: prefs.spacing }}
      >
        {chapter.blocks.map((b, i) => {
          if (b.t === "img" && b.src) {
            return <PageImage key={i} src={b.src} alt={b.alt ?? ""} eager={i === 0} />;
          }
          if (!b.x) return null;
          if (b.t === "h")
            return (
              <h2
                key={i}
                data-p
                className="mb-4 mt-6 text-balance font-extrabold"
                style={{ fontSize: "1.35em", lineHeight: 1.3 }}
              >
                {b.x}
              </h2>
            );
          if (b.t === "q")
            return (
              <blockquote key={i} data-p className="my-4 border-s-4 border-brand-400 ps-4 italic">
                {b.x}
              </blockquote>
            );
          return (
            <p
              key={i}
              data-p
              className={cn("mb-4", isPages && "text-center")}
              style={isPages ? { fontSize: "1.25em" } : undefined}
            >
              {b.x}
            </p>
          );
        })}
        {atEnd ? (
          <div className="mt-10" style={{ fontSize: "16px", lineHeight: 1.5 }} dir="auto">
            <FinishPanel
              slug={book.slug}
              elig={elig}
              dir={file.dir}
              onDone={() => setElig((e) => (e ? { ...e, alreadyCompleted: true } : e))}
            />
          </div>
        ) : null}
      </article>

      <nav
        aria-label={book.title}
        className="fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)]"
        style={{ background: theme.bg, borderColor: `${theme.sub}55` }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2" dir={file.dir}>
          <button
            onClick={() => go(ch - 1)}
            disabled={ch === 0}
            aria-label={t("prevPage")}
            className="rounded-xl bg-brand-600 p-3 text-white disabled:opacity-30"
          >
            <ChevronLeft aria-hidden className="h-5 w-5 rtl:rotate-180" />
          </button>
          <p
            className="flex-1 text-center text-sm tabular-nums"
            style={{ color: theme.sub }}
            aria-live="polite"
          >
            {t("pageOf")} {ch + 1} {t("of")} {n}
          </p>
          <button
            onClick={() => go(ch + 1)}
            disabled={atEnd}
            aria-label={t("nextPage")}
            className="rounded-xl bg-brand-600 p-3 text-white disabled:opacity-30"
          >
            <ChevronRight aria-hidden className="h-5 w-5 rtl:rotate-180" />
          </button>
        </div>
      </nav>

      {toast ? (
        <p
          role="status"
          className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-sm text-white"
        >
          {toast}
        </p>
      ) : null}

      {panel ? (
        <aside
          role="dialog"
          aria-modal="false"
          aria-label={panel}
          className="fixed inset-y-0 end-0 z-30 flex w-full max-w-sm flex-col border-s bg-[var(--surface)] text-[var(--foreground,inherit)] shadow-2xl"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] p-3">
            <h2 className="font-bold">
              {panel === "contents"
                ? t("contents")
                : panel === "search"
                  ? t("searchInBook")
                  : panel === "helper"
                    ? t("helper")
                    : panel === "settings"
                      ? t("settings")
                      : t("bookmarks")}
            </h2>
            <div className="flex items-center gap-1">
              {panel === "contents" ? (
                <button
                  onClick={() => setPanel("bookmarks")}
                  className="rounded-lg p-2 hover:bg-[var(--surface-2)]"
                  aria-label={t("bookmarks")}
                >
                  <Bookmark aria-hidden className="h-4 w-4" />
                </button>
              ) : null}
              <button
                onClick={() => setPanel(null)}
                className="rounded-lg p-2 hover:bg-[var(--surface-2)]"
                aria-label={t("close")}
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto p-3"
            dir={file.dir === "rtl" ? "rtl" : undefined}
          >
            {panel === "contents" ? (
              <ol className="flex flex-col gap-1">
                {file.chapters.map((c, i) => (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        go(i);
                        setPanel(null);
                      }}
                      aria-current={i === ch ? "true" : undefined}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-start text-sm",
                        i === ch
                          ? "bg-brand-100 font-semibold text-brand-800 dark:bg-brand-900/50 dark:text-brand-100"
                          : "hover:bg-[var(--surface-2)]",
                      )}
                    >
                      {c.title || `${t("pageOf")} ${i + 1}`}
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
            {panel === "bookmarks" ? (
              marks.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">{t("noBookmarks")}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {marks.map((m) => (
                    <li key={m.id} className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          go(Number(m.locator.ch) || 0);
                          setPanel(null);
                        }}
                        className="flex-1 truncate rounded-lg px-3 py-2 text-start text-sm hover:bg-[var(--surface-2)]"
                      >
                        {m.label || `${t("pageOf")} ${(Number(m.locator.ch) || 0) + 1}`}
                      </button>
                      <button
                        onClick={() => removeMark(m.id)}
                        aria-label={t("cancel")}
                        className="rounded-lg p-2 hover:bg-[var(--surface-2)]"
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
            {panel === "search" ? (
              <div className="flex flex-col gap-3">
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  dir="auto"
                  placeholder={t("searchInBook")}
                  aria-label={t("searchInBook")}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                />
                {query.trim().length >= 2 && hits.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{t("noResults")}</p>
                ) : null}
                <ul className="flex flex-col gap-1" aria-live="polite">
                  {hits.map((h, i) => (
                    <li key={i}>
                      <button
                        onClick={() => {
                          go(h.chapter);
                          setPanel(null);
                        }}
                        dir="auto"
                        className="w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-[var(--surface-2)]"
                      >
                        <span className="block text-xs text-[var(--muted)]">
                          {t("pageOf")} {h.chapter + 1}
                        </span>
                        {h.snippet}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {panel === "helper" ? (
              <CompanionPanel
                slug={book.slug}
                getSelection={getSelection}
                pageText={chapterText(chapter)}
                dir={file.dir}
              />
            ) : null}
            {panel === "settings" ? (
              <div className="flex flex-col gap-5 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="font-semibold">
                    {t("textSize")}: {prefs.size}
                  </span>
                  <input
                    type="range"
                    min={14}
                    max={34}
                    step={2}
                    value={prefs.size}
                    onChange={(e) => updatePrefs({ ...prefs, size: Number(e.target.value) })}
                    className="accent-brand-600"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-semibold">
                    {t("spacing")}: {prefs.spacing.toFixed(1)}
                  </span>
                  <input
                    type="range"
                    min={1.4}
                    max={2.4}
                    step={0.2}
                    value={prefs.spacing}
                    onChange={(e) => updatePrefs({ ...prefs, spacing: Number(e.target.value) })}
                    className="accent-brand-600"
                  />
                </label>
                <fieldset>
                  <legend className="mb-1 font-semibold">{t("theme")}</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {(["light", "sepia", "dark"] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => updatePrefs({ ...prefs, theme: k })}
                        aria-pressed={prefs.theme === k}
                        className={cn(
                          "rounded-lg border-2 px-2 py-2 font-medium",
                          prefs.theme === k ? "border-brand-600" : "border-transparent",
                        )}
                        style={{ background: THEMES[k].bg, color: THEMES[k].fg }}
                      >
                        {k === "light"
                          ? t("themeLight")
                          : k === "sepia"
                            ? t("themeSepia")
                            : t("themeDark")}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

/** A page illustration. Plain <img>: these are small, build-time-resized static files, so next/image adds nothing. */
function PageImage({ src, alt, eager }: { src: string; alt: string; eager: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      className="mx-auto mb-5 max-h-[60vh] w-auto max-w-full rounded-2xl object-contain"
    />
  );
}
