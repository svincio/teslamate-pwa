// E2E UI tests — real local-server.js + real Chrome + the real remote TeslamateAPI
// (no mocks). Requires TM_API_HOST pointing to a reachable teslamateapi with real data.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_URL, startServer, withBrowser, clickText } = require('./helpers');

let serverProcess;
test.before(async () => { serverProcess = await startServer(); });
test.after(() => { serverProcess?.kill(); });

const bodyText = (page) => page.evaluate(() => document.body.innerText);

// The dashboard appears as soon as /status lands (or from the local cache).
async function gotoAppReady(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('Batteria'), { timeout: 30000 });
}

// Drives/charges load in the background after the dashboard; filter tests are
// meaningless until the history has actually landed.
async function waitHistory(page) {
  await page.waitForFunction(
    () => (window.TM_DRIVES || []).length > 0 && (window.TM_CHARGES || []).length > 0,
    { timeout: 120000 }
  );
}

const tab = (page, label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll('nav button')].find(x => x.innerText.trim() === l);
  b.click();
}, label).then(() => new Promise(r => setTimeout(r, 300)));

test('app boots to live data, no mock leftovers, no NaN/undefined', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    const text = await bodyText(page);
    assert.ok(!/[Dd]emo\b|\(mock\)/.test(text), 'no demo/mock wording');
    assert.ok(!/undefined|NaN/.test(text), 'no undefined/NaN leaking into rendered text');
    assert.match(text, /\d{1,3}\s*%/, 'expected a battery percentage on the home screen');
    assert.ok(!/\b0\s*km\s*\n?\s*Autonomia/.test(text), 'range must not be 0 km');
  });
});

test('bottom tab bar switches between the 5 screens', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await tab(page, 'Viaggi');      assert.match(await bodyText(page), /Wh\/km medi/);
    await tab(page, 'Ricariche');   assert.match(await bodyText(page), /Spesa · /);
    await tab(page, 'Statistiche'); assert.match(await bodyText(page), /Distanza totale/);
    await tab(page, 'Altro');
    const more = await bodyText(page);
    assert.match(more, /Salute batteria/);
    assert.match(more, /Luoghi frequenti/);
    assert.match(more, /impostazioni/i);
    await tab(page, 'Stato');       assert.match(await bodyText(page), /Odometro/);
  });
});

test('Viaggi period control actually filters', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await tab(page, 'Viaggi');
    const trips = () => page.evaluate(() => {
      const m = document.body.innerText.match(/([\d.]+)\s*\n\s*viaggi/);
      return m ? Number(m[1].replace(/\./g, '')) : null;
    });
    await clickText(page, 'Anno');
    const year = await trips();
    await clickText(page, 'Settimana');
    const week = await trips();
    assert.ok(year > 0, 'a year should contain drives');
    assert.ok(week <= year, `Settimana (${week}) should not exceed Anno (${year})`);
  });
});

const periodLabel = (page) => page.$eval('[data-period-label]', e => e.innerText.trim());
const clickAria = (page, label) => page.$eval(`button[aria-label="${label}"]`, b => b.click());

test('Viaggi ‹ › navigates periods, older than 12 months fetched on demand', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await tab(page, 'Viaggi');
    await clickText(page, 'Anno');
    const y = new Date().getFullYear();
    assert.equal(await periodLabel(page), String(y));
    assert.ok(await page.$eval('button[aria-label="Periodo successivo"]', b => b.disabled), '› disabled on the current period');
    await clickAria(page, 'Periodo precedente');
    await clickAria(page, 'Periodo precedente');
    assert.equal(await periodLabel(page), String(y - 2));
    // two years back is outside the in-memory window: cards come from a dedicated /drives?startDate&endDate call
    await page.waitForFunction(() => document.querySelectorAll('[data-drive-id]').length > 0, { timeout: 120000 });
    const years = await page.$$eval('[data-drive-id]', els => els.length);
    assert.ok(years > 0);
    const head = await page.$$eval('h2', els => els.map(e => e.innerText).join('|'));
    assert.match(head, new RegExp(String(y - 2)), 'old day headers carry the year');
    await page.$eval('[data-period-label]', b => b.click());
    assert.equal(await periodLabel(page), String(y), 'tapping the label returns to the current period');
  });
});

