// Service worker: the app's own files come from the network when it is there (an installed app
// must open on the deployed version), the saved copy only offline.
'use strict';
process.env.TM_MOCK = '1';
process.env.TEST_PORT = '8126'; // own server: this test stops it
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BASE_URL, startServer, withBrowser } = require('./helpers');

const PROBE = path.join(__dirname, '.sw-probe.txt'); // served by local-server.js as /tests/.sw-probe.txt
let serverProcess;
test.before(async () => { serverProcess = await startServer(); });
test.after(() => { serverProcess?.kill(); fs.rmSync(PROBE, { force: true }); });

test('new version of a file is served at once; the saved copy when offline', async () => {
  await withBrowser(async (page) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => navigator.serviceWorker.controller, { timeout: 30000 });
    const get = () => page.evaluate(() => fetch('/tests/.sw-probe.txt').then(r => r.text()).catch(e => 'error: ' + e.message));

    fs.writeFileSync(PROBE, 'v1');
    assert.equal(await get(), 'v1');
    await new Promise(r => setTimeout(r, 300));                 // v1 saved: stale-while-revalidate would now serve it
    fs.writeFileSync(PROBE, 'v2');                              // a deploy
    assert.equal(await get(), 'v2', 'no stale copy while online');
    await new Promise(r => setTimeout(r, 300));                 // let the copy be saved
    serverProcess.kill();
    await new Promise(r => setTimeout(r, 500));
    assert.equal(await get(), 'v2', 'saved copy offline');
  });
});
