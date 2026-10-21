# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/) (pre-1.0: minor versions may include breaking changes).

## [0.1.0] - Unreleased

First public version.

### Added (School Reading platform)

- Multilingual (Arabic RTL, French, English) school reading platform for ages 3-18: 241 stored books with licences and attribution, reader with TOC, bookmarks, resume, search, read-aloud and display controls, student dashboard (Home, My Books, Explore, Progress).
- Generated Ghadi Student IDs with optional PIN, lockout and database rate limits; staff invites, schools, classes, join codes, approval, teacher ID reissue and audit log; platform admin dashboard (counts only).
- Completion tracking (90% reached, active time, comprehension check, one record per student and book), per-school Top 5 with configurable prizes and a neutral badge fallback.
- Optional server-side OpenAI reading companion with consent, moderation and verified evidence.
- PostgreSQL (`pg`) with forward-only migrations; embedded PGlite for tests and opt-in development.
- Docs: [READING_PLATFORM](docs/READING_PLATFORM.md), [BOOK_SOURCES](docs/BOOK_SOURCES.md).

### Changed (AI and text quality)

- OpenAI is the only AI engine, server-side, with centrally configured text (`OPENAI_MODEL`) and vision (`OPENAI_VISION_MODEL`) models. The Ollama provider and the provider setting were removed; failures are shown and never silently replaced by another provider or by heuristics.
- New `/api/ai/vision` route and "Read with OpenAI" import for photos and scanned PDFs (batched, page-referenced, consent required).
- Position-aware PDF text extraction (columns, exponents, page markers); richer DOCX structure.
- New text-quality gate and grounding checks: no more question numbers or website names as key terms, incomplete facts/formulas/definitions are dropped, worksheet questions stay separate and ordered, invented exercises are removed.
- Learner corrections to extracted text are saved (original kept) and used by all later AI requests; guides detect when the text changed.
- Explain simpler validates the answer (never echoes the passage), supports cancel and retry.

### Added

- Local-first storage in IndexedDB (Dexie) with Zod-validated records and versioned backup/restore.
- Document import: PDF, DOCX, PPTX, TXT, Markdown, pasted text, web pages, YouTube captions, and images/scanned PDFs via opt-in OCR.
- Offline heuristic generation of study notes, quizzes and flashcards, clearly labelled as not AI.
- Optional Ollama (local) and server-side hosted AI providers behind a common interface, with consent (superseded: see Changed).
- Quiz engine (multiple choice, true/false, short answer, fill-in-the-blank) with scoring, explanations, retry and history.
- Flashcards with an SM-2-inspired scheduler and keyboard-driven review.
- Dashboard built only from real activity, library with collections/tags/search, Markdown/CSV/JSON export, print styles.
- SSRF-hardened URL import, rate limiting, security headers.
- Security hardening: per-request nonce Content-Security-Policy via `src/proxy.ts` (no `unsafe-inline`/`unsafe-eval` scripts; Zod runs in `jitless` mode), HSTS/COOP/CORP and other headers, layered CSRF checks (Sec-Fetch-Site, Origin, JSON-only bodies), proxy-aware rate limiting (`GHADI_TRUST_PROXY`, `GHADI_TRUSTED_PROXY_HOPS`), safer export file names.
- Self-hosted English OCR (no CDN request); other languages download data only after consent.
- CI: CodeQL, dependency review, `npm audit` gate and gitleaks secret scan; `security.txt`; [threat model](docs/THREAT_MODEL.md); browser-level security tests (headers, nonce, zero CSP violations, XSS payloads, request hardening, local OCR).
- Light/dark themes; axe-verified accessibility; unit, component and end-to-end tests; CI workflow.