test('Ricariche period filters spend, list and shows the year on old cards', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await tab(page, 'Ricariche');
    const count = () => page.evaluate(() => {
      const m = document.body.innerText.match(/([\d.]+) ricariche/);
      return m ? Number(m[1].replace(/\./g, '')) : null;
    });
    await clickText(page, 'Tutto');
    const all = await count();
    await clickText(page, 'Mese');
    await clickAria(page, 'Periodo precedente');
    const prev = await count();
    assert.ok(all > prev, `Tutto (${all}) > previous month (${prev})`);
    await clickText(page, 'Anno');
    await clickAria(page, 'Periodo precedente');
    const y = new Date().getFullYear() - 1;
    await page.waitForFunction(() => document.querySelectorAll('[data-charge-id]').length > 0, { timeout: 30000 });
    const cards = await page.$$eval('[data-charge-id]', els => els.slice(0, 5).map(e => e.innerText));
    for (const c of cards) assert.match(c, new RegExp(String(y)), `last year's card without year: ${c.slice(0, 80)}`);
  });
});

test('Ricariche DC filter shows only DC sessions', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await tab(page, 'Ricariche');
    await clickText(page, 'DC · Supercharger');
    const cards = await page.$$eval('[data-charge-id]', els => els.map(e => e.innerText));
    for (const c of cards) assert.match(c, /· DC/, `non-DC card in DC filter: ${c.slice(0, 60)}`);
    await clickText(page, 'Casa · AC');
    const ac = await page.$$eval('[data-charge-id]', els => els.map(e => e.innerText));
    assert.ok(ac.length > 0, 'there should be AC charges');
    for (const c of ac) assert.match(c, /· AC/);
  });
});

test('filters survive tab switches and a data refresh', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await tab(page, 'Viaggi');
    await clickText(page, 'Settimana');
    await tab(page, 'Altro');
    await clickText(page, 'Aggiorna ora');
    await page.waitForFunction(() => !document.body.innerText.includes('in corso…'), { timeout: 120000 });
    await tab(page, 'Viaggi');
    const pressed = await page.evaluate(() =>
      [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Settimana').getAttribute('aria-pressed'));
    assert.equal(pressed, 'true', 'Settimana should still be selected');
  });
});

test('Salute batteria shows real SoH, no NaN', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await tab(page, 'Altro');
    await clickText(page, 'Salute batteria');
    // /battery-health can take minutes when the server cache is cold: the page fills in when it lands
    await page.waitForFunction(() => /SoH stimato[\s\S]*\d+,\d\s*%/.test(document.body.innerText) || /\d+,\d\s*%[\s\S]*SoH stimato/.test(document.body.innerText), { timeout: 300000 });
    const text = await bodyText(page);
    assert.match(text, /SoH stimato/);
    assert.match(text, /\d+,\d\s*%/, 'SoH value');
    assert.ok(!/NaN/.test(text));
  });
});

test('tapping a drive opens that drive (not always the latest) with an OSM map', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await tab(page, 'Viaggi');
    const expected = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-drive-id]')];
      const row = rows[Math.min(3, rows.length - 1)];
      const d = window.TM_DRIVES.find(x => x.id === Number(row.dataset.driveId));
      row.click();
      return `${d.from} → ${d.to}`;
    });
    // The list stays mounted under the detail (keeps its scroll), so look at every h1.
    await page.waitForFunction((t) => [...document.querySelectorAll('h1')].some(h => h.innerText === t), { timeout: 5000 }, expected);
    // Map tiles come from OSM (CARTO now needs an API key and serves a watermark tile).
    await page.waitForSelector('img.leaflet-tile[src*="tile.openstreetmap.org"]', { timeout: 30000 });
  });
});

test('opening a charge loads its charge curve', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await tab(page, 'Ricariche');
    await page.evaluate(() => document.querySelector('[data-charge-id]').click());
    await page.waitForFunction(() => document.querySelector('svg[aria-label^="Potenza e livello batteria"]')
      || /Nessun dato di dettaglio/.test(document.body.innerText), { timeout: 60000 });
    assert.match(await bodyText(page), /Efficienza|Curva di ricarica/);
  });
});

