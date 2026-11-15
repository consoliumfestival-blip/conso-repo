// Run against a web export configured for https://festival-view-fixture.supabase.co.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.PORTAL_DIST || path.join(process.cwd(), 'dist');
const server = http.createServer((req, res) => {
  const candidate = path.join(root, new URL(req.url, 'http://localhost').pathname);
  const file = fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(root, 'index.html');
  res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const link = '10000000-0000-4000-8000-000000000001';
const participant = '50000000-0000-4000-8000-000000000001';
const item = '60000000-0000-4000-8000-000000000001';
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const [width, height] of [[320,700], [768,1024], [1024,768], [1440,900]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      let calls = [];
      await page.route('https://festival-view-fixture.supabase.co/**', async route => {
        const req = route.request();
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        const name = new URL(req.url()).pathname.split('/').pop();
        let json = [];
        if (name === 'festival_readonly_data') {
          const args = req.postDataJSON(); calls.push(args.p_view);
          if (args.p_pin !== '1234') json = { status: 'invalid' };
          else if (args.p_view === 'participants') json = { status: 'ok', rows: [{ id: participant, name: 'Alice', chest_number: '101', category_code: 'A', team: 'Team A' }] };
          else if (args.p_view === 'participant') json = { status: 'ok', rows: [{ id: item, name: 'Speech', item_code: 'A1' }] };
          else if (args.p_view === 'programs') json = { status: 'ok', rows: [{ id: item, name: 'Speech', item_code: 'A1', participation_type: 'group' }] };
          else json = { status: 'ok', rows: [{ id: 'entry-1', team: 'Team A', members: [{ name: 'Alice', chest_number: '101' }] }] };
        }
        return route.fulfill({ status: 200, headers, json });
      });
      await page.goto(`http://localhost:${server.address().port}/festival-view/${link}`);
      await page.getByLabel('Portal PIN').fill('9999');
      await page.getByRole('button', { name: 'Open portal' }).click();
      await page.getByText(/Invalid link or PIN/).waitFor();
      await page.getByLabel('Portal PIN').fill('1234');
      await page.getByRole('button', { name: 'Open portal' }).click();
      await page.getByRole('button', { name: /Alice/ }).click();
      await page.getByText('Speech', { exact: true }).waitFor();
      await page.getByRole('button', { name: /Back to participants/ }).click();
      await page.getByRole('tab', { name: 'Programs' }).click();
      await page.getByRole('button', { name: /Speech/ }).click();
      await page.getByText(/Alice · 101/).waitFor();
      assert(calls.includes('participant') && calls.includes('program'));
      assert.equal(await page.getByRole('button', { name: /edit|delete|assign/i }).count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      console.log(`PASS ${width}: PIN, tabs, details and read-only layout`);
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
