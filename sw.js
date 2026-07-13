/* Sthalam service worker — app shell + map tile caching */
const SHELL = "sthalam-shell-v1";
const TILES = "sthalam-tiles-v1";
const TILE_LIMIT = 800; // ~ enough for a city area at several zoom levels

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function trimCache(name, limit) {
  const c = await caches.open(name);
  const keys = await c.keys();
  if (keys.length > limit) {
    // delete oldest ~10% (FIFO order of keys())
    const n = Math.ceil(limit * 0.1);
    for (let i = 0; i < n; i++) await c.delete(keys[i]);
  }
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Map tiles: cache-first, populate as user browses
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    e.respondWith(
      caches.open(TILES).then(async c => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        try {
          const res = await fetch(e.request);
          if (res.ok) {
            c.put(e.request, res.clone());
            trimCache(TILES, TILE_LIMIT);
          }
          return res;
        } catch (_) {
          return new Response("", { status: 503 });
        }
      })
    );
    return;
  }

  // App shell + CDN assets: cache-first, network fallback (and cache new)
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res.ok && (url.origin === location.origin || url.hostname === "cdnjs.cloudflare.com")) {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
