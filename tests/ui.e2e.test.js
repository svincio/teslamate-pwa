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
    assert.equal(await page.$('select[aria-label="Auto da mostrare"]'), null, 'one car: no car switch');
    if (process.env.TM_MOCK) assert.ok(!/Aperto/.test(text), 'nothing open on the demo car');
    assert.match(text, /\d{1,3}\s*%/, 'expected a battery percentage on the home screen');
    assert.ok(!/\b0\s*km\s*\n?\s*Autonomia/.test(text), 'range must not be 0 km');
  });
});

const press = (page, label) => page.evaluate((l) => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === l).click(), label);
// Leaving Altro applies pending settings with one reload, straight into that tab (click deferred: the page goes away).
const leaveTo = (page, label) => Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
  page.evaluate((l) => setTimeout(() => [...document.querySelectorAll('nav button')].find(b => b.innerText.trim() === l).click(), 0), label),
]);

test('English UI when the browser is not Italian', async () => {
  await withBrowser(async (page) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('Battery'), { timeout: 30000 });
    await waitHistory(page);
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    const seen = [];
    for (const l of ['Trips', 'Charges', 'Statistics', 'More', 'Status']) { await tab(page, l); seen.push(await bodyText(page)); }
    const text = seen.join('\n');
    assert.match(text, /Odometer/);
    assert.match(text, /Battery health/);
    assert.ok(!/undefined|NaN|\{\w+\}/.test(text), 'no undefined/NaN/unfilled {placeholders}');
    const italian = text.match(/\b(Viaggi|Ricariche|Batteria|Oggi|Ieri|Spesa|Autonomia|Durata|Mostra|Nessun[ao]?)\b/g);
    assert.equal(italian, null, `Italian words left: ${italian}`);
  }, { lang: 'en-US' });
});

test('language chosen on this device overrides the system one and survives a restart', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);                                   // device in Italian
    await tab(page, 'Altro');
    await press(page, 'English');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'it', 'nothing reloads while in Altro');
    await leaveTo(page, 'Stato');
    await page.waitForFunction(() => document.body.innerText.includes('Battery'), { timeout: 30000 }); // reloaded in English
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('Battery'), { timeout: 30000 });
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    await tab(page, 'More');
    await press(page, 'Auto');
    await leaveTo(page, 'Status');
    await page.waitForFunction(() => document.body.innerText.includes('Batteria'), { timeout: 30000 }); // back to the device language
  });
});

test('number format chosen on this device: separators change, the language does not', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);                                   // Italian device: 12.345 km
    const odo = () => page.evaluate(() => ((document.body.innerText.match(/([\d.,\u202f\u00a0 ]+)\s*km\s*\n\s*Odometro/) || [])[1] || '').trim());
    assert.match(await odo(), /^\d{1,3}(\.\d{3})+$/);
    await tab(page, 'Altro');
    await press(page, '1,234.5');
    await leaveTo(page, 'Stato');
    await page.waitForFunction(() => document.body.innerText.includes('Odometro'), { timeout: 30000 });
    assert.match(await odo(), /^\d{1,3}(,\d{3})+$/, 'thousands with a comma, UI still Italian');
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

test('desktop: sidebar and master-detail navigation for drives and charges', async () => {
  await withBrowser(async (page) => {
    await page.setViewport({ width: 1440, height: 900 });
    await gotoAppReady(page);
    await waitHistory(page);
    assert.equal(await page.$eval('nav', n => n.style.width), '230px');

    await tab(page, 'Viaggi');
    await page.waitForSelector('[data-drive-id]');
    const driveCount = await page.$$eval('[data-drive-id]', els => els.length);
    assert.ok(driveCount > 1);
    assert.equal(await page.$$eval('button[aria-label="Successivo"]', els => els.length), 1);
    const before = await page.$$eval('h1', els => els.at(-1).innerText);
    // the list scrolls on its own: the detail pane stays where it is
    const panes = await page.evaluate(() => {
      const list = document.querySelector('[data-drive-id]').closest('div[style*="overflow-y"]');
      const detail = list.nextElementSibling;
      list.scrollTop = 300;
      return { listMoved: list.scrollTop > 0, detailScroll: detail.scrollTop, pageScroll: document.scrollingElement.scrollTop };
    });
    assert.ok(panes.listMoved && panes.detailScroll === 0 && panes.pageScroll === 0);
    await page.locator('button[aria-label="Successivo"]').click();
    await page.waitForFunction((old) => [...document.querySelectorAll('h1')].at(-1).innerText !== old, {}, before);

    await tab(page, 'Ricariche');
    await page.waitForSelector('[data-charge-id]');
    assert.equal(await page.$$eval('button[aria-label="Successivo"]', els => els.length), 1);
  });
});

