# Ghadi

**Learn Smarter. Remember More. Stay Free.**

Ghadi is a free, open-source, **local-first** study platform. Import your own documents and turn them into structured study notes, quizzes and spaced-repetition flashcards. No account, no subscription, and by default nothing leaves your device.

> **AI note.** Ghadi's AI engine is **OpenAI**, reached only through Ghadi's own server (the API key never reaches your browser). Nothing is sent when you merely upload a file; you press a button and allow it first, and OpenAI API usage may cost money (it is separate from a ChatGPT subscription). If OpenAI fails, Ghadi shows the error and what to do next; it never silently switches to another provider or to guesses. A clearly labelled basic (no-AI) outline is available only when you ask for it. See [AI engine](#6-ai-engine).

---

## 1. Overview

Ghadi runs as a Next.js app. All your data lives in your browser's IndexedDB. The server exists only for two optional features (importing a web page / YouTube captions, and the optional hosted-AI route); everything else works with no server round-trips.

## 2. Features

- **Import** PDF, DOCX, PPTX, TXT, Markdown, images (OCR, opt-in), pasted text, web pages and YouTube videos that have published captions.
- **Study notes**: overview, summary, key concepts, definitions, dates and formulas, examples, related ideas and a review checklist. Each item is tagged _from your text_ or _model-written_. Editable, duplicable, exportable to Markdown, printable.
- **Quizzes**: multiple choice, true/false, short answer and fill-in-the-blank; difficulty and question-type options; one question at a time; feedback after each question or at the end; scoring, explanations, review of missed questions, retry, and attempt history.
- **Flashcards** with a transparent SM-2-inspired scheduler (Known / Difficult / Forgotten), keyboard-driven review (Space to flip, 1/2/3 to rate), manual cards and generated decks.
- **Dashboard** computed only from your real activity: streak, quiz accuracy, due and mature cards, upcoming reviews, review history, quiz scores over time. Empty states instead of fake numbers.
- **Library**: search, sort, filter by type/collection/tag, collections, tags, bulk delete.
- **Home screen**: Attach File, Paste URL, Attach Photos and Prompt all open real import flows (validated, extracted on your device, saved, then ready for notes, quizzes and flashcards). Interface language switches between English, French and Arabic (right-to-left); the home screen, main menu and prompt dialog are translated, other pages are still English. XP and coins are derived from your saved history: XP = 1 per flashcard review + 1 per correct quiz answer; coins = 1 per completed quiz + 1 per study day. The Prompt dialog needs the optional hosted AI plus your consent in Settings; otherwise it can save your own text as a document.
- **Backup & restore** (versioned JSON, validated before anything is touched), Markdown / CSV export, print styles.
- Light and dark themes, responsive layout, keyboard accessible, automatically scanned with axe (WCAG 2 A/AA) in CI.

## 3. Screens

Landing page · Dashboard · My Library · Documents (import) · Study Notes · Quizzes · Flashcards · Review · Settings.

## 4. Quick start

Requirements: **Node.js ≥ 22.13** and npm.

```bash
git clone https://github.com/salhabheba-cyber/Ghadi.git
cd Ghadi
npm install
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

No environment variables are required.

## 5. Tech stack

Next.js (App Router) · React 19 · strict TypeScript · Tailwind CSS 4 (own accessible primitives) · Lucide icons · Dexie / IndexedDB · Zod · PDF.js · Mammoth · JSZip (PPTX) · tesseract.js (optional OCR) · Vitest + React Testing Library · Playwright + axe-core · ESLint · Prettier.

## 6. AI engine

OpenAI is the only AI engine. There is no provider switch in Settings.

| Task                                                              | Model setting         | Default       |
| ----------------------------------------------------------------- | --------------------- | ------------- |
| Guides, notes, quizzes, flashcards, explanations, Explain simpler | `OPENAI_MODEL`        | `gpt-6-luna`  |
| Reading photos and scanned pages (vision)                         | `OPENAI_VISION_MODEL` | `gpt-6.1-sol` |

Models are chosen in one place (`src/lib/server/hosted-config.ts`) and can be changed with environment variables, no code change. All OpenAI calls run on the server (`/api/ai/generate`, `/api/ai/vision`, `/api/ai/chat`, `/api/quiz/check`, `/api/ai/test`). The server builds its own prompts, caps input size, rate-limits requests, requires explicit consent in each request body, and validates the model's JSON with Zod before anything is saved.

**Setup (server operators):** set `OPENAI_API_KEY` as a private server variable (Railway: _Variables_ tab). Never prefix it with `NEXT_PUBLIC_` and never commit it. Optional: `OPENAI_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_BASE_URL`. See [.env.example](.env.example). In **Settings → Test OpenAI** make one tiny real request (text and a test image) to confirm the key and models work; Ghadi only reports "connected" when OpenAI actually answered.

**Without a key** the app still starts: importing text/PDF/Word/PowerPoint, the library, flashcard review and progress all work; AI features show "OpenAI is not set up on this server".

**Offline extras** (no AI, labelled "Offline heuristics"): basic notes and a rule-based outline, produced only when you press "Make basic notes without AI" / "Basic outline (no AI)".

Every note, quiz, guide and deck records its origin (_Offline heuristics_, _OpenAI_, _Written by you_) and shows it in the UI.

## 7. Importing documents

| Source         | Limit                  | Notes                                                      |
| -------------- | ---------------------- | ---------------------------------------------------------- |
| TXT / Markdown | 5 MB                   | UTF-8, UTF-16 (BOM) and Windows-1252 fallback              |
| PDF            | 50 MB, first 500 pages | Text layer only; scans need OCR                            |
| DOCX           | 25 MB                  | Text, headings, lists                                      |
| PPTX           | 50 MB                  | Slide text and speaker notes                               |
| Images         | 15 MB                  | Needs OCR                                                  |
| Web page       | 2 MB (configurable)    | Fetched by the server (see Security)                       |
| YouTube        | –                      | Published caption tracks only. **No audio transcription.** |

Files are checked by extension **and** file signature before parsing. Legacy `.doc` / `.ppt` are rejected with an instruction to re-save in the modern format.

**OCR is opt-in and English OCR is fully local.** The tesseract.js engine and English language data ship with Ghadi (`npm run ocr:assets` copies them into `public/ocr`; it runs automatically before `dev` and `build`). Other languages download their data file once from `cdn.jsdelivr.net`, and only after Ghadi asks you. Your file is never uploaded.

## 8. Study material generation

The offline generator extracts what is literally in your text: ranked keywords, sentences that match definition patterns ("X is …", "X refers to …", "X, which is …"), dates, formulas and "for example" sentences. Quizzes are built from those, with distractors drawn from other terms in your document. It cannot reason, paraphrase or translate. If a document is too short to support the number of items you asked for, you get fewer items and a notice, not padded filler.

## 9. Spaced repetition

Ratings map to an SM-2-style schedule: _Known_ grows the interval, _Difficult_ grows it slowly and lowers ease, _Forgotten_ resets the interval to 0 (the card stays due and is requeued in the same session). Due dates are local midnights computed with calendar arithmetic, so daylight-saving changes cannot shift them. See `src/lib/study/srs.ts` and its tests.

## 10. Data, backup and privacy

Everything is in IndexedDB. Clearing site data erases it, so use **Settings → Download full backup**. Restores validate the whole file with Zod first and run in a single transaction that rolls back on failure. Backups are versioned (`schemaVersion`). Details: [docs/PRIVACY.md](docs/PRIVACY.md).

## 11. Security

SSRF-hardened URL import; strict input validation; a per-request nonce Content-Security-Policy with no `unsafe-inline` or `unsafe-eval` scripts; CSRF defences (Sec-Fetch-Site, Origin and JSON-only bodies); proxy-aware rate limiting; extra isolation headers (COOP/CORP, HSTS, Permissions-Policy); no secrets in the browser; CodeQL, dependency review, `npm audit` and secret scanning in CI. Policy and limitations: [SECURITY.md](SECURITY.md). Design analysis: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## 12. Accessibility

Semantic landmarks, skip link, visible focus, labelled controls, keyboard-operable dialogs with focus trapping, `aria-live` status messages, reduced-motion support, light/dark themes tested for contrast. The Playwright suite runs axe-core (WCAG 2 A/AA) over every page in both themes.

## 13. Project structure

```
src/app/            Next.js routes: landing, (app)/* screens, api/* routes
src/components/     UI primitives, layout, feature components
src/lib/
  validation/       Zod schemas (source of truth for types)
  storage/          Dexie database, repository, backup/restore
  study/            heuristic generators, quiz engine, SRS scheduler
  ai/               study-provider abstraction, OpenAI (server) client, prompts + validation, vision
  document-processing/  extractors, OCR, HTML + YouTube parsing
  security/         SSRF guard, safe fetch, rate limiter
tests/              unit, component (RTL) and e2e (Playwright)
docs/               architecture, roadmap, deployment, privacy, publishing
```

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 14. Scripts

| Command                           | Purpose                                     |
| --------------------------------- | ------------------------------------------- |
| `npm run dev`                     | Development server                          |
| `npm run build` / `npm start`     | Production build / server                   |
| `npm run lint`                    | ESLint                                      |
| `npm run typecheck`               | `tsc --noEmit`                              |
| `npm run format` / `format:check` | Prettier                                    |
| `npm test`                        | Unit and component tests (Vitest)           |
| `npm run test:e2e`                | Playwright end-to-end + accessibility tests |
| `npm run check`                   | lint + typecheck + unit tests + build       |

If your environment already has a Chromium build, point Playwright at it with `PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`; otherwise run `npx playwright install chromium` once.

## 15. Testing

Unit tests cover scheduling, grading, generation, storage, backup, validation, AI provider handling (with a fake `fetch`), HTML/YouTube parsing, PPTX extraction, SSRF and the rate limiter. Component tests cover dialogs, the quiz player/results and the flashcard session. Playwright drives the real built app through import → notes → quiz → flashcards → reload → backup → wipe → restore, with no AI configuration, plus axe accessibility scans.

## 16. Deployment

Ghadi needs a Node.js server (Vercel, a container, any Node host) because of its two API routes. Static export is **not** supported. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 17. Configuration

All environment variables are optional and server-side. See [.env.example](.env.example).

## 18. Known limitations

- Offline generation is rule-based and shallow. Quizzes can contain awkward questions; always check against your source.
- Offline generation cannot translate; non-English _output_ requires an AI model. Text in other scripts (including right-to-left) is displayed correctly, but keyword extraction works best on space-separated languages.
- Scanned PDFs and images need OCR. English OCR is bundled and local; other languages download data once, after you agree. OCR is slow on large files (capped at 30 PDF pages).
- YouTube import depends on a public, undocumented page structure and may break without notice. Videos without captions are refused.
- Data lives in one browser profile. There is no sync; use backups to move between devices.
- The rate limiter is in-memory and per server instance.
- OpenAI integration was verified with mocked responses (unit + browser tests) in the environment where this was built; a real request needs a key and was not made there. After deploying, use **Settings → Test OpenAI**. YouTube/URL import against live sites and non-English OCR data download were likewise verified with fakes only.
- `npm audit` reports findings; see [SECURITY.md](SECURITY.md).

## 19. Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

## 20. Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## 21. Publishing to GitHub

See [docs/PUBLISHING.md](docs/PUBLISHING.md) for step-by-step commands. This repository has not been pushed anywhere by the tooling that generated it.

## 22. License

[MIT](LICENSE) © 2026 Ghadi contributors. Ghadi is an independent project with its own code, design and branding.

## Study vs. Quiz

Ghadi keeps two workflows apart:

- **Study** ("teach me this"): Attach File / Paste URL / Attach Photos open `/study/:id`, a visual study guide (overview, objectives, sections, key terms, steps, tables, SVG flow diagrams, recaps, glossary). Long documents are processed in sections and merged. The guide is written by OpenAI after you press "Write my study guide" and checked against the source (incomplete terms, formulas and invented questions are removed); a clearly labelled rule-based outline is available on request. Guides are saved locally and included in backups.
- **Quiz** ("test what I know"): Quick Quiz opens `/quizzes/new` (document or topic, count, difficulty, language, types, reveal timing), then Take Exam / Export Exam.
- **Text-quality gate**: text is checked for encoding damage, noise and stray symbols, repeated lines, run-together or missing numbered questions, broken numbers/expressions and fragments; legitimate maths, scientific notation and other scripts pass. When it is unreliable Ghadi explains why and offers: upload a clearer file, read a photo with OpenAI vision, remove noisy lines, or correct the text by hand. Your original extraction is kept for comparison, your corrections are saved, and every later AI request uses the corrected text. Ghadi will not generate a guide, notes, cards or a quiz from unusable text.
- **Extraction by source**: text PDFs are read directly with position-aware layout (columns, exponents, paragraphs, page markers); DOCX keeps headings, lists, tables, superscripts and subscripts; PPTX keeps slides and notes; scanned PDFs (up to 40 pages, in batches of 4) and photos can be read with OpenAI vision after you agree, or with on-device OCR.

Limitations: diagrams are drawn only from relationships the guide states; Ghadi does not re-run OCR from a stored image (retake a clearer photo instead); the offline guide is an outline, not a full explanation.
