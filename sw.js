// Service worker — installability + speed. Gameplay needs both players
// online anyway, so this is NOT offline-first: network-first for the app
// shell (so deploys land fast despite GitHub Pages' 10-min cache),
// stale-while-revalidate for everything else.
// DEPLOY CHECKLIST: bump SW_VERSION *and* APP_VERSION (js/version.js) together.
const SW_VERSION = '2026.08.28-1';
const CACHE = `cpl-${SW_VERSION}`;

self.addEventListener('install', () => {
  // no precache list (no build step) — SWR fills the cache lazily
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // relays etc. — never touch

  const networkFirst = req.mode === 'navigate' || url.pathname.endsWith('/js/version.js');

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (networkFirst) {
      try {
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw new Error('offline and uncached');
      }
    }
    // stale-while-revalidate
    const hit = await cache.match(req);
    const refresh = fetch(req).then((fresh) => {
      cache.put(req, fresh.clone());
      return fresh;
    }).catch(() => null);
    return hit ?? (await refresh) ?? Response.error();
  })());
});
