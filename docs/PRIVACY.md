# Privacy

Ghadi is designed so that **your study material stays on your device unless you explicitly choose otherwise**.

## What is stored, and where

| Data                                                                                     | Where                                  | Notes                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------- |
| Documents, notes, quizzes, attempts, decks, cards, review history, collections, settings | Your browser's IndexedDB               | Never sent to a Ghadi server |
| Theme choice                                                                             | Browser `localStorage` (`ghadi-theme`) | Cosmetic only                |

There are no accounts, no analytics, no tracking cookies and no advertising. Ghadi does not phone home.

## When data leaves your device

Only in these cases, each triggered by something you do:

1. **Import from a web page / YouTube.** The address you enter is sent to the Ghadi server, which fetches the public page (or its caption track) and returns the text. The server does not store it. Page contents are not logged.
2. **OCR (opt-in).** English OCR uses an engine and language data served by Ghadi itself, so nothing is downloaded from a third party. For any other language, your browser downloads that language's data file from `cdn.jsdelivr.net` after Ghadi asks you; that host sees an ordinary download request from your IP address. **Your document is never uploaded**; recognition always runs locally.
3. **OpenAI (needs your permission each time you have not yet given it).** When you press a button that uses AI (write a study guide, make a quiz or flashcards, Explain simpler, check an answer) and allow it, the text involved is sent through the Ghadi server to OpenAI. If you choose "Read with OpenAI" for a photo or scanned PDF, the page images are sent too; Ghadi does not store them. Uploading a file never sends anything by itself. OpenAI API usage may cost money and is separate from a ChatGPT subscription. OpenAI's privacy policy then applies. Ghadi's server does not log document text, images, prompts or keys.

If none of these are used, no study content ever leaves the browser.

## School Reading platform (server-side data)

The reading platform is different from the study tools: it stores data on the server's PostgreSQL database because teachers and schools need it.

- **Stored:** display name, language, school and class, the hash and hint of the Student ID, optional PIN hash, reading position, bookmarks, active reading seconds, check results, completions, audit entries. No email, birth date, address or photo is collected from students.
- **Staff:** name, email, password hash.
- **Who sees it:** a student sees their own data; teachers see their classes; a school admin sees their school; the platform admin sees counts only. Other schools never see it.
- **Leaderboard:** private to the school; names follow the school's format and a child can hide theirs.
- **AI companion:** off by default; requires the child's consent. Only the selected passage and the book title are sent to OpenAI.
- Reading preferences and language stay in the browser's `localStorage`. Operators are responsible for local child-privacy law (for example parental consent rules) when deploying for schools.

## Your controls

- **Settings → Download full backup** exports everything as JSON.
- **Settings → Delete all local data** erases every table.
- Clearing your browser's site data for Ghadi's address also erases everything.

## For people who host Ghadi

You are responsible for your deployment's logging, the hosted-AI provider you choose, and informing your users. Standard web-server access logs (IP address, path) are produced by your platform, not by Ghadi. See [SECURITY.md](../SECURITY.md) for the rate limiter's behaviour.
