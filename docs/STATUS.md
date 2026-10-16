# GHADI — implementation status

_Last verified: 2026-10-15 (exact commands under "Evidence")._ An early, supervised pilot for ages 3–5.
Not production-ready: see `RELEASE_CHECKLIST.md`.

## Acceptance criteria

| Criterion | Status | Evidence / caveat |
|---|---|---|
| Parent sign-up/sign-in (email or mobile number), child profiles, preferences | **Done** | `tests/auth`, `phone-auth`, `recovery`, `smoke`. Email reset/verification and SMS codes need a configured provider (console providers are dev-only and refused in production). Twilio/Resend adapters are written to their documented APIs but **never tested against the real services**. No MFA. |
| 7-day trial, US$5/month entitlement, server-side access check | **Done (logic)** | `tests/billing`. **No card/online payment provider is connected.** Manual payments work: set `WHISH_NUMBER`, families send US$5 by Whish Money, an admin confirms it at `/en/admin` (+30 days, audited; `tests/manual-payments`). Without `WHISH_NUMBER` the Subscribe button is disabled and says so. |
| Child opens a sample lesson and completes an activity | **Done** | Full lesson via live API in `smoke`; React lesson screen opened in real Chromium (screenshots, no console errors). Not tested on real tablets/phones. |
| Lesson grounded in stored approved content with objectives | **Done** | Only `approved` versions are served; objectives, source, license, alignment note shown. |
| Explanation → practice → feedback → recap | **Done** | `tests/machine`, `lesson-flow`. |
| Speech | **Partial** | Browser text-to-speech is feature-detected (unavailable is reported). All answers work by tap/typing. No speech-to-text, no microphone. |
| Uploads private, validated, reviewable | **Done (local OCR)** | Magic-byte/size/quota checks, private authenticated file route, Tesseract OCR with low-confidence words flagged, parent must review before use. OCR text is only ever treated as quoted text. English OCR tested on one generated sample; **French/Arabic language packs not installed or tested**. No antivirus scan. OCR runs in-process (no queue). |
| Dictation / reading practice | **Done (limited)** | Typed dictation with deterministic word diff (punctuation/capitals reported separately). Reading: grown-up marks words; **no speech recognition, no pronunciation scoring**. Handwriting not supported. |
| Parent review of progress, report, delete data | **Done** | Delete-my-account (typed email) removes the account, sole-guardian children, uploads, planner and subscription. Report page (printable) with reasons for each recommendation and stated limits; per-skill reset, delete history, delete profile, JSON export (includes practice, family texts, agenda). |
| Study planner | **Done (limited)** | Only dates written out in full are extracted; ambiguous day/month flagged; nothing counts until a parent confirms. **No reminders are sent.** |
| Admin / content-editor role | **Done (basic)** | Role read from the DB on every request; draft→in_review→approved/retired; only admins approve/retire; approval recorded with who/when + audit event; roles granted only via `pnpm user:role`. No in-app content authoring/editing yet; content comes from seeds. |
| AI teacher (LLM) | **Adapter written, NOT verified live** | `llm-teacher.ts` words only greeting/feedback/recap/goodbye; lesson text is verbatim; output schema-validated; falls back to the demo script. Tested with a mocked fetch only. Without `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` the labelled demo teacher is used. |
| Teacher face | **Photo done; clips not made yet** | Owner's photo with AI badge and gentle motion. The app can play a pre-rendered lip-synced clip for each FIXED sentence (59 English lines listed in `docs/teacher-lines.json`; none rendered yet), otherwise photo + browser voice. Player tested in a real browser with a dummy clip only. Not real-time lip-sync; new/dynamic sentences have no lip-sync. See `docs/TEACHER_CLIPS.md`. |
| Admin dashboard | **Done** | Admin-only counts of sign-ups, trials, paying/lapsed families, child profiles, confirmed payments/income (from payments you confirm, not read from Whish), and an inbox of messages from families with an open-count badge. Aggregates only; no child data. |
| Help chat | **Done (keyword bot, not AI)** | Floating Help button for visitors and parents (hidden on child screens). Answers from a written knowledge base in EN/FR/AR (FR/AR unreviewed); when it doesn't know it offers "Talk to the team", which saves the message + email to the admin inbox (and emails `CONTACT_EMAIL` only if a mail service is configured and working). Chat text itself is not stored. Rate-limited, honeypot, same-origin check. |
| Legal pages | **Draft only** | `/privacy`, `/terms` describe what the software does and are labelled as unreviewed by a lawyer, with operator sections left to complete. |
| Error/loading/empty/permission-denied handling | **Partial** | Banners, pending buttons, empty states, 404 for other families' data, 402 for expired subscription. No global error page; no mic-permission flow (no mic). |
| Tests, lint, build, migrations, no secrets | **Done** | See Evidence. |

## Not built
- Automatic card payments (any provider), real SMS/email delivery verified, push/email reminders.
- Speech-to-text, realistic avatar, handwriting recognition, pronunciation assessment.
- Real queue/worker for OCR; antivirus scanning; private object storage (files are stored in PostgreSQL).
- Content authoring UI, translations workflow, content for ages above 5, assessments beyond tap/count questions.
- Automatic data-retention schedule; child-mode lock on a signed-in parent device.
- Deployment (blocked: needs a GitHub repository/valid credentials for the hosting tool, and operator secrets).

## Known limitations and caveats
- Teacher is a fixed script unless an LLM key is configured and tested; every lesson screen says which.
- French and Arabic are unreviewed drafts (visible banner); FR/AR lessons are not served to children.
- Sample lessons are original, not reviewed by an education specialist, and claim no curriculum alignment.
- Mastery labels are rough evidence summaries, never "mastered", not validated assessments.
- One person can create several accounts and get several trials (no device/phone de-duplication).
- Rate limiter is in-memory (single instance). PWA install and offline page not tested on real devices.
- The dictation text is present in the page data (needed for speech playback).
- No legal review; **no COPPA/GDPR or other compliance is claimed.**
- Accessibility: contrast is unit-tested; keyboard, screen-reader and child touch usability are untested.
- Admin screens are English-only staff tooling.

## Evidence (run 2026-10-15)
```
pnpm lint        → exit 0
pnpm typecheck   → exit 0
pnpm test        → 19 files, 143 passed, 1 skipped (OCR test, passes with OCR_TEST=1) — real PostgreSQL test DB
pnpm build       → exit 0
pnpm start -p 3100 && BASE_URL=http://localhost:3100 pnpm smoke → 58 checks passed
pnpm audit --prod → No known vulnerabilities found
Playwright/Chromium screenshots of the new pages → no console errors
```
Not run: real devices, screen readers, load tests, live Twilio/Resend/Anthropic calls, deployment.
