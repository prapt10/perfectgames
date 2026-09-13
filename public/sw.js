/* ============================================================
 * Perfect Games — Service Worker
 * Enables "Install app" / Add-to-Home-Screen (PWA) support.
 *
 * Strategy: network-first for everything, with a cache fallback
 * so the app still opens (and shows a friendly offline screen)
 * when there's no connection. We deliberately do NOT cache
 * aggressively because gameplay is live over WebSocket and the
 * app ships frequent JS/CSS updates — a stale cached script could
 * break a match. The cache here only exists as a safety net for
 * offline/flaky-network loads, never as the primary source.
 *
 * WebSocket connections (/ws) are never intercepted — fetch only
 * ever sees http(s) requests, so realtime play is unaffected.
 * ============================================================ */

const CACHE_VERSION = 'pg-v1';
const OFFLINE_URL = '/offline.html';

// Small shell so the hub + offline page can render without a network hit.
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/shared/icons.js',
  '/shared/sound.js',
  '/shared/vendor/qrcode.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle same-origin GET http(s) requests. Leave WebSocket
  // upgrades, POSTs, cross-origin, etc. completely alone.
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Refresh the cache in the background so offline fallback stays reasonably fresh.
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          if (res.ok) cache.put(req, copy).catch(() => {});
        });
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
        }
        return Response.error();
      })
  );
});
