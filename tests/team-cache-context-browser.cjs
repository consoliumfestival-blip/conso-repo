const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const esbuild = require(require.resolve('esbuild', { paths: [root, path.join(root, '.expo/verification')] }));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const stub = path.join(root, 'tests/fixtures/team-cache-context-stubs.tsx');
  const result = await esbuild.build({ entryPoints: [path.join(root, 'tests/fixtures/team-cache-context-entry.tsx')], bundle: true, write: false, platform: 'browser', format: 'iife', tsconfig: path.join(root, 'tsconfig.json'), alias: { 'expo-router': stub, '@/core/store/authStore': stub, '@/services/teamLeaderPortalService': stub } });
  const server = http.createServer((req, res) => { if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(result.outputFiles[0].contents); } else { res.setHeader('Content-Type', 'text/html'); res.end('<div id="root"></div><script src="/bundle.js"></script>'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const waitValue = value => page.waitForFunction(value => document.querySelector('[data-testid="value"]')?.textContent === value, value);
    const waitContext = value => page.waitForFunction(value => document.querySelector('[data-testid="context"]')?.textContent === value, value);
    await waitValue('data-user-a');
    await page.evaluate(() => { window.teamCacheFixture.fail = 'offline'; });
    await page.getByText('Refresh', { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="error"]')?.textContent === 'offline');
    assert.equal(await page.locator('[data-testid="value"]').textContent(), 'data-user-a');
    await page.evaluate(() => { window.teamCacheFixture.fail = ''; window.teamCacheFixture.contextDelay = 500; window.setTeamCacheAuth('user-b'); });
    await waitContext('none');
    assert.equal(await page.locator('[data-testid="value"]').textContent(), 'none');
    await waitValue('data-user-b');
    assert.equal(await page.evaluate(() => window.teamCacheClient.getQueryCache().getAll().some(q => q.queryKey[0] === 'team-read' && q.queryKey[1] === 'user-a' && q.state.data !== undefined)), false);
    await page.evaluate(() => window.setTeamCacheAuth(null));
    await waitContext('none');
    assert.equal(await page.locator('[data-testid="value"]').textContent(), 'none');
    await page.evaluate(() => { window.teamCacheFixture.contextDelay = 0; window.setTeamCacheAuth('user-b'); });
    await waitValue('data-user-b');
    await page.evaluate(() => { window.teamCacheFixture.fail = 'auth'; });
    await page.getByText('Refresh', { exact: true }).click();
    await waitContext('none');
    assert.equal(await page.locator('[data-testid="value"]').textContent(), 'none');
    console.log('PASS: offline cache, account switch, logout, and authorization loss');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