test('rotation: iOS leaves the page scrolled by the status bar height; it is put back to 0', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await tab(page, 'Viaggi');
    await clickText(page, 'Anno');
    // the page can be scrolled under overflow: hidden (what iOS does after a rotation)
    await page.evaluate(() => { document.documentElement.style.height = '200%'; document.documentElement.style.overflow = 'visible'; window.scrollTo(0, 59); });
    assert.equal(await page.evaluate(() => window.scrollY), 59);
    await page.setViewport({ width: 844, height: 390 });
    await page.setViewport({ width: 430, height: 900 });
    await page.waitForFunction(() => window.scrollY === 0, { timeout: 5000 });
    await tab(page, 'Ricariche');
    assert.match(await bodyText(page), /Spesa/);
  });
});

test('CSV export: every drive/charge of the period, Excel-friendly', async () => {
  await withBrowser(async (page) => {
    await (await page.createCDPSession()).send('Browser.setDownloadBehavior', { behavior: 'deny' }); // the file itself is checked below
    await gotoAppReady(page);
    await waitHistory(page);
    const grab = () => page.evaluate(async () => {
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); // take the download path
      window.__csv = null;
      const make = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (f) => { f.arrayBuffer().then(b => { window.__csv = { name: f.name, bom: [...new Uint8Array(b.slice(0, 3))].join(), text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(b) }; }); return make(f); };
      document.querySelector('[data-export-csv]').click();
    }).then(() => page.waitForFunction(() => window.__csv, { timeout: 5000 })).then(() => page.evaluate(() => window.__csv));

    await tab(page, 'Viaggi');
    // the list shows 60 cards at a time; the export has the whole period, as the summary says
    const drives = await page.$eval('section[aria-label="Riepilogo periodo"]', el => Number(el.innerText.match(/(\d+)\s*\n\s*viaggi/)[1]));
    const d = await grab();
    const lines = d.text.replace(/^\uFEFF/, '').split('\r\n');
    assert.match(d.name, /^viaggi-.*\.csv$/);
    assert.equal(d.bom, '239,187,191', 'UTF-8 BOM for Excel');
    assert.match(lines[0], /^Inizio;Fine;Da;A;Distanza \(/);
    assert.ok(drives > 0 && lines.length === drives + 1, `one row per drive of the period (${drives} in the summary, ${lines.length - 1} rows)`);
    assert.match(lines[1], /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d;/);

    await tab(page, 'Ricariche');
    const charges = await page.$eval('section[aria-label="Spesa"]', el => Number(el.innerText.match(/(\d+) ricariche/)[1]));
    const c = await grab();
    const cl = c.text.replace(/^\uFEFF/, '').split('\r\n');
    assert.match(c.name, /^ricariche-.*\.csv$/);
    assert.ok(charges > 0 && cl.length === charges + 1, `one row per charge of the period (${charges} in the summary, ${cl.length - 1} rows)`);
  });
});

test('idle drain: only parked stops of 12 h+ with no movement and no charge, battery lost over time', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    const r = await page.evaluate(() => {
      const dr = (id, s, e, from, to, o0, o1) => ({ id, _date: s, _end: e, socFrom: from, socTo: to, odoStart: o0, odoEnd: o1 });
      const drives = [
        dr(1, '2026-01-01T07:00:00Z', '2026-01-01T07:30:00Z', 90, 88, 1000, 1010),
        dr(2, '2026-01-02T08:00:00Z', '2026-01-02T08:30:00Z', 85, 83, 1010, 1020),  // 24.5 h parked, 88 -> 85: lost 3
        dr(3, '2026-01-02T12:00:00Z', '2026-01-02T12:30:00Z', 83, 82, 1020, 1030),  // 3.5 h: too short
        dr(4, '2026-01-04T12:30:00Z', '2026-01-04T13:00:00Z', 90, 88, 1030, 1040),  // 48 h but 82 -> 90: a charge not logged
        dr(5, '2026-01-06T13:00:00Z', '2026-01-06T13:30:00Z', 80, 78, 1100, 1110),  // 48 h, odometer jumped 60: moved unlogged
      ];
      const stops = computeIdle(drives, [], 75);
      return { stops, sum: idleSummary(stops, new Date('2026-01-01'), new Date('2026-02-01'), 75), noCap: computeIdle(drives, [], 0)[0].kwh };
    });
    assert.equal(r.stops.length, 1);
    assert.equal(r.stops[0].lostPct, 3);
    assert.equal(r.stops[0].hours, 24.5);
    assert.deepEqual(r.stops[0].next, { type: 'drive', id: 2 });
    assert.equal(r.stops[0].kwh, 2.25);
    assert.equal(Math.round(r.sum.pctPerDay * 100) / 100, 2.94);
    assert.equal(Math.round(r.sum.kwhPerDay * 100) / 100, 2.2);
    assert.equal(r.noCap, null, 'without the real capacity there is no kWh figure');
  });
});

