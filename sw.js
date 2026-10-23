// TeslaMate PWA — Service Worker
// App files: network first with offline copy. CDN libraries: cache first. API: network only.

const CACHE = 'teslamate-pwa-v10';
const NET_TIMEOUT_MS = 3000; // slower than this (bad signal, VPN down): use the saved copy
const SHELL = [
  './pwa.html',
  './manifest.json',
  './config.js',
  './i18n.jsx',
  './api.jsx',
  './app.jsx',
  './ui/theme.jsx',
  './ui/kit.jsx',
  './screens/status.jsx',
  './screens/drives.jsx',
  './screens/charges.jsx',
  './screens/stats.jsx',
  './screens/more.jsx',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable.png',
  './assets/apple-touch-icon.png',
  // External libs we depend on:
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch((err) => {
      // Don't fail install if a single resource can't be cached (e.g. CORS)
      console.warn('Partial cache:', err);
    }))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Pass-through for TeslamateAPI calls — never cache user data, network only
  if (url.pathname.startsWith('/api/v1/') || url.pathname.includes('teslamateapi')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  if (e.request.method !== 'GET') return;

  // Versioned CDN libraries never change: cache first. Anything else cross-origin (map tiles): browser default.
  if (url.origin !== self.location.origin) {
    if (url.hostname !== 'unpkg.com') return;
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy))); }
      return r;
    })));
    return;
  }

  // The app's own files: network first, so an installed app always opens on the deployed version;
  // the saved copy only when offline or the server is slow. waitUntil keeps the copy being saved:
  // iOS stops an idle worker early (with stale-while-revalidate the update never landed).
  const net = fetch(e.request).then((r) => ({ r, copy: r.ok ? r.clone() : null }));
  e.waitUntil(net.then(({ copy }) => copy && caches.open(CACHE).then((c) => c.put(e.request, copy))).catch(() => {}));
  const slow = new Promise((res) => setTimeout(res, NET_TIMEOUT_MS));
  const saved = () => caches.match(e.request);
  e.respondWith(Promise.race([
    net.then((x) => x.r),
    slow.then(() => saved().then((hit) => hit || net.then((x) => x.r))),
  ]).catch(() => saved().then((hit) => hit || Response.error())));
});
