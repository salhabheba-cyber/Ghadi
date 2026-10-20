import {
  BookOpenCheck,
  Brain,
  Cpu,
  FileText,
  HardDrive,
  Heart,
  Layers,
  ListChecks,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Wordmark } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const features = [
  {
    icon: FileText,
    title: "Bring any material",
    text: "PDF, Word, PowerPoint, text, Markdown, images (OCR), pasted text and web pages.",
  },
  {
    icon: BookOpenCheck,
    title: "Structured study notes",
    text: "Summaries, key terms, definitions, important facts and examples, each traceable to your source.",
  },
  {
    icon: ListChecks,
    title: "Quizzes that grade themselves",
    text: "Multiple choice, true/false, short answer and fill-in-the-blank, with explanations and history.",
  },
  {
    icon: Layers,
    title: "Flashcards with spaced repetition",
    text: "A transparent scheduler brings cards back right before you would forget them.",
  },
  {
    icon: HardDrive,
    title: "Local-first",
    text: "Everything lives in your browser’s IndexedDB. Back it up or move it with one JSON file.",
  },
  {
    icon: Cpu,
    title: "AI is optional",
    text: "Works fully offline. Plug in Ollama on your machine, or a server-side provider you control.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Wordmark />
        <nav aria-label="Primary" className="flex items-center gap-2 text-sm">
          <a
            href="https://github.com/"
            className="hidden rounded-lg px-3 py-2 hover:bg-[var(--surface-2)] sm:block"
            rel="noreferrer"
          >
            Source
          </a>
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
          >
            Open Ghadi
          </Link>
        </nav>
      </header>

      <main id="main">
        <section className="mx-auto max-w-4xl px-4 pb-16 pt-14 text-center">
          <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700 dark:bg-brand-900 dark:text-brand-200">
            <Heart className="h-3.5 w-3.5" aria-hidden /> Free and open source · MIT
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            Learn Smarter.
            <br />
            <span className="bg-gradient-to-r from-brand-500 to-purple-500 bg-clip-text text-transparent">
              Remember More.
            </span>{" "}
            Stay Free.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--muted)]">
            Turn your own documents into study notes, quizzes and flashcards. No account, no
            subscription, no upload: your material stays on your device.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/documents"
              className="rounded-lg bg-brand-600 px-6 py-3 font-medium text-white hover:bg-brand-700"
            >
              Add your first document
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-3 font-medium hover:bg-[var(--surface-2)]"
            >
              Go to dashboard
            </Link>
          </div>
        </section>

        <section aria-labelledby="features" className="mx-auto max-w-6xl px-4 pb-16">
          <h2 id="features" className="mb-8 text-center text-2xl font-bold">
            Everything you need to study, nothing you do not
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <Icon className="mb-3 h-6 w-6 text-brand-500" aria-hidden />
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="honest" className="mx-auto max-w-4xl px-4 pb-20">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <h2 id="honest" className="flex items-center gap-2 text-xl font-bold">
              <ShieldCheck className="h-5 w-5 text-brand-500" aria-hidden /> Honest by design
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-[var(--muted)]">
              <li className="flex gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden />
                <span>
                  By default Ghadi uses{" "}
                  <strong className="text-[var(--text)]">offline heuristics</strong>, not an AI
                  model. Results are labelled so you always know where they came from.
                </span>
              </li>
              <li className="flex gap-2">
                <Brain className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden />
                <span>
                  Optional AI runs through{" "}
                  <strong className="text-[var(--text)]">Ollama on your own computer</strong>, or a
                  server you configure. Hosted AI is off until you consent.
                </span>
              </li>
              <li className="flex gap-2">
                <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden />
                <span>
                  The dashboard shows only{" "}
                  <strong className="text-[var(--text)]">your real activity</strong>. Nothing is
                  faked.
                </span>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-6 text-center text-sm text-[var(--muted)]">
        Ghadi is open source under the MIT license. Built for learners, owned by no one.
      </footer>
    </div>
  );
}
