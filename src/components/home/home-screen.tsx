"use client";
import {
  BarChart3,
  BookOpenCheck,
  Brain,
  Home as HomeIcon,
  Library,
  ListChecks,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Importer, type Tab } from "@/components/documents/importer";
import { Dialog, UiProvider, useToast } from "@/components/ui/primitives";
import { useLanguage } from "@/hooks/use-language";
import { useLive } from "@/hooks/use-live";
import { FILE_INPUT_ACCEPT } from "@/lib/document-processing/files";
import { LANGUAGES, LANGUAGE_NAMES } from "@/lib/i18n";
import { computeRewards } from "@/lib/rewards";
import { getDb } from "@/lib/storage/db";
import { cn } from "@/lib/utils";
import { PromptDialog } from "./prompt-dialog";
import "./home.css";

type Panel =
  | {
      kind: "import";
      tab: Tab;
      title: "importFileTitle" | "importPhotosTitle" | "importUrlTitle";
      files?: File[];
      accept?: string;
    }
  | { kind: "prompt" }
  | null;

const PHOTO_ACCEPT = "image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif";
const LANG_SHORT = { en: "EN", fr: "FR", ar: "ع" } as const;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

function Home() {
  const router = useRouter();
  const toast = useToast();
  const { lang, t, setLang } = useLanguage();
  const reduced = useReducedMotion();
  const [panel, setPanel] = useState<Panel>(null);
  const [msgIdx, setMsgIdx] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const { data: rewards } = useLive(async () => {
    const db = getDb();
    const [reviews, attempts] = await Promise.all([db.reviews.toArray(), db.attempts.toArray()]);
    return computeRewards(reviews, attempts);
  }, []);
  const xp = rewards?.xp ?? 0;
  const coins = rewards?.coins ?? 0;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setMsgIdx((i) => i + 1), 4200);
    return () => window.clearInterval(id);
  }, [reduced]);
  const speech = t.speech[msgIdx % t.speech.length] ?? t.speech[0];

  function picked(
    input: HTMLInputElement,
    kind: "importFileTitle" | "importPhotosTitle",
    accept: string,
  ) {
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length === 0) return;
    setPanel({ kind: "import", tab: "file", title: kind, files, accept });
  }

  function activate(key: "file" | "url" | "photos" | "prompt") {
    if (key === "file") fileRef.current?.click();
    else if (key === "photos") photoRef.current?.click();
    else if (key === "url") setPanel({ kind: "import", tab: "url", title: "importUrlTitle" });
    else setPanel({ kind: "prompt" });
  }

  function imported(id: string) {
    setPanel(null);
    router.push(`/documents/${id}`);
  }

  const cards = [
    { key: "file", label: t.attachFile, icon: "/home/card-file.svg" },
    { key: "url", label: t.pasteUrl, icon: "/home/card-url.svg" },
    { key: "photos", label: t.attachPhotos, icon: "/home/card-photos.svg" },
    { key: "prompt", label: t.prompt, icon: "/home/card-prompt.svg" },
  ] as const;

  const nav = [
    { href: "/", label: t.navHome, icon: HomeIcon, active: true },
    { href: "/quizzes", label: t.navQuizzes, icon: ListChecks, active: false },
    { href: "/library", label: t.navLibrary, icon: Library, active: false },
    { href: "/dashboard", label: t.navProgress, icon: BarChart3, active: false },
  ];

  return (
    <div className={cn("gh-home", reduced && "gh-reduced")}>
      <div className="gh-orbs" aria-hidden>
        <span /> <span /> <span /> <span /> <span /> <span />
      </div>

      <main id="main" className="gh-main">
        <div className="gh-wrap">
          <header className="gh-topbar">
            <Link href="/settings" className="gh-gear" aria-label={t.settings}>
              <Settings aria-hidden />
            </Link>

            <div className="gh-langs" role="group" aria-label={t.language}>
              {LANGUAGES.map((l) => (
                <button
                  key={l}
                  type="button"
                  className="gh-lang"
                  aria-pressed={lang === l}
                  lang={l}
                  aria-label={`${LANG_SHORT[l]} ${LANGUAGE_NAMES[l]}`}
                  onClick={() =>
                    void setLang(l).catch(() => toast("Could not save the language.", "error"))
                  }
                >
                  {LANG_SHORT[l]}
                </button>
              ))}
            </div>

            <div className="gh-counters">
              <div
                className="gh-pill"
                title={t.coinsHelp}
                aria-label={`${t.coins}: ${coins}. ${t.coinsHelp}`}
              >
                <span className="gh-coin" aria-hidden />
                <span>{coins}</span>
              </div>
              <div className="gh-pill" title={t.xpHelp} aria-label={`${t.xp}: ${xp}. ${t.xpHelp}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/home/daisy.svg" alt="" width={24} height={24} />
                <span>{xp}</span>
              </div>
            </div>
          </header>

          <section className="gh-hero" aria-label="Ghadi">
            <p className="gh-speech" aria-live="off">
              {speech}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="gh-mascot"
              src="/home/mascot.webp"
              alt="Ghadi, your study buddy"
              width={168}
              height={168}
            />
            <h1 className="gh-heading">{t.getStarted}</h1>
          </section>

          <ul className="gh-cards">
            {cards.map((c) => (
              <li key={c.key}>
                <button type="button" className="gh-card" onClick={() => activate(c.key)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.icon} alt="" width={64} height={64} />
                  <span>{c.label}</span>
                </button>
              </li>
            ))}
          </ul>

          <ul className="gh-quick">
            <li>
              <Link href="/quizzes">
                <ListChecks aria-hidden /> {t.quickQuiz}
              </Link>
            </li>
            <li>
              <Link href="/notes">
                <BookOpenCheck aria-hidden /> {t.studyNotes}
              </Link>
            </li>
            <li>
              <Link href="/review">
                <Brain aria-hidden /> {t.reviewCards}
              </Link>
            </li>
          </ul>
        </div>
      </main>

      <nav className="gh-nav" aria-label={t.mainNav}>
        <ul className="gh-nav-inner">
          {nav.map(({ href, label, icon: Icon, active }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("gh-nav-item", active && "is-active")}
              >
                <Icon aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept={FILE_INPUT_ACCEPT}
        aria-label={t.attachFile}
        data-testid="home-file-input"
        onChange={(e) => picked(e.currentTarget, "importFileTitle", FILE_INPUT_ACCEPT)}
      />
      <input
        ref={photoRef}
        type="file"
        multiple
        hidden
        accept={PHOTO_ACCEPT}
        aria-label={t.attachPhotos}
        data-testid="home-photo-input"
        onChange={(e) => picked(e.currentTarget, "importPhotosTitle", PHOTO_ACCEPT)}
      />

      <Dialog
        open={panel?.kind === "import"}
        onClose={() => setPanel(null)}
        title={panel?.kind === "import" ? t[panel.title] : ""}
        size="lg"
      >
        {panel?.kind === "import" ? (
          <Importer
            onImported={imported}
            initialTab={panel.tab}
            initialFiles={panel.files}
            accept={panel.accept}
            hideTabs
          />
        ) : null}
      </Dialog>
      <PromptDialog
        open={panel?.kind === "prompt"}
        onClose={() => setPanel(null)}
        onSaved={imported}
      />
    </div>
  );
}

export function HomeScreen() {
  return (
    <UiProvider>
      <Home />
    </UiProvider>
  );
}