test('large text collapses statistic grids to one column on a narrow screen', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await page.evaluate(() => { localStorage.setItem('tm.pwa.prefs', JSON.stringify({ textSize: 300 })); location.reload(); });
    await gotoAppReady(page);
    await tab(page, 'Viaggi');
    const columns = await page.$eval('section[aria-label="Riepilogo periodo"] > div', el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns, 1);
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

test('theme chosen on this device wins over the system setting', async () => {
  await withBrowser(async (page) => {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await gotoAppReady(page);
    await tab(page, 'Altro');
    await press(page, 'Scuro');
    await leaveTo(page, 'Stato');
    await page.waitForFunction(() => document.querySelector('section[aria-label="Auto"]'), { timeout: 30000 });
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('section[aria-label="Auto"]')).backgroundColor);
    assert.equal(bg, 'rgb(28, 28, 30)', 'dark cards on a light system');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(0, 0, 0)');
  });
});

test('12-hour clock chosen on this device', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);                                   // Italian device: 24 h
    await waitHistory(page);
    await tab(page, 'Viaggi');
    const time = () => page.$eval('[data-drive-id]', el => el.innerText.split('\n')[1]);
    assert.match(await time(), /^\d{2}:\d{2}$/);
    await tab(page, 'Altro');
    await press(page, '12 h');
    await leaveTo(page, 'Viaggi');                              // lands on Viaggi
    await waitHistory(page);
    assert.match(await time(), /^\d{1,2}:\d{2}\s?[AP]M$/i);
  });
});

test('several settings changed in Altro: one reload when leaving it, into the chosen tab', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await tab(page, 'Viaggi');
    await press(page, 'Anno');                                  // a filter that must survive the reload
    await tab(page, 'Altro');
    let navs = 0;
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
    for (const l of ['English', '12 h', 'Scuro']) await press(page, l);
    await new Promise(r => setTimeout(r, 500));
    assert.equal(navs, 0, 'no reload while in Altro');
    assert.match(await bodyText(page), /Si applicano quando esci da Altro/);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('tm.pwa.prefs'))), { lang: 'en', clock: '12', theme: 'dark' }, 'all three saved');
    await leaveTo(page, 'Viaggi');
    await page.waitForFunction(() => document.querySelector('h1') && document.querySelector('h1').innerText === 'Trips', { timeout: 30000 });
    assert.equal(navs, 1, 'exactly one reload');
    assert.equal(await page.$eval('button[aria-pressed="true"]', b => b.innerText.trim()), 'Year', 'period filter kept');
  });
});

test('refresh: faster while charging or driving, and at once when the app comes back', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    const secs = (state) => page.evaluate((s) => { const c = window.TM_CAR, old = c.state, ch = c.charging;
      c.state = s; c.charging = null; const n = tmRefreshSeconds(60); c.state = old; c.charging = ch; return n; }, state);
    assert.equal(await secs('driving'), 15);
    assert.equal(await secs('charging'), 15);
    assert.equal(await secs('asleep'), 60);
    let calls = 0;
    page.on('request', (r) => { if (/\/cars\/\d+\/status/.test(r.url())) calls++; });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await new Promise(r => setTimeout(r, 1500));
    assert.ok(calls >= 1, 'status fetched when the app is visible again');
  });
});

