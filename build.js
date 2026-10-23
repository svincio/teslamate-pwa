// Compiles the .jsx files into dist/ so browsers skip Babel at start-up (≈4x faster first screen on a slow CPU).
// The script list comes from pwa.html; the source tree stays as is (dev and tests use Babel in the browser).
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const OUT = path.join(__dirname, 'dist');
fs.rmSync(OUT, { recursive: true, force: true });
const put = (rel, data) => { fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true }); fs.writeFileSync(path.join(OUT, rel), data); };

let html = fs.readFileSync('pwa.html', 'utf8');
const jsx = [...html.matchAll(/<script type="text\/babel" src="([^"]+)">/g)].map(m => m[1]);
if (!jsx.length) throw new Error('pwa.html: no text/babel scripts found');
for (const f of jsx) put(f, babel.transformSync(fs.readFileSync(f, 'utf8'), { presets: ['@babel/preset-react'], filename: f, compact: false, comments: false }).code);

// defer: classic scripts in <head> would run before <div id="root"> exists (Babel's text/babel scripts were deferred too)
html = html.replace(/<script src="https:\/\/unpkg\.com\/@babel[^>]*><\/script>\n/, '')
  .replace(/<script type="text\/babel" src=/g, '<script defer src=');
if (/babel/i.test(html)) throw new Error('pwa.html still mentions Babel');
put('pwa.html', html);

const sw = fs.readFileSync('sw.js', 'utf8').replace(/^.*@babel\/standalone.*\n/m, '');
if (/babel/i.test(sw)) throw new Error('sw.js still mentions Babel');
put('sw.js', sw);

for (const f of ['config.js', 'manifest.json']) put(f, fs.readFileSync(f));
fs.cpSync('assets', path.join(OUT, 'assets'), { recursive: true });
console.log(`dist/: ${jsx.length} files compiled`);
