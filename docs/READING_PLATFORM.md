# School Reading platform

A multilingual (Arabic RTL, French, English) reading platform for students aged 3-18, added to Ghadi without changing its brand. Study tools (`/dashboard`, `/library`, ...) remain local-first; the reading platform is server-backed and needs PostgreSQL (`DATABASE_URL`).

## Roles

| Role           | Who                   | Can                                                                                       |
| -------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| Student        | a child               | read, bookmark, resume, finish books, see own progress and their school's Top 5           |
| Teacher        | invited staff         | manage own classes, see their students' reading, void/restore a completion, reissue an ID |
| School admin   | invited staff         | everything for their school, leaderboard format and prizes, approve classes               |
| Platform admin | you (via setup token) | schools, staff invites, book catalog status, aggregate counts only (no student content)   |

Every school-scoped query takes the school from the signed-in actor, never from the request. Access to another school's data returns 404.

## Student IDs and recovery

- A student registers with a school join code (`XXXX-XXXX`) or a class code, choosing a display name and language. Ghadi generates a random **Ghadi Student ID** `GH-XXXX-XXXX-XXXX` (alphabet without look-alike characters) and shows it **once**. Only a hash and a 4-character hint are stored.
- An optional PIN (scrypt-hashed) can be set. Sign-in needs the ID (and PIN if set).
- Five failed sign-ins lock the account for 15 minutes. Endpoints are rate limited in the database (per IP when `GHADI_TRUST_PROXY=true`, and per account).
- A lost ID cannot be looked up. A teacher or school admin verifies the child in person, then **reissues** a new ID; the old one stops working and the action is written to the audit log.
- Staff sign in with email and password (scrypt) from one-use invite links. The first platform admin is created at `/admin` with `GHADI_SETUP_TOKEN`.

## Reader

Chapter or page navigation, RTL for Arabic books, font size and family, theme, line spacing, table of contents, bookmarks, resume where you stopped (locator plus percent), in-book search and read-aloud (the browser's speech synthesis; quality depends on the device's voices). Preferences live in the browser (`ghadi_reader_prefs`). The interface language is `ghadi_read_lang`.

## Completion

A book counts as finished only when all of the following hold:

1. at least 90% of the book has been reached;
2. enough _active_ reading time for its length (derived from word count). Time is credited from heartbeats sent every 15 s while the tab is visible and the child was active in the last 60 s; each credited gap is 5-45 s, so leaving a tab open earns nothing;
3. the comprehension check is passed (at least 2 of 3; at most 3 attempts). Questions are built from the book text; with the optional AI companion they are generated from the book and each answer's evidence quote is verified against the real text, otherwise they are fill-in-the-sentence checks;
4. a teacher may also mark a book complete or **void/restore** a completion; both are audited.

There is one `completions` row per student per book, so re-reading never double counts.

## Leaderboard and prizes

Per school, private to that school. Ranks use SQL `RANK()` so ties share a rank (1, 2, 2, 4); the Top 5 ranks are shown. The school admin picks the name format (first name, initials, or anonymous), and a child can hide their name. Prizes come from the school's challenge settings (`challenges.prizes`). When none are configured every finisher gets a neutral "Ghadi reading badge" - no prize is invented.

## Optional AI companion (OpenAI)

Off unless the server has `OPENAI_API_KEY` **and** the student (or school) has given consent. It can explain a word, simplify a passage, answer a question about a passage, play a word game and write comprehension questions. Only the selected passage and the book title are sent - never name, school, age or ID. Free-text questions pass OpenAI moderation first and fail closed. The key never reaches the browser. Everything else works without it.

## API

All routes are under `/api/app/*` (one catch-all handler, route table in `src/lib/server/api/handler.ts`). Cookies `ghadi_s` (student) and `ghadi_a` (staff) are HttpOnly, SameSite=Lax. `public/sw.js` never caches `/api/`.

## Tests

- `tests/server/*` - services and API against embedded Postgres (PGlite): IDs, lockout, tenancy, completion rules, leaderboard, companion.
- `tests/unit/*` - reader model, strings (en/fr/ar parity), catalog files and licences.
- `tests/e2e/reading.spec.ts` - a 10-step browser journey (setup, invite, class, register, ID login, Arabic mobile home, reader, blocked rushed completion, real completion, leaderboard, teacher void, cross-school 404).

## Limits

Staff and admin dashboards are English-only. Arabic books are picture books only. No demo student data exists; the catalog is real. The OpenAI companion has not been run against the live API in this repository's CI. See [BOOK_SOURCES.md](BOOK_SOURCES.md).
