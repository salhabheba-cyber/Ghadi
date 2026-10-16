# GHADI — Learn today. Grow for tomorrow.

An early, **supervised pilot slice** of a multilingual teaching platform. It targets ages 3–5 first (colours, shapes, counting, first sounds) with parent-managed accounts. The tagline is provisional.

> **Read this first.** Unless you configure and test an LLM key, the teacher is a **fixed script, not an AI model**, and every lesson screen says which. Payments are **not connected** (the 7-day trial and US$5/month rules exist, but nobody can pay yet). Speech recognition, realistic avatar and reminders are not built. French and Arabic are unreviewed drafts. Privacy/terms pages are drafts awaiting legal review; no legal compliance is claimed. See [`docs/STATUS.md`](docs/STATUS.md) for the full, honest picture.
>
> Teacher video clips (lip-synced to exact sentences) are supported but none exist yet: see [`docs/TEACHER_CLIPS.md`](docs/TEACHER_CLIPS.md).
>
> Staff: grant a content role with `pnpm user:role you@example.com admin`, then open `/en/admin`.

## What works today
- Parent sign-up / sign-in (Better Auth, DB sessions, HttpOnly cookies), child profiles with a nickname and age band only, consent records, JSON export, delete learning history, delete profile.
- A curriculum catalogue with source, license, jurisdiction, language, age range, versioning and an honest *alignment note*. Only **approved** content is served. Six original sample lessons are seeded (4 English approved; French and Arabic counting drafts are `in_review` and not shown to children).
- An interactive lesson with an explicit state machine (introduction → explanation → guided practice → independent attempt → correction → recap → completion), deterministic grading, hints in guided practice only, and answers never sent to the browser before an attempt.
- Append-only skill evidence and an evidence-based estimate per skill (never set by "session ended"); parents see limits and can clear a skill's record.
- EN / FR / AR UI with `lang`/`dir` handling (FR/AR are drafts), teacher photo (still image, no animation or lip-sync), browser text-to-speech when the device offers it, gentle break reminder, no streaks.

## Quick start
Requirements: Node 22, pnpm 10, PostgreSQL 16 reachable locally.

```bash
pnpm install
cp .env.example .env        # then edit BETTER_AUTH_SECRET at least
createdb ghadi_dev && createdb ghadi_test   # or any two empty databases; test DB name must end in _test
pnpm db:migrate             # applies migrations/*.sql (idempotent)
pnpm db:seed                # original sample lessons (idempotent)
pnpm dev                    # http://localhost:3000
```
With `GHADI_ENABLE_DEMO_ENTRY=true` (dev only) the landing page has a **Try the demo** button that creates a throwaway parent. Then: *Add a child → tick the two consent boxes → Start learning*.

### No Postgres service handy?
This is how the project was developed in a sandbox without Docker (as a non-root user):
```bash
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | head -1)
$PGBIN/initdb -D .pgdata -U ghadi --auth=trust -E UTF8
$PGBIN/pg_ctl -D .pgdata -o "-k /tmp -p 5432 -c listen_addresses=127.0.0.1" -l .pgdata/server.log -w start
psql -h 127.0.0.1 -U ghadi -d postgres -c "create database ghadi_dev" -c "create database ghadi_test"
```
(`--auth=trust` is for local development only.)

## Checks
```bash
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest; needs TEST_DATABASE_URL (resets that DB's schema on every run)
pnpm build       # next build
pnpm start       # in one terminal, then in another:
pnpm smoke       # HTTP end-to-end checks against the running server (needs DATABASE_URL)
```
`pnpm smoke` submits the real forms and API as two different parents, plays a whole lesson, exercises export/deletion and cleans up after itself. It does **not** use a browser.

## Layout
```
migrations/      plain SQL, applied in order by scripts/migrate.ts
src/lib/schemas.ts           Zod schemas: activities, lesson content, teacher turn, answers, consent
src/lib/teaching/            state machine, grading, mastery, demo teacher, phrases
src/lib/providers/types.ts   LLM / STT / TTS / OCR / avatar interfaces (only demo + browser TTS exist)
src/lib/repo/                data access; every query is scoped to the guardian in SQL
src/app/[locale]/            pages + server actions;  src/app/api/  JSON API (origin check, auth, rate limit)
tests/ docs/ scripts/
```
Architecture, trade-offs and the module-by-module status are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Pre-launch requirements are in [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md).

## Providers and credentials
| Capability | Today | To enable a real one |
|---|---|---|
| Teacher / LLM | `demo` scripted teacher (labelled) | Implement `TeacherProvider`, validate output with `TeacherTurn`, add safety evaluation |
| Text-to-speech | Browser `speechSynthesis` if present (untested on real devices) | Implement `TextToSpeechProvider` |
| Speech-to-text, OCR, avatar | Not implemented | Implement the interfaces in `src/lib/providers/types.ts` |
| Billing | Not implemented | Needs confirmed region, credentials and compliance |

## Deployment (documented, not yet exercised)
Node 22 + PostgreSQL 16. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NODE_ENV=production`; run `pnpm db:migrate`; `pnpm build && pnpm start`. Put it behind TLS. Production deployment has **not** been tried; work through `docs/RELEASE_CHECKLIST.md` first.


## Install as an app (PWA)

GHADI is a web platform that can also be installed like an app, with no app-store step:
open it in Chrome/Edge (Android, desktop) or Safari (iPad/iPhone: Share → Add to Home Screen) and choose *Install*.
It then opens full-screen with the GHADI icon. Tablet is the primary target for student sessions.

- Manifest: `src/app/manifest.ts`; icons: `public/icons/`.
- Service worker (`public/sw.js`) is registered in production builds only and caches **just** a static offline page.
  Pages and API responses are never cached, so no child or parent data is stored by the service worker.
- Not done: app-store packages (a Capacitor/TWA wrapper would be the next step), offline lessons, push notifications.
- Install prompts need HTTPS (or localhost). Verified here: manifest, icons and service-worker files are served and linked;
  actual install on a real device has **not** been tested.


## Sign-in, free trial and subscription

- **Sign in with email + password, or with a mobile number** (6-digit SMS code, E.164 numbers such as +961 70 123 456; the first successful code creates the account). Mobile sign-in needs an SMS provider: set `SMS_PROVIDER` (see `.env.example`). Without one the page says it is unavailable. The `console` provider (dev only) prints codes to the server log and is refused in production.
- **Plan:** every new parent gets a 7-day free trial, then US$5 per month (`plans` table, migration 005). Access is decided server-side from dates (`src/lib/billing/entitlement.ts`) and enforced before any lesson starts or continues; an expired trial blocks lessons but never blocks viewing, exporting or deleting family data.
- **Payments are NOT connected.** No provider adapter exists, so nobody can subscribe yet; `recordPayment` is the function a verified provider webhook will call. Choose the provider first: availability depends on where the business is registered (check Stripe/Paddle/Lemon Squeezy/local options for Lebanon before building).
- **Known gaps:** one trial per account means a person can create several accounts (phone verification helps; add device/payment-method checks later); SMS delivery to Lebanese numbers, cost and sender registration are unverified; SMS pumping fraud is mitigated only by in-memory per-number/per-IP limits.
