# Architecture

## Principles

1. **Local-first.** The browser is the system of record (IndexedDB). The server is optional and stateless.
2. **One source of truth for data shapes.** Zod schemas (`src/lib/validation/schemas.ts`) define the TypeScript types _and_ validate everything that crosses a trust boundary: records before they are written, backups before restore, model output before use, API request bodies.
3. **Honest provenance.** Every note, quiz and deck carries an `origin` (`manual | heuristic | local-ai | hosted-ai`); note items also carry `provenance` (`extracted | generated | user`).
4. **Pure core, thin UI.** Grading, scheduling, generation and statistics are pure functions with unit tests. Components call them through a few orchestration helpers.

## Layers

```
UI (src/app, src/components)
   │  hooks: useLive (Dexie liveQuery), useSettings
   ▼
Orchestration (src/lib/actions.ts)  ── read settings → run provider (with fallback) → validate → save
   ▼
Providers (src/lib/ai)              ── StudyProvider interface
   │     OfflineProvider → study/heuristic.ts (deterministic)
   │     LlmProvider(CompleteFn) → Ollama client | Hosted client → /api/ai/generate
   ▼
Core logic (src/lib/study)          ── srs, quiz-engine, text, build
Storage (src/lib/storage)           ── db (Dexie), repo (validated writes), backup
Security (src/lib/security)         ── ssrf, safe-fetch, rate-limit (server only)
```

## Provider abstraction

`StudyProvider` exposes `generateStudyNotes`, `generateQuiz`, `generateFlashcards`, `explainAnswer`, `summarizeContent`. `LlmProvider` implements all of them once on top of a `CompleteFn({task, payload})`, so Ollama and hosted AI differ only in transport. Prompts and output schemas live in `ai/tasks.ts`: untrusted document text is delimited and labelled as data, JSON is extracted and validated with Zod, and one retry is attempted on invalid output.

`generateWithFallback` runs the chosen provider; on any failure except user cancellation it runs the offline generator and adds a notice explaining what happened. UI never shows offline output as model output.

## Data model (IndexedDB tables)

`documents · notes · quizzes · attempts · decks · cards · reviews · collections · settings`. Deleting a document keeps derived material but unlinks it; deleting a quiz or deck cascades to its attempts or cards and review logs, inside a transaction. Reviews are written together with the card's new schedule in one transaction.

## Document processing

`validateFile` (extension + magic bytes + size) → extractor per format (all in-browser) → `normalizeText` → `StudyDocument`. PDFs with almost no text are reported as `needs-ocr` and are not stored until the user opts into OCR. English OCR runs in a same-origin web worker with bundled WebAssembly. URL/YouTube import goes through the server route because browsers cannot fetch cross-origin pages; the server returns plain text only.

## Server routes

`runtime = "nodejs"`, `dynamic = "force-dynamic"`. Because of these routes the app cannot be statically exported.

- `GET /api/ai/status` – `{ configured, model? }`
- `POST /api/ai/generate` – consent + rate limit + server-built prompt + validated output
- `POST /api/import/url` – SSRF-safe fetch → article extraction or YouTube captions

## Spaced repetition

`applyRating(schedule, rating, now)` implements: _forgotten_ → interval 0, repetitions reset, ease −0.2 (min 1.3), lapse +1; _difficult_ → interval ×1.2 (1 day for a new card), ease −0.15; _known_ → 1 day, then 6 days, then interval × ease, ease +0.1. Due dates are local midnights from calendar arithmetic. Behaviour is pinned by `tests/unit/srs.test.ts`.

## Testing strategy

Vitest (jsdom + fake-indexeddb) for logic and components; Playwright against the production build for flows and axe accessibility scans. Network-dependent code is tested with fake `fetch` implementations or local `http` servers.
