/**
 * Ghadi Service Worker
 *
 * Strategy:
 *  - Static assets (/_next/static/**, /ocr/**, /icons/**)  → cache-first
 *  - API routes (/api/**)                                  → network-only (never cached)
 *  - Navigation requests (HTML pages)                      → network-first with offline fallback
 *  - Everything else                                       → network-first
 */

const CACHE_VERSION = "ghadi-v4";
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const PAGE_CACHE    = `${CACHE_VERSION}-pages`;

const OFFLINE_URL = "/offline";

// Static routes to precache on install
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// ── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("ghadi-") && k !== STATIC_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Never cache API routes
  if (url.pathname.startsWith("/api/")) return;

  // Static assets: cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/ocr/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/theme-init.js" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigation requests: network-first with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Everything else: network-first
  event.respondWith(networkFirst(request, PAGE_CACHE));
});

// ── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Network error", { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached ?? new Response("Network error", { status: 503 });
  }
}

async function networkFirstWithOfflineFallback(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Return the precached offline page
    const offline = await caches.match(OFFLINE_URL);
    return offline ?? new Response("You are offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}
