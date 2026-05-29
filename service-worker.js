// Peptide Reference — Service Worker
// Strategy:
//   - Precache the app shell on install.
//   - Same-origin HTML: network-first (fall back to cache offline).
//   - Same-origin static (icons, manifest, JSON): cache-first.
//   - Google Fonts + cdnjs html2canvas: stale-while-revalidate.
//   - Scraper API (peptide-app-scraper.workers.dev): always pass through, never cached.

// Bump on every release so the old cache is evicted on activate.
const CACHE_NAME = 'peptide-app-v1.16.0';
const SCRAPER_HOST = 'peptide-app-scraper.witherford-m.workers.dev';

const PRECACHE_URLS = [
  './',
  'peptide_app_unencrypted.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch((err) => {
        // Don't block install if one optional asset is missing
        console.warn('[SW] precache partial failure', err);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isHtmlRequest(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html');
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(req) || await cache.match('peptide_app_unencrypted.html');
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh && fresh.ok) cache.put(req, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || networkPromise;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Never cache or intercept scraper API calls — always live.
  if (url.hostname === SCRAPER_HOST) return;

  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    if (isHtmlRequest(req)) {
      event.respondWith(networkFirst(req));
    } else {
      event.respondWith(cacheFirst(req));
    }
    return;
  }

  // Cross-origin: only handle the known CDN/font dependencies with SWR.
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdnjs.cloudflare.com'
  ) {
    event.respondWith(staleWhileRevalidate(req));
  }
});
