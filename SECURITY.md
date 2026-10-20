# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting: on the repository page choose **Security → Report a vulnerability**. Include steps to reproduce, the affected version or commit, and the impact you expect. We aim to acknowledge reports within a few days. A machine-readable contact is served at `/.well-known/security.txt`.

Supported versions: the latest commit on the default branch (pre-1.0 software).

For the full analysis of assets, trust boundaries and threats, see [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Threat model in brief

Ghadi is local-first. The browser holds all user data in IndexedDB. The server has three small routes:

| Route                   | Risk                                                         | Mitigations                                                     |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| `POST /api/import/url`  | Server-side request forgery (SSRF), resource exhaustion      | See below                                                       |
| `POST /api/ai/generate` | Abuse as an open LLM proxy, secret leakage, prompt injection | See below                                                       |
| `GET /api/ai/status`    | Information disclosure                                       | Returns only `configured` and a model label; never keys or URLs |

### URL import (SSRF defences)

- Only `http:`/`https:`, only ports 80 and 443, no credentials in the URL.
- Rejects `localhost`, internal suffixes (`.local`, `.internal`, …), single-label hosts and numeric/obfuscated hosts.
- Resolves DNS itself, rejects any private, loopback, link-local, CGNAT, multicast, reserved, documentation, IPv4-mapped, NAT64, 6to4 and Teredo address, and **connects to the validated IP** (pinned `lookup`), which closes DNS-rebinding gaps between check and use.
- Follows redirects manually (max hops) and re-validates every hop.
- Caps response size and time, sends `Accept-Encoding: identity` (no decompression bombs), and allows only text/HTML/XML/JSON-style content types.
- Returned content is treated as plain text and rendered as React text nodes, never as HTML.

Test-only relaxation flags exist so unit tests can talk to a local server. They are parameters of internal functions and are **not reachable from any request data**.

### Hosted AI route

- API keys are read from server environment variables only. No `NEXT_PUBLIC_` variables exist. Keys are never logged or returned.
- The server builds the prompt itself from a fixed task list. Clients cannot send arbitrary prompts or choose a model.
- The user's explicit consent is required in each request (`consent: true`), in addition to the consent checkbox in Settings.
- Request body, input length and output are size-limited; model output is parsed and validated with Zod before it is returned.
- Prompts treat the document as untrusted data and instruct the model to ignore instructions inside it. This **reduces but cannot eliminate** prompt injection; model output is always shown as generated, never executed.

### Request hardening (both POST routes)

1. **CSRF, three layers.** A request is rejected (403) if `Sec-Fetch-Site` says it is cross-site, or if its `Origin` does not match the host the server was reached on (`x-forwarded-host` is honoured only when the proxy is trusted). It is rejected with 415 unless the body is `application/json`, which a cross-site HTML form cannot send without a CORS preflight that this server never approves.
2. **Rate limits:** 20 requests/minute for URL import, 10/minute for hosted AI, and a 4 KB request-body cap.
3. **Client identity.** `X-Forwarded-For` and `X-Real-IP` are **ignored by default**, because anyone can forge them on a directly exposed server. Set `GHADI_TRUST_PROXY=true` only behind a proxy you control; `GHADI_TRUSTED_PROXY_HOPS` selects the address added by the outermost trusted proxy. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
4. API responses are `Cache-Control: no-store`.

### Browser

- **Content-Security-Policy with a fresh nonce on every request** (generated in `src/proxy.ts`, applied to Next.js' own scripts). `script-src` is `'self'` plus the nonce and `'wasm-unsafe-eval'` (needed by the OCR engine's WebAssembly). There is **no `unsafe-inline` and no `unsafe-eval`** for scripts in production, and no third-party script host. The theme bootstrap is a same-origin file, not an inline script. Zod runs in `jitless` mode so it never probes `new Function`.
- `style-src` uses the nonce too; `style-src-attr 'unsafe-inline'` remains because React and Tailwind set inline `style=` attributes. That permits styling of elements, not script execution.
- `connect-src` allows `'self'`, `localhost`/`127.0.0.1` (the optional Ollama provider) and `cdn.jsdelivr.net` (OCR language **data** for non-English languages, after consent). `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
- Other headers on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Strict-Transport-Security` (2 years, includeSubDomains; only honoured over HTTPS), `X-Permitted-Cross-Domain-Policies: none`, `X-DNS-Prefetch-Control: off`. `X-Powered-By` is removed.
- No `dangerouslySetInnerHTML` is used on user content. Imported text is rendered as text; a browser test feeds hostile HTML/JS payloads through import, notes and the library and checks nothing executes.
- Files are validated by extension, size and file signature; backups are validated with Zod before restore; CSV exports neutralise spreadsheet formula injection; export file names are sanitised (no path traversal, hidden files or reserved Windows names).

### Supply chain and CI

Every push and pull request runs: lint, format, type-check, unit and component tests, the production build, and end-to-end tests (including axe accessibility and the security specs). Separate workflows run **CodeQL** (security-extended queries), **dependency review** on pull requests, a **`npm audit --omit=dev --audit-level=high`** gate, and a **gitleaks** secret scan. Dependabot proposes updates.

## Verification status

The following are covered by automated tests that were executed: header values and per-request nonce uniqueness, no inline script without a nonce, zero CSP violations across the main user flow in a real Chromium, XSS payload inertness, cross-site/415/private-address rejection, local-only OCR (no request leaves localhost), SSRF address classification, rate-limit identity rules, export file-name sanitising.

Not verified against real services in the build environment (no outbound DNS): live web-page and YouTube import, Ollama, hosted AI providers, and non-English OCR data download. These were tested with fakes and local servers only. CodeQL, dependency review and gitleaks workflows are defined but have not run until the repository is on GitHub.

## Known limitations and findings

We prefer stating these over hiding them.

1. **Rate limiting is in memory and per instance.** On a multi-instance or serverless deployment each instance counts separately, and a restart resets the counters. Use an edge/WAF or shared store for real protection. Without `GHADI_TRUST_PROXY`, all clients behind a proxy share one bucket.
2. **`npm audit` findings (checked when this was written):**
   - _Production, 3 moderate:_ `mammoth` → `argparse` → `sprintf-js` (denial of service through unbounded precision specifiers in a formatting helper). No patched `sprintf-js` exists and the suggested "fix" is a downgrade of `mammoth` to 0.3.x, so it was **not** applied. We searched the built client and server bundles and the vulnerable code is not present in them; Mammoth only processes files the user chooses locally. The CI gate fails only on high/critical advisories in production dependencies.
   - _Development only, 5 high:_ `eslint-config-next` → … → `braces` (regex exhaustion on crafted glob patterns). No patched version exists; this affects the lint toolchain, not the shipped app.
3. **`style-src-attr 'unsafe-inline'`** remains (see above); it does not allow script execution.
4. **Non-English OCR** downloads language data from jsDelivr after consent. A compromised CDN could serve bad data, which could only cause wrong text or a crash inside the worker; it is not executable code, and it is not loaded for English.
5. **Dynamic rendering.** The per-request nonce means pages are server-rendered on demand and cannot be fully static-exported.
6. **YouTube import** parses an undocumented public page structure. It performs only an ordinary page fetch plus a caption-track fetch, never audio download.
7. **Local data is not encrypted at rest** in IndexedDB; it is protected by your operating-system account and browser profile. Backups are plain JSON. Anyone with access to your browser profile can read your study data.
8. **Origin trust for Ollama:** to use Ollama you must allow this site's origin in `OLLAMA_ORIGINS`. Only allow origins you trust.

## Secrets

`.env`, `.env.*` (except `.env.example`) are git-ignored. The repository contains no real keys; `.env.example` holds empty placeholders. If you find a secret in history, report it privately.
