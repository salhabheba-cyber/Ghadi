# Deployment

Ghadi is a standard Next.js app that needs a **Node.js ≥ 22.13** runtime. It cannot be statically exported because two routes (`/api/import/url`, `/api/ai/*`) and the dynamic detail pages run on the server.

## Any Node host

```bash
npm ci
npm run build
npm start            # listens on $PORT or 3000
```

## Vercel (or similar platforms)

Import the repository and keep the defaults (`npm run build`). Set the optional `GHADI_*` variables in the project settings if you want hosted AI. Note: the in-memory rate limiter is per serverless instance (see SECURITY.md); add platform-level rate limiting for public deployments. On Vercel set `GHADI_TRUST_PROXY=true` (the platform sets `X-Forwarded-For`), otherwise every visitor shares one rate-limit bucket.

## Container

A minimal approach is a Node 22 image that runs `npm ci && npm run build` and starts with `npm start`. (A Dockerfile is not included yet.)

## Configuration

Everything is optional. See `.env.example`.

| Variable                      | Purpose                           |
| ----------------------------- | --------------------------------- |
| `OPENAI_API_KEY`              | OpenAI key, secret, server only   |
| `OPENAI_MODEL`                | optional, default `gpt-4.1-mini`  |
| `OPENAI_BASE_URL`             | optional API base URL override    |
| `GHADI_HOSTED_AI_PROVIDER`    | `openai-compatible`               |
| `GHADI_HOSTED_AI_BASE_URL`    | e.g. `https://api.example.com/v1` |
| `GHADI_HOSTED_AI_API_KEY`     | secret, server only               |
| `GHADI_HOSTED_AI_MODEL`       | model name                        |
| `GHADI_URL_IMPORT_MAX_BYTES`  | max page size (default 2,000,000) |
| `GHADI_URL_IMPORT_TIMEOUT_MS` | fetch timeout (default 10,000)    |

Hosted AI is enabled when `OPENAI_API_KEY` is set, or when **all four** `GHADI_HOSTED_AI_*` variables are set (the generic set wins if both are present). Users must still choose the hosted generator and consent in Settings; Ghadi never sends documents to a cloud AI without that consent, and never switches from offline to cloud on its own. Use **Settings → Test connection** to verify the key with a real request.

On Railway: service → Variables → add `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`), then redeploy.

## School Reading platform (database)

The reading platform needs PostgreSQL. Without `DATABASE_URL` the study tools still work, but `/read`, `/join`, `/login`, `/school` and `/admin` report that the database is not configured.

| Variable            | Purpose                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string (secret, server only). Migrations and the book catalog apply on start. |
| `GHADI_SETUP_TOKEN` | 16+ characters you choose; creates the first platform administrator once. Secret, server only.      |
| `GHADI_TRUST_PROXY` | Set to `true` on Railway so per-IP rate limits and lockouts see the real client address.            |
| `OPENAI_API_KEY`    | Optional; enables the reading companion (child consent still required).                             |

On Railway: add a PostgreSQL service, reference its `DATABASE_URL` from the web service, set `GHADI_SETUP_TOKEN` and `GHADI_TRUST_PROXY=true` in the private variables, redeploy, then open `/admin` and follow the first-run steps. Book files (about 51 MB in `public/books`) ship with the image; the catalog rows are seeded idempotently at start. See [READING_PLATFORM.md](READING_PLATFORM.md).

## HTTPS

Serve over HTTPS in production. The app sends a per-request, nonce-based Content-Security-Policy from `src/proxy.ts` (no `unsafe-inline` or `unsafe-eval` scripts) plus HSTS, COOP/CORP and other headers from `next.config.ts`. Because the nonce changes on every request, pages are rendered on demand and cannot be statically exported or cached by a CDN as HTML.

## Reverse proxy and client IP

Rate limiting identifies clients by IP. `X-Forwarded-For` and `X-Real-IP` are ignored unless you set `GHADI_TRUST_PROXY=true`, because anyone can forge them when Ghadi is exposed directly. Behind one proxy that appends the client address, set `GHADI_TRUST_PROXY=true`. With more proxies in the chain also set `GHADI_TRUSTED_PROXY_HOPS` to their number. Make sure the outermost proxy overwrites or appends to the header rather than passing a client-supplied value through, and that clients cannot reach Ghadi except through it.

## Checklist for a public instance

- [ ] HTTPS and a reverse proxy that sets a trustworthy client IP header, with `GHADI_TRUST_PROXY` (and `GHADI_TRUSTED_PROXY_HOPS`) configured to match.
- [ ] Platform rate limiting in front of `/api/*`.
- [ ] Decide whether to enable hosted AI; if yes, set a spend cap at the provider.
- [ ] Tell users where their text goes when they use URL import or hosted AI ([PRIVACY.md](PRIVACY.md)).
- [ ] Re-run `npm audit` and keep dependencies updated.
