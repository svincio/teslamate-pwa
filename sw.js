// TeslaMate PWA — Service Worker
// Stale-while-revalidate for shell, network-first w/ offline fallback for API.

const CACHE = 'teslamate-pwa-v5';
const SHELL = [
  './pwa.html',
  './manifest.json',
  './config.js',
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

  // Stale-while-revalidate for everything else
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((r) => {
          if (r.ok && (e.request.method === 'GET')) {
            caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
          }
          return r;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
