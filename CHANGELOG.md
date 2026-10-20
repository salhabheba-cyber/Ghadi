# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/) (pre-1.0: minor versions may include breaking changes).

## [0.1.0] - Unreleased

First public version.

### Added

- Local-first storage in IndexedDB (Dexie) with Zod-validated records and versioned backup/restore.
- Document import: PDF, DOCX, PPTX, TXT, Markdown, pasted text, web pages, YouTube captions, and images/scanned PDFs via opt-in OCR.
- Offline heuristic generation of study notes, quizzes and flashcards, clearly labelled as not AI.
- Optional Ollama (local) and server-side hosted AI providers behind a common interface, with consent and automatic honest fallback.
- Quiz engine (multiple choice, true/false, short answer, fill-in-the-blank) with scoring, explanations, retry and history.
- Flashcards with an SM-2-inspired scheduler and keyboard-driven review.
- Dashboard built only from real activity, library with collections/tags/search, Markdown/CSV/JSON export, print styles.
- SSRF-hardened URL import, rate limiting, security headers.
- Security hardening: per-request nonce Content-Security-Policy via `src/proxy.ts` (no `unsafe-inline`/`unsafe-eval` scripts; Zod runs in `jitless` mode), HSTS/COOP/CORP and other headers, layered CSRF checks (Sec-Fetch-Site, Origin, JSON-only bodies), proxy-aware rate limiting (`GHADI_TRUST_PROXY`, `GHADI_TRUSTED_PROXY_HOPS`), safer export file names.
- Self-hosted English OCR (no CDN request); other languages download data only after consent.
- CI: CodeQL, dependency review, `npm audit` gate and gitleaks secret scan; `security.txt`; [threat model](docs/THREAT_MODEL.md); browser-level security tests (headers, nonce, zero CSP violations, XSS payloads, request hardening, local OCR).
- Light/dark themes; axe-verified accessibility; unit, component and end-to-end tests; CI workflow.
