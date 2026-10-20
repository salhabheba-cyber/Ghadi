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
3. **Ollama (opt-in).** Document text is sent to the address you configured (default `http://localhost:11434`, i.e. your own computer). If you point it at another machine, that machine receives your text.
4. **Hosted AI (opt-in, needs consent).** If the server operator configured a provider and you tick the consent box, the text of the document you generate from is sent through the Ghadi server to that provider. Their privacy policy then applies. Ghadi's server does not log document text, prompts or keys.

If none of these are used, no study content ever leaves the browser.

## Your controls

- **Settings → Download full backup** exports everything as JSON.
- **Settings → Delete all local data** erases every table.
- Clearing your browser's site data for Ghadi's address also erases everything.

## For people who host Ghadi

You are responsible for your deployment's logging, the hosted-AI provider you choose, and informing your users. Standard web-server access logs (IP address, path) are produced by your platform, not by Ghadi. See [SECURITY.md](../SECURITY.md) for the rate limiter's behaviour.