test('theme follows the system setting (dark)', async () => {
  await withBrowser(async (page) => {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await gotoAppReady(page);
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('section[aria-label="Auto"]')).backgroundColor);
    assert.equal(bg, 'rgb(28, 28, 30)');
  });
});

test('reopening the app shows the cached data even if the API is unreachable', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await page.waitForFunction(() => {
      try { return !!JSON.parse(localStorage.getItem('tm.pwa.cache.v2')).history; } catch { return false; }
    }, { timeout: 180000 });
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().includes('/api/v1/') ? r.abort() : r.continue()));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('Batteria'), { timeout: 15000 });
    assert.ok(await page.evaluate(() => window.TM_DRIVES.length > 0), 'cached drives should be shown');
  });
});

test('maps open full screen, interactive (drag/pinch), and close', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await page.waitForSelector('[data-map-expand]', { timeout: 60000 }); // Stato: car position
    await page.$eval('[data-map-expand]', b => b.click());
    await page.waitForSelector('[role=dialog] .leaflet-container', { timeout: 10000 });
    const r = await page.$eval('[role=dialog]', e => { const b = e.getBoundingClientRect(); return [b.width, b.height, innerWidth, innerHeight]; });
    assert.equal(r[0], r[2]); assert.equal(r[1], r[3]);
    // Leaflet adds this class only when dragging is enabled
    assert.ok(await page.$('[role=dialog] .leaflet-container.leaflet-grab'), 'full-screen map should be draggable');
    assert.ok(!(await page.$('section:not([role=dialog] section) .leaflet-grab')), 'small maps stay static');
    await page.$eval('[data-map-close]', b => b.click());
    assert.equal(await page.$('[role=dialog]'), null);
  });
});

test('drive section zoom: sliders pick a stretch, numbers and map follow', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    // a drive of 10+ km from the in-memory year
    const id = await page.evaluate(() => (window.TM_DRIVES.find(d => (d.distance || d.km) > 10) || {}).id);
    assert.ok(id, 'need a 10+ km drive');
    await tab(page, 'Viaggi');
    await clickText(page, 'Anno');
    await page.evaluate(async (id) => {
      for (let i = 0; i < 40 && !document.querySelector(`[data-drive-id="${id}"]`); i++) {
        [...document.querySelectorAll('button')].find(b => /^Mostra altri/.test(b.innerText)).click();
        await new Promise(r => setTimeout(r, 100));
      }
      document.querySelector(`[data-drive-id="${id}"]`).click();
    }, id);
    await page.waitForSelector('input[aria-label="Tratto del viaggio: inizio"]', { timeout: 60000 });

    // whole trace ≈ the drive TeslaMate recorded (odometer based)
    const whole = await page.evaluate((id) => {
      const d = window.TM_DRIVES.find(x => x.id === id);
      const s = window.sectionStats(window.__driveTraceCache[id]);
      return { km: s.km, ref: d.distance || d.km, min: s.min, refMin: d.durMin };
    }, id);
    assert.ok(Math.abs(whole.km - whole.ref) / whole.ref < 0.05, `trace km ${whole.km} vs drive ${whole.ref}`);
    assert.ok(Math.abs(whole.min - whole.refMin) <= 2, `trace min ${whole.min} vs drive ${whole.refMin}`);

    const setRange = (label, frac) => page.$eval(`input[aria-label="Tratto del viaggio: ${label}"]`, (el, f) => {
      const v = Math.round(Number(el.max) * f);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, frac);
    await setRange('inizio', 0.25);
    await setRange('fine', 0.75);
    await page.waitForSelector('[data-section-stats]', { timeout: 5000 });
    const km = await page.$eval('[data-section-stats]', e => Number(e.innerText.match(/([\d.,]+)\s*\n?\s*km/)[1].replace(/\./g, '').replace(',', '.')));
    assert.ok(km > 0 && km < whole.ref, `section ${km} km should be within the drive (${whole.ref} km)`);
    // map: dimmed full route + highlighted section
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-overlay-pane path').length >= 6, { timeout: 5000 });
    await clickText(page, 'Tutto il viaggio');
    assert.equal(await page.$('[data-section-stats]'), null);
  });
});
