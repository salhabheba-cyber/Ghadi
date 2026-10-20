# Roadmap

Ideas, roughly in priority order. Nothing here is promised.

## Next

- Offline-first service worker (PWA), once it can be done without weakening the nonce-based CSP.
- Bundle more OCR languages (opt-in downloads) so fewer users need the CDN.
- Better offline generation: sentence-pair "compare/contrast" questions, cloze with context, fewer low-value keywords; language-specific stopword lists.
- Shared-store rate limiting (Redis/Upstash adapter) for multi-instance deployments.
- Internationalisation of the UI (the data and layout already support right-to-left text).

## Later

- Optional encrypted backups.
- Optional sync via a user-provided WebDAV/S3 endpoint.
- Image occlusion cards; audio flashcards.
- Import from Anki packages and CSV.
- Deck/quiz sharing via exported files.
- Scheduler experiments (FSRS) behind a setting, with the current scheduler as default.
- Browser-side speech-to-text for audio files (local model, opt-in).

## Non-goals

- Mandatory accounts, tracking, or advertising.
- Silently sending documents to any third party.
