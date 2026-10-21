/* ═══════════════════════════════════════════════════════════════════════════
   XDrop (KIA DropAgentX) — Service Worker
   Cache-first for the app shell · NETWORK-ONLY for /api (authenticated owner
   data must never be persisted to disk cache) · bounded runtime cache.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const VERSION = 'xdrop-aurora-v3';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';
const RUNTIME_MAX_ENTRIES = 60;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/app.css',
  '/app.js',
  '/logo.svg',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fonts/Vazirmatn-Regular.woff2',
  '/fonts/Vazirmatn-Medium.woff2',
  '/fonts/Vazirmatn-SemiBold.woff2',
  '/fonts/Vazirmatn-Bold.woff2'
];

/* install — precache the shell */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

/* activate — purge old versions + stale shell entries, take control */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => caches.open(SHELL_CACHE))
      .then((shell) => shell.keys().then((reqs) => Promise.all(
        // Drop old cache-busting variants (?v=201 …) so the shell never serves
        // a stale asset while index.html already references ?v=202+.
        reqs.filter((r) => {
          const u = new URL(r.url);
          const v = u.searchParams.get('v');
          return v && !r.url.includes(VERSION.slice(-2));
        }).map((r) => shell.delete(r))
      )))
      .then(() => self.clients.claim())
  );
});

/** FIFO prune — keeps the runtime cache bounded under abuse. */
async function pruneRuntime() {
  const cache = await caches.open(RUNTIME_CACHE);
  const keys = await cache.keys();
  if (keys.length <= RUNTIME_MAX_ENTRIES) return;
  for (const key of keys.slice(0, keys.length - RUNTIME_MAX_ENTRIES)) {
    await cache.delete(key).catch(() => {});
  }
}

/* fetch — routing strategy */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  /* same-origin only */
  if (url.origin !== self.location.origin) return;

  /* never touch SSE streams or non-GET requests */
  if (req.method !== 'GET') return;
  if (url.pathname === '/api/v1/stream') return;

  /* API: NETWORK-ONLY — wallet/user/order data is authenticated owner content;
     persisting it to Cache Storage would leak it to anything that can read
     this origin's storage (offline fallback: clean 503 JSON). */
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(
          JSON.stringify({ ok: false, error: 'network' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  /* Public static assets (nation page etc.): stale-while-revalidate with a
     bounded cache. */
  if (url.pathname === '/nation.html' || url.pathname.startsWith('/nation-assets/')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone()).then(() => pruneRuntime()).catch(() => {});
          return res;
        }).catch(() => hit);
        return hit || network;
      })
    );
    return;
  }

  /* App shell: cache-first, refresh in background */
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
