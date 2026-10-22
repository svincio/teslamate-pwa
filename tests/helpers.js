// Shared e2e test bootstrap: starts local-server.js on a free-ish port and
// launches the Mac's installed Chrome via puppeteer-core (no bundled browser
// download — ponytail: heavier `puppeteer` only if a machine has no Chrome).
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const PORT = 8123; // dedicated test port, avoids clashing with a dev server on 8000
const BASE_URL = `http://localhost:${PORT}/pwa.html`;

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function findChrome() {
  const fs = require('node:fs');
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('No local Chrome found — install Google Chrome or set CHROME_PATH.');
}

async function startServer() {
  const child = spawn('node', ['local-server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  // Wait for it to accept connections rather than assume a fixed boot time.

  await waitForServer();
  return child;
}

async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/pwa.html`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('local-server.js did not come up in time');
}

// The UI follows the browser language (config.js lang: "auto"): tests pin it, Italian by default.
async function withBrowser(fn, { lang = 'it-IT' } = {}) {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 900 });
    await page.evaluateOnNewDocument((l) => Object.defineProperty(navigator, 'language', { get: () => l }), lang);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

// Clicks the first *visible* element whose own trimmed text equals `label`
// (buttons, rows, links: any tag), so tests act like a user tapping a label.
async function clickText(page, label) {
  const clicked = await page.evaluate((l) => {
    const ownText = (n) => [...n.childNodes]
      .filter(c => c.nodeType === Node.TEXT_NODE)
      .map(c => c.textContent).join('').trim();
    const isVisible = (n) => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length);
    const el = [...document.querySelectorAll('body *')].find(n => ownText(n) === l && isVisible(n));
    if (el) { el.click(); return true; }
    return false;
  }, label);
  if (!clicked) throw new Error(`clickText: no visible element with text "${label}"`);
  await new Promise(r => setTimeout(r, 250));
}

module.exports = { PORT, BASE_URL, startServer, withBrowser, clickText };

