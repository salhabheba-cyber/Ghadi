# Threat model

This document explains what Ghadi protects, who might attack it, and which controls apply. The reporting policy and the list of known limitations are in [SECURITY.md](../SECURITY.md).

## Assets

| Asset                                       | Where it lives               | Why it matters                                 |
| ------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| Study documents, notes, quizzes, cards      | Browser IndexedDB            | Personal, possibly copyrighted or confidential |
| Backups and exports                         | Files the user saves         | Plain JSON/Markdown/CSV                        |
| Hosted-AI API key (optional)                | Server environment variables | Spend and abuse                                |
| Server network position (URL import server) | Host running Ghadi           | Pivot into internal networks                   |

## Trust boundaries

1. **Browser ↔ Ghadi server.** The server is trusted by the user only for the three API routes. Study data never goes to it unless the user picks hosted AI or enters a URL.
2. **Ghadi server ↔ the internet.** Fetching arbitrary URLs is the riskiest thing the server does.
3. **Ghadi server ↔ AI provider.** Only when the operator configures a provider and the user consents.
4. **Browser ↔ user-selected files.** Files are untrusted input parsed in the browser.
5. **Browser ↔ OpenAI via Ghadi server.** The key never leaves the server; every request needs explicit consent in the body, is size-capped, rate-limited and Zod-validated.

## Threats and controls

| #   | Threat                                                      | Controls                                                                                                                                                                   | Residual risk                                                       |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | SSRF through URL import (internal hosts, cloud metadata)    | Scheme/port/credential rules; blocked names; own DNS resolution; private-range blocklist incl. IPv6 transitions; IP pinning; manual redirect re-validation; size/time caps | Zero-day parser or DNS edge cases                                   |
| 2   | Cross-site request forgery against API routes               | `Sec-Fetch-Site`, `Origin` vs host, JSON-only bodies (415), no cookies or ambient credentials                                                                              | Very old browsers lacking `Sec-Fetch-*` still hit the Origin check  |
| 3   | Spoofed client IP to evade rate limits                      | Forwarded headers ignored unless `GHADI_TRUST_PROXY`; hop count; per-route limits                                                                                          | Per-instance counters; use a WAF for public hosting                 |
| 4   | Cross-site scripting through imported text, titles, notes   | Everything rendered as React text; nonce CSP with no `unsafe-inline`/`unsafe-eval`; browser test with hostile payloads                                                     | A future bug introducing `dangerouslySetInnerHTML`; lint and review |
| 5   | Injected third-party script                                 | `script-src 'self'` + nonce; no third-party script hosts; `object-src 'none'`; `base-uri 'self'`                                                                           | A compromised dependency in the build                               |
| 6   | Clickjacking                                                | `frame-ancestors 'none'`, `X-Frame-Options: DENY`                                                                                                                          | None known                                                          |
| 7   | Malicious document files (zip bombs, malformed PDFs/Office) | Extension + size + magic-byte validation; size and page caps; parsing in the user's own browser                                                                            | Parser bugs crash the tab at worst                                  |
| 8   | Malicious backup file                                       | Size cap; schema version check; Zod validation; single transaction with rollback                                                                                           | Valid-but-large data can fill storage                               |
| 9   | Spreadsheet formula injection in CSV export                 | Cells starting with `=`, `+`, `-`, `@` are neutralised                                                                                                                     | Other tools with unusual formula syntax                             |
| 10  | Path tricks in exported file names                          | `safeFileName` removes separators, leading dots, reserved Windows names; length cap                                                                                        | None known                                                          |
| 11  | Open LLM proxy / secret leakage via hosted AI               | Fixed server-built prompts, no client model choice, per-request consent, size limits, key only in server env, never logged or returned                                     | Prompt injection can still skew generated text                      |
| 12  | Prompt injection in imported documents                      | Document treated as data in prompts; output validated by schema and shown as generated, never executed                                                                     | Cannot be eliminated                                                |
| 13  | Data exfiltration by OCR dependencies                       | English OCR is bundled and served from the same origin; a test asserts no request leaves localhost; other languages load data only (not code) after consent                | CDN availability/integrity for non-English data                     |
| 14  | Vulnerable dependencies                                     | CodeQL, dependency review, production `npm audit` gate, Dependabot, lockfile                                                                                               | Unpatched upstream advisories (documented)                          |
| 15  | Committed secrets                                           | `.gitignore`, empty `.env.example`, gitleaks in CI                                                                                                                         | Secrets pasted into issues or logs by users                         |
| 16  | Local data theft from the device                            | Out of scope: relies on OS account and browser profile protection; no encryption at rest                                                                                   | Anyone with profile access can read data                            |

## Out of scope

- A compromised user device, browser or browser extensions.
- A malicious server operator: the operator can serve any code. Self-host to avoid this.
- Denial of service at network level; use a CDN/WAF for public deployments.

## Review triggers

Revisit this document when adding a new API route, a new outbound network call, a new third-party script, `dangerouslySetInnerHTML` or any use of `eval`/`new Function`, or sync/encryption features.
