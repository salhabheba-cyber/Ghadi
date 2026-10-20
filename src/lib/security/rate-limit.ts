/**
 * Minimal in-memory sliding-window rate limiter for API routes.
 * Limitations (documented in SECURITY.md): state is per server instance, so it does not coordinate
 * across serverless instances or restarts. It is a safety net, not a substitute for platform-level limits.
 */

import { isIP } from "node:net";

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: boolean; retryAfterSec: number } {
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) {
      if (b.hits.every((t) => now - t > windowMs)) buckets.delete(k);
    }
    if (buckets.size > MAX_KEYS) buckets.clear();
  }
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    buckets.set(key, bucket);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Identifies the caller for rate limiting.
 *
 * Forwarded headers are attacker-controlled unless a proxy you operate overwrites them, so they are
 * ignored by default and every caller shares one bucket (safe against spoofing, but one noisy client
 * can then exhaust the limit for everybody). Set GHADI_TRUST_PROXY=true only when Ghadi runs behind a
 * proxy/platform that sets X-Forwarded-For (Vercel, nginx, Cloudflare...). GHADI_TRUSTED_PROXY_HOPS
 * (default 1) is how many proxies append to the header; the address added by the outermost trusted
 * proxy is used, so addresses a client prepends itself are ignored.
 */
export function clientKey(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.GHADI_TRUST_PROXY !== "true") return "shared";
  const hopsRaw = Number(env.GHADI_TRUSTED_PROXY_HOPS);
  const hops = Number.isInteger(hopsRaw) && hopsRaw >= 1 && hopsRaw <= 10 ? hopsRaw : 1;
  const parts = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const candidate = parts.length >= hops ? parts[parts.length - hops] : undefined;
  if (candidate && isIP(candidate) !== 0) return candidate;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && isIP(real) !== 0) return real;
  return "shared";
}

export function __resetRateLimitForTests(): void {
  buckets.clear();
}
