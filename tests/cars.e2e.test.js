// Two cars in TeslaMate (demo data): each device can pick which one it shows.
'use strict';
process.env.TM_MOCK = '1';
process.env.TM_MOCK_CARS = '2';
process.env.TEST_PORT = '8125'; // own server: test files run in parallel
const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_URL, startServer, withBrowser } = require('./helpers');

let serverProcess;
test.before(async () => { serverProcess = await startServer(); });
test.after(() => { serverProcess?.kill(); });

const text = (page) => page.evaluate(() => document.body.innerText);
const tab = async (page, l) => { await page.evaluate((x) => [...document.querySelectorAll('nav button')].find(b => b.innerText.trim() === x).click(), l); await new Promise(r => setTimeout(r, 300)); };
const press = (page, label) => page.evaluate((l) => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === l).click(), label);
const leaveTo = (page, label) => Promise.all([ // leaving Altro applies the choice
  page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
  page.evaluate((l) => setTimeout(() => [...document.querySelectorAll('nav button')].find(b => b.innerText.trim() === l).click(), 0), label),
]);
// Polls with plain evaluates: waitForFunction can hang when the app reloads itself meanwhile.
async function ready(page, name) {
  for (const end = Date.now() + 60000; Date.now() < end; await new Promise(r => setTimeout(r, 300))) {
    const ok = await page.evaluate((n) => document.body.innerText.includes(n) && (window.TM_DRIVES || []).length > 0, name).catch(() => false);
    if (ok) return;
  }
  throw new Error(`"${name}" not shown`);
}

test('car chosen on this device: its data, its cache, back to the default', async () => {
  await withBrowser(async (page) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await ready(page, 'Silver Arrow');                         // config.js carId: 1
    const firstOdo = await page.evaluate(() => window.TM_CAR.odometer);
    await tab(page, 'Altro');
    assert.match(await text(page), /Auto da mostrare/);
    await press(page, 'Red Comet');
    await leaveTo(page, 'Stato');
    await ready(page, 'Red Comet');
    assert.match(await text(page), /Model Y/);
    assert.notEqual(await page.evaluate(() => window.TM_CAR.odometer), firstOdo, 'the other car\'s data');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 'Red Comet');                            // the choice survives a restart
    await tab(page, 'Altro');
    await press(page, 'Predefinita');
    await leaveTo(page, 'Stato');
    await ready(page, 'Silver Arrow');
  });
});

test('a chosen car that no longer exists is forgotten', async () => {
  await withBrowser(async (page) => {
    await page.evaluateOnNewDocument(() => { if (!sessionStorage.seeded) { localStorage.setItem('tm.pwa.prefs', '{"car":"9"}'); sessionStorage.seeded = 1; } });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await ready(page, 'Silver Arrow');
    assert.equal(await page.evaluate(() => localStorage.getItem('tm.pwa.prefs')), '{}');
  });
});
