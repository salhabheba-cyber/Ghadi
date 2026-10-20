# Contributing to Ghadi

Thank you for helping! Ghadi is a free, open-source study tool and welcomes contributions of all sizes.

## Ground rules

- Be kind. Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Honesty first.** Never present offline heuristics as AI, never show fabricated statistics, never add dummy data to the UI. Every generated item keeps an accurate `origin`.
- **Privacy by default.** Anything that sends user text off the device must be opt-in, explained, and documented in [docs/PRIVACY.md](docs/PRIVACY.md).
- **Original work only.** Do not copy code, text, branding or assets from other products.

## Setup

```bash
git clone https://github.com/salhabheba-cyber/Ghadi.git
cd Ghadi
npm install          # Node >= 22.13
npm run dev
```

## Before opening a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e     # needs a Chromium build; see README
npm run format       # Prettier
```

CI runs the same checks.

## Guidelines

- **TypeScript is strict.** Avoid `any`; validate every untrusted input with Zod (`src/lib/validation/schemas.ts` is the source of truth for data shapes).
- **Business logic in `src/lib`, UI in `src/components` and `src/app`.** Study logic (SRS, grading, generation) must stay pure and unit-tested.
- **Tests with behaviour changes.** Bug fixes need a regression test. New study logic needs unit tests. New screens need an e2e or component test and must pass the axe scan.
- **Accessibility:** labelled controls, keyboard operation, visible focus, sufficient contrast in light _and_ dark themes.
- **Security-sensitive code** (`src/lib/security`, `src/app/api`): keep changes small, explain the threat in the PR, add tests. Do not add flags that relax checks to request-reachable code.
- **No new runtime dependency without a reason** in the PR description (size, licence, maintenance).
- **Database changes:** bump the Dexie version with an upgrade path, and the backup `schemaVersion` if the backup shape changes.

## Commit and PR style

Small, focused commits with imperative subjects ("Add CSV export for decks"). Describe _why_ in the body when it is not obvious. Link the issue the PR closes.

## Reporting bugs and ideas

Use the issue templates. For security problems follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
