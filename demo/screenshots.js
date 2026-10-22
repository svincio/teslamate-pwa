// README screenshots from the invented data: `node demo/screenshots.js` → docs/screenshots/*.png
// iPhone-sized viewport, English UI, light theme (plus one dark).
'use strict';
process.env.TM_MOCK = '1';
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { BASE_URL, findChrome, startServer } = require('../tests/helpers');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
  try {
    for (const scheme of ['light', 'dark']) {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'language', { get: () => 'en-US' }));
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (window.TM_DRIVES || []).length > 0 && document.body.innerText.includes('Odometer'), { timeout: 60000 });

      const settle = async () => { await page.waitForNetworkIdle({ idleTime: 800, timeout: 30000 }).catch(() => {}); await sleep(400); };
      const shot = async (name) => { await settle(); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('saved', name); };
      const tab = (label) => page.evaluate((l) => [...document.querySelectorAll('nav button')].find(b => b.innerText.trim() === l).click(), label);
      const back = () => page.evaluate(() => document.querySelector('button[aria-label^="Back to"]').click());

      if (scheme === 'dark') { await shot('status-dark'); await page.close(); continue; }

      await shot('status');
      await tab('Trips'); await shot('trips');
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Year').click());
      await sleep(300);
      // A trip out of town makes a nicer map; fall back to the latest one.
      await page.evaluate(() => {
        const cards = [...document.querySelectorAll('[data-drive-id]')];
        (cards.find(c => /Home → (Piazza Cavour|Città Alta)/.test(c.innerText)) || cards[0]).click();
      });
      await page.waitForSelector('.leaflet-tile-loaded', { timeout: 30000 });
      await shot('trip-detail');
      await back();
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Month').click());
      await tab('Charges'); await shot('charges');
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'DC · Supercharger').click());
      await sleep(300);
      await page.evaluate(() => document.querySelector('[data-charge-id]').click());
      await page.waitForSelector('svg[aria-label^="Power and battery level"]', { timeout: 30000 });
      await shot('charge-detail');
      await back();
      await tab('Statistics'); await shot('statistics');
      await tab('More');
      await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].find(b => b.innerText.startsWith('Battery health')).click());
      await shot('battery-health');
      await page.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
