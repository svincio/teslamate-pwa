// ponytail: dev-only same-origin proxy, mirrors the prod nginx setup
// (static files + /api/v1 -> remote teslamateapi), no deps, no CORS needed.
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8000;
const ROOT = process.env.ROOT ? path.resolve(process.env.ROOT) : __dirname; // ROOT=dist serves the compiled build
// Host of your teslamateapi (HTTPS), e.g. TM_API_HOST=teslamate.example.com; TM_MOCK=1 serves invented data instead.
const API_HOST = process.env.TM_API_HOST;
const mock = process.env.TM_MOCK ? require('./demo/mock-api') : null;
if (!API_HOST && !mock) { console.error('Set TM_API_HOST to the host serving /api/v1 (teslamateapi), or TM_MOCK=1.'); process.exit(1); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.jsx': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

http.createServer((req, res) => {
  if (mock && req.url.startsWith('/api/v1/')) {
    const body = mock.handle(req.url);
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(body || { error: 'not found' }));
  }
  if (req.url.startsWith('/api/v1/')) {
    const upstream = https.request(
      { hostname: API_HOST, path: req.url, method: req.method, headers: { ...req.headers, host: API_HOST } },
      (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); }
    );
    req.pipe(upstream);
    return;
  }
  const pathname = decodeURIComponent(req.url.split('?')[0]); // a query string is not part of the file name
  const file = path.join(ROOT, pathname === '/' ? '/pwa.html' : pathname);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}/pwa.html`));