test('reopening the app shows the cached data even if the API is unreachable', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await waitHistory(page);
    await page.waitForFunction(() => {
      try { return !!JSON.parse(localStorage.getItem('tm.pwa.cache.v2.it.24.car1')).history; } catch { return false; }
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

test('text size slider: magnets every 50%, − / +, cap on narrow screens, Auto; maps still pan', async () => {
  await withBrowser(async (page) => {
    await gotoAppReady(page);
    await tab(page, 'Altro');
    const slider = 'input[aria-label="Dimensione testo"]';
    const zoom = () => page.evaluate(() => document.documentElement.style.zoom);
    // drag to a value and lift the finger (input events, then pointerup)
    const dragTo = async (n) => {
      await page.$eval(slider, (el, x) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(x));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, n);
      await page.$eval(slider, (el) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    };
    assert.equal(await page.$eval(slider, el => el.disabled), true, 'Auto: slider off');
    assert.equal(await page.$eval(slider, el => el.max), '215', '430 px wide: at most 215%');
    await page.$$eval('[role=group][aria-label="Dimensione testo"] button', bs => bs.find(b => b.innerText.trim() === 'Manuale').click());
    await dragTo(147);
    assert.equal(await zoom(), '1.5', 'magnet at 150%, applied at once without leaving Altro');
    await press(page, '+');
    assert.equal(await zoom(), '1.51');
    await dragTo(300);
    assert.equal(await zoom(), '2.15', 'capped by the screen width');
    await dragTo(130);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('tm.pwa.prefs')).textSize), '130');
    await tab(page, 'Stato');                                    // no reload needed: the size is already applied
    assert.equal(await zoom(), '1.3');
    const nav = await page.$eval('nav', n => [n.getBoundingClientRect().bottom, innerHeight]);
    assert.ok(Math.abs(nav[0] - nav[1]) < 2, `tab bar still at the bottom (${nav})`);
    await page.waitForSelector('[data-map-expand]', { timeout: 60000 });
    await page.$eval('[data-map-expand]', b => b.click());
    await page.waitForSelector('[role=dialog] .leaflet-container', { timeout: 10000 });
    const r = await page.$eval('[role=dialog]', e => { const b = e.getBoundingClientRect(); return [b.width, b.height, innerWidth, innerHeight]; });
    assert.ok(Math.abs(r[0] - r[2]) < 2 && Math.abs(r[1] - r[3]) < 2, `full-screen map fills the screen (${r})`);
    const pane = () => page.$eval('[role=dialog] .leaflet-map-pane', p => new DOMMatrix(getComputedStyle(p).transform).m41);
    const before = await pane();
    const box = await page.$eval('[role=dialog] .leaflet-container', e => { const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
    await page.mouse.move(box[0], box[1]); await page.mouse.down();
    await page.mouse.move(box[0] + 100, box[1], { steps: 10 }); await page.mouse.up();
    const moved = (await pane()) - before;
    assert.ok(moved > 50 && moved < 150, `map panned with the pointer (${moved} px)`);
    await page.$eval('[data-map-close]', b => b.click());
    await tab(page, 'Altro');
    await page.$$eval('[role=group][aria-label="Dimensione testo"] button', bs => bs.find(b => b.innerText.trim() === 'Auto').click());
    assert.equal(await zoom(), '', 'Auto: back to 100% on a non-Apple browser');
  });
});

test('large text: no screen scrolls sideways (charts sized to their box)', async () => {
  await withBrowser(async (page) => {
    await page.setViewport({ width: 390, height: 900 });          // iPhone upright at the cap: 200 px of layout left
    await page.evaluateOnNewDocument(() => localStorage.setItem('tm.pwa.prefs', '{"textSize":"300"}'));
    await gotoAppReady(page);
    await waitHistory(page);
    // every scrolling layer must be as wide as it shows
    const sideways = () => page.evaluate(() => [...document.querySelectorAll('div')]
      .filter(d => getComputedStyle(d).overflowY === 'auto' && d.scrollWidth > d.clientWidth + 1).map(d => `${d.scrollWidth}>${d.clientWidth}`));
    await tab(page, 'Statistiche');
    assert.deepEqual(await sideways(), [], 'Statistiche');
    await tab(page, 'Viaggi');
    await page.$eval('[data-drive-id]', el => el.click());
    await page.waitForSelector('svg[aria-label$="nel tempo"]', { timeout: 60000 });
    assert.deepEqual(await sideways(), [], 'drive detail');
    await page.evaluate(() => document.querySelector('button[aria-label^="Torna a"]').click());
    await tab(page, 'Ricariche');
    await page.$eval('[data-charge-id]', el => el.click());
    await page.waitForSelector('svg[aria-label^="Potenza e livello batteria"]', { timeout: 60000 });
    assert.deepEqual(await sideways(), [], 'charge detail');
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
