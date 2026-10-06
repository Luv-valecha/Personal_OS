/* Service worker — deliberately conservative.
 * CACHED:   static build assets (/_next/static), icons, and one offline fallback page.
 * NEVER CACHED: HTML pages, API responses, server actions — they contain private data and need the network.
 * Offline behaviour: the installed app opens and shows the offline page; previously loaded JS/CSS stays warm. */
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => { if (e.data === "clear") caches.delete(STATIC); });

self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (req.mode === "navigate") { // network only; offline → fallback page
    e.respondWith(fetch(req).catch(() => caches.match("/offline")));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) { // immutable assets: cache-first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(STATIC).then((c) => c.put(req, copy)); } return res; })));
  }
});
