// Imperial units and another currency, on the demo data: teslamateapi converts to mi/°F
// when TeslaMate is set so, the app only switches labels; the currency comes from config.js.
'use strict';
process.env.TM_MOCK = '1';
process.env.TM_MOCK_UNITS = 'imperial';
process.env.TEST_PORT = '8124'; // own server: test files run in parallel
const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_URL, startServer, withBrowser } = require('./helpers');

let serverProcess;
test.before(async () => { serverProcess = await startServer(); });
test.after(() => { serverProcess?.kill(); });

const CONFIG = 'window.TMConfig = { apiBase: "/api/v1", carId: 1, refreshSeconds: 0, currency: "USD", lang: "en" };';

test('miles, °F and USD: labels follow TeslaMate units and config.js currency', async () => {
  await withBrowser(async (page) => {
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().endsWith('/config.js')
      ? r.respond({ status: 200, contentType: 'text/javascript', body: CONFIG }) : r.continue()));
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window.TM_DRIVES || []).length > 0 && document.body.innerText.includes('Odometer'), { timeout: 60000 });
    const tab = async (l) => { await page.evaluate((x) => [...document.querySelectorAll('nav button')].find(b => b.innerText.trim() === x).click(), l); await new Promise(r => setTimeout(r, 300)); };
    const text = async () => page.evaluate(() => document.body.innerText);

    const status = await text();
    assert.match(status, /\d\s*mi\s*\n\s*Odometer/);
    assert.match(status, /\$\d/, 'month cost in dollars');
    assert.match(status, /42\s*psi\s*\n\s*Front left/, 'tyres in psi');
    await tab('Trips');
    const trips = await text();
    assert.match(trips, /mph/); assert.match(trips, /avg\. Wh\/mi/);
    const eff = await page.evaluate(() => window.TM_DRIVES.filter(d => d.distance > 3).map(d => d.eff));
    const med = eff.sort((a, b) => a - b)[Math.floor(eff.length / 2)];
    assert.ok(med > 180 && med < 400, `Wh/mi from energy/distance, not teslamateapi's consumption_net (median ${med})`);
    await tab('Charges');
    const charges = await text();
    assert.match(charges, /\$\d/);
    await tab('Statistics');
    const stats = await text();
    assert.match(stats, /Wh\/mi per °F/);
    assert.match(stats, /Wh\/mi per mph/);
    const all = [status, trips, charges, stats].join('\n');
    assert.ok(!/\bkm\b|km\/h|€/.test(all), 'no km, km/h or € left');
  }, { lang: 'en-US' });
});
