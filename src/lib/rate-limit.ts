/** Small in-memory fixed-window limiter. Single-instance only — replace with a shared store (e.g. Redis) when scaling out. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}

export function _resetRateLimits() {
  buckets.clear();
}
