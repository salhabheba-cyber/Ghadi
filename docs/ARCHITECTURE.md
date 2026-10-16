# GHADI — architecture & MVP scope (Phase 1)

Status legend: DONE = implemented and tested, STUB = interface only, TODO = not started.

## Starting state
Empty working directory, no repository. Node 22, pnpm, Python 3.13, uv, Postgres 16 binaries,
Tesseract 5.3 installed. No Docker daemon, no provider credentials. A local Postgres cluster is
started from `.pgdata` (see README).

## Decisions and trade-offs
| Area | Choice | Why / deviation from baseline |
|---|---|---|
| App | Next.js (App Router) + TypeScript, **unified backend** via route handlers/server code | Baseline suggested FastAPI. For this slice nothing needs Python (OCR/doc ingestion are later). One deployable, one test runner. OCR/ingestion will be a separate Python worker behind the `OcrProvider` interface when Phase 5 starts. |
| DB | PostgreSQL, plain SQL migrations (`migrations/`), `pg` | Explicit, reviewable SQL; no ORM magic over authorization. |
| Auth | Better Auth (email+password, DB sessions, HttpOnly cookies) | Established library instead of hand-rolled sessions. |
| AuthZ | Server-side only: every child/lesson query is scoped by `guardian_id` in SQL | Never trust the client; covered by tenant-isolation tests. |
| Validation | Zod at every boundary, including model output | Teacher output is validated before it reaches the UI. |
| i18n | Locale path segment (`/en`, `/fr`, `/ar`), `dir` set per locale | UI strings are drafts; Arabic/French need native review before any claim of support. |
| Providers | `LlmProvider`, `SpeechToText`, `TextToSpeech`, `AvatarProvider`, `OcrProvider` interfaces | Only the deterministic **demo** teacher, browser speech (feature-detected) and a still teacher photo exist now. |

## Modules (12) and status
1. Identity & profiles — parent signup/signin, child profiles, consent record: DONE (this slice)
2. Curriculum catalog & versioning — schema + original seed lessons with license metadata: DONE
3. Lesson delivery & activity renderer — DONE for two activity kinds: `choice` (tap) and `count`. No matching, tracing, drawing or voice activities yet
4. Teaching orchestrator — explicit state machine + schemas + demo teacher: DONE
5. Speech & avatar adapters — interfaces + browser text-to-speech (feature-detected; NOT verified on real devices) + still teacher photo with an AI badge (no animation, no lip-sync). No speech-to-text and no microphone use at all: PARTIAL
6. Upload/OCR/validation — DONE locally (Tesseract via `OCR_PROVIDER=tesseract`; review before use; EN tested only)
7. Assessments & grading — deterministic grading of the two activity kinds; no generated assessments or multiple formats yet: PARTIAL
8. Progress & spaced review — evidence + mastery estimate + rule-based review suggestions (`recommend.ts`): DONE
9. Agenda & scheduling — DONE for explicit-date extraction + parent confirmation; no reminders
10. Parent reports — printable report with reasoned recommendations and limits: DONE; no notifications
11. Subscription entitlements — DONE (7-day trial, US$5/month, server-side gate); payments NOT connected
12. Safety/consent/audit/retention/deletion — consent records, audit log, export, delete learning data / delete profile, orphan cleanup. No automated retention schedule, no child-mode lock: PARTIAL

## Teaching state machine
`introduction → explanation → guided_practice → independent_attempt → (correction ↺) → recap → completion`
Transitions are computed in code (`src/lib/teaching/machine.ts`), not chosen by a model.
Mastery is never set by session end; it is derived from stored attempt evidence only.

## Page map
`/[locale]` landing · `/[locale]/sign-up` · `/[locale]/sign-in` · `/[locale]/parent` dashboard ·
`/[locale]/parent/children/new` · `/[locale]/parent/children/[id]` (progress, delete) ·
`/[locale]/learn/[childId]` student home · `/[locale]/learn/[childId]/lesson/[lessonId]` session.
Also: `/[locale]/learn/[childId]/dictation|reading[/textId]` · `/[locale]/parent/uploads[/id]` · `/[locale]/parent/agenda` ·
`/[locale]/parent/children/[id]/report` · `/[locale]/parent/billing` · `/[locale]/admin` (staff only) ·
`/[locale]/privacy` and `/terms` (drafts) · `/[locale]/forgot-password`, `reset-password`.

## Provider selection (env)
`SMS_PROVIDER`, `MAIL_PROVIDER`, `OCR_PROVIDER`, `LLM_PROVIDER` choose adapters; unset means "unavailable" and the UI says so.
Console SMS/mail are dev-only and refused when `NODE_ENV=production`.

## AI teacher boundary
The LLM sees only short non-identifying event data (first name, correctness verdict from deterministic grading, lesson title).
Lesson explanations, questions, hints and corrections are shown verbatim from approved content. Uploads/OCR text never reach it.
