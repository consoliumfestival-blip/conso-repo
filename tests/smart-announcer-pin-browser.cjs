// Run against an isolated web export built with EXPO_PUBLIC_SUPABASE_URL=https://announcer-fixture.supabase.co.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.ANNOUNCER_DIST || path.join(process.cwd(), 'dist');
const server = http.createServer((req, res) => {
  const filePath = path.join(root, new URL(req.url, 'http://localhost').pathname);
  const file = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(root, 'index.html');
  res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const tenant = '20000000-0000-0000-0000-000000000001';
const festival = '30000000-0000-0000-0000-000000000001';
const team = '60000000-0000-0000-0000-000000000001';
const teamB = '60000000-0000-0000-0000-000000000002';
const ids = Array.from({ length: 6 }, (_, i) => `40000000-0000-0000-0000-00000000000${i + 1}`);
const user = { id: '10000000-0000-0000-0000-000000000001', email: 'admin@example.invalid', app_metadata: {}, user_metadata: {}, aud: 'authenticated' };
const expires_at = Math.floor(Date.now() / 1000) + 3600;
const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const access_token = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: user.id, exp: expires_at, role: 'authenticated' })}.fixture`;
const session = { access_token, user, expires_at, refresh_token: 'fixture', token_type: 'bearer' };

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const [width, height] of [[320, 700], [360, 780], [768, 1024], [1024, 768], [1440, 900]]) {
      let savedQueue = [], savedTeam = null, announced = false, revoked = false, publicVisible = false, candidateFailure = false, issueFailure = false, pollCount = 0;
      const changes = [];
      const page = await browser.newPage({ viewport: { width, height } });
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${server.address().port}` });
      if (width === 1440) await page.addInitScript(() => {
        const original = window.setInterval.bind(window);
        window.setInterval = (callback, delay, ...args) => original(callback, delay === 30000 ? 250 : delay, ...args);
      });
      await page.addInitScript(s => localStorage.setItem('sb-announcer-fixture-auth-token', JSON.stringify(s)), session);
      await page.route('https://announcer-fixture.supabase.co/**', async route => {
        const req = route.request(), name = new URL(req.url()).pathname.split('/').pop();
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        let json = [];
        if (name === 'profiles') json = { role: 'admin', tenant_id: tenant, is_superadmin: false };
        if (name === 'user') json = user;
        if (name === 'get_my_access_status') json = { access_disabled: false };
        if (name === 'festival_calendar') json = [{ id: festival, tenant_id: tenant, is_active: true, festival_name: 'Fixture Festival' }];
        if (name === 'items') json = ids.map((id, i) => ({ id, item_name_en: `Item ${i + 1}`, category_codes: ['GENERAL'] }));
        if (name === 'get_admin_published_results') json = ids.map((id, i) => ({ result_id: `50000000-0000-0000-0000-00000000000${i + 1}`, item_id: id, festival_id: festival, tenant_id: tenant, item_name: `Item ${i + 1}`, participant_name: 'Fixture Winner', organisation_id: team, organisation_name: 'Team A', published: true, result_status: 'published', public_visible: publicVisible, rank: 1, points_awarded: 7 }));
        if (name === 'smart_announcer_admin_queue') json = savedQueue.map((id, i) => ({ item_id: id, queue_position: i + 1, announced_at: null }));
        if (name === 'smart_announcer_recommendations') json = { teams: [{ id: team, name: 'Team A' }, { id: teamB, name: 'Team B' }], items: [] };
        if (name === 'smart_announcer_team_candidates') {
          if (candidateFailure) return route.fulfill({ status: 503, headers, json: { message: 'Fixture unavailable' } });
          json = ids.map((id, i) => ({ id, name: `Item ${i + 1}`, item_code: `CODE-${i + 1}`, category_codes: ['GENERAL'] })).filter((_, i) => req.postDataJSON().p_team_id === team || i >= 4);
        }
        if (name === 'smart_announcer_replace_team_queue') { const body = req.postDataJSON(); savedTeam = body.p_team_id; savedQueue = body.p_item_ids; }
        if (name === 'smart_announcer_issue_pin_token') {
          if (issueFailure) return route.fulfill({ status: 503, headers, json: { message: 'Fixture unavailable' } });
          json = [{ token: 'a'.repeat(64), pin: '1234', expires_at: '2099-01-01T00:00:00Z' }];
        }
        if (name === 'smart_announcer_get_queue') {
          if (!revoked && req.postDataJSON().p_token === 'b'.repeat(64)) return route.fulfill({ status: 200, headers, json: [{ item_id: ids[0], item_name: 'Legacy Item', queue_position: 1, announced_at: null, category_codes: [], result_details: [] }] });
          return route.fulfill({ status: 403, headers, json: { code: '42501' } });
        }
        if (name === 'smart_announcer_access_mode') json = revoked ? 'invalid' : req.postDataJSON().p_token === 'b'.repeat(64) ? 'legacy' : 'pin';
        if (name === 'smart_announcer_get_queue_pin' || name === 'smart_announcer_poll_queue_pin') {
          if (name === 'smart_announcer_poll_queue_pin') pollCount++;
          json = !revoked && req.postDataJSON().p_pin === '1234' ? { status: 'ok', items: [{ item_id: savedQueue[0], item_name: `Item ${ids.indexOf(savedQueue[0]) + 1}`, queue_position: 1, announced_at: announced ? '2026-11-12T00:00:00Z' : null, category_codes: ['GENERAL'], result_details: [{ rank: 1, participant_name: 'Fixture Winner', team_name: 'Team B', points_awarded: 7 }] }] } : { status: req.postDataJSON().p_pin === '9999' ? 'locked' : 'invalid' };
        }
        if (name === 'smart_announcer_mark_announced_pin') { assert.equal(req.postDataJSON().p_pin, '1234'); announced = true; json = { status: 'ok' }; }
        if (name === 'results' && req.method() === 'PATCH') { changes.push(req.postDataJSON()); publicVisible = !!changes.at(-1).public_visible; return route.fulfill({ status: 204, headers }); }
        assert(!/auto_publish|toggle_announcer_result_visibility/.test(name));
        return route.fulfill({ status: 200, headers, json });
      });
      await page.goto(`http://localhost:${server.address().port}/smart-announcer`);
      await page.getByText('Select Team', { exact: true }).click({ timeout: 15000 });
      await page.getByLabel('Festival team').selectOption(team);
      await page.getByText('CODE-6 · GENERAL', { exact: true }).waitFor();
      const boxes = page.getByRole('checkbox');
      assert.equal(await boxes.count(), 6);
      for (let i = 0; i < 6; i++) {
        const state = await boxes.nth(i).evaluate(el => ({ checked: el.getAttribute('aria-checked'), html: el.outerHTML.slice(0, 500) }));
        assert.equal(state.checked, i < 5 ? 'true' : 'false', state.html);
      }
      await boxes.nth(5).click();
      assert.equal(await boxes.nth(5).getAttribute('aria-checked'), 'false');
      await page.getByText('Save queue', { exact: true }).click();
      await page.getByText('Queue saved.', { exact: true }).waitFor();
      assert.deepEqual(savedQueue, ids.slice(0, 5));
      assert.equal(savedTeam, team);
      candidateFailure = true;
      await page.getByRole('button', { name: 'Refresh team results' }).click();
      await page.getByText('Unable to load team results. Tap to retry.').waitFor({ timeout: 15000 });
      candidateFailure = false;
      await page.getByText('Unable to load team results. Tap to retry.').click();
      await page.getByText('CODE-6 · GENERAL', { exact: true }).waitFor();
      await page.getByLabel('Festival team').selectOption(teamB);
      await page.waitForFunction(() => document.querySelectorAll('[role=checkbox]').length === 2);
      await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/smart_announcer_replace_team_queue')),
        page.getByText('Save queue', { exact: true }).click(),
      ]);
      assert.equal(savedTeam, teamB);
      assert.deepEqual(savedQueue, ids.slice(4));
      issueFailure = true;
      await page.getByText('Create announcer link', { exact: true }).click();
      await page.getByText('Unable to create a PIN-protected link.').waitFor();
      issueFailure = false;
      await page.getByText('Create announcer link', { exact: true }).click();
      await page.getByText(/PIN: 1234/).waitFor();
      const linkInput = page.getByLabel('Announcer link');
      assert((await linkInput.inputValue()).includes(`/announcer/${'a'.repeat(64)}`));
      await linkInput.selectText();
      assert(await linkInput.evaluate(el => el.selectionEnd > el.selectionStart));
      await page.getByRole('button', { name: 'Copy link' }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await linkInput.inputValue());
      await page.getByRole('button', { name: 'Copy PIN' }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '1234');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 320 || width === 1024) await page.screenshot({ path: path.join(require('node:os').tmpdir(), `conso-announcer-admin-${width}.png`) });
      await page.goto(`http://localhost:${server.address().port}/announcer/${'a'.repeat(64)}`);
      await page.getByText('Enter announcer PIN').waitFor();
      await page.getByLabel('Four digit PIN').fill('0000');
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await page.getByText('Invalid PIN or expired link.').waitFor();
      await page.getByLabel('Four digit PIN').fill('9999');
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await page.getByText('Too many attempts. Try again after 15 minutes.').waitFor();
      await page.getByLabel('Four digit PIN').fill('1234');
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await page.getByText('Item 5', { exact: true }).waitFor();
      if (width === 1440) {
        await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }));
        await page.waitForTimeout(350);
        const beforeHiddenWait = pollCount;
        await page.waitForTimeout(700);
        assert.equal(pollCount, beforeHiddenWait, 'hidden page must not poll');
        await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }));
        savedQueue = [ids[1]];
        await page.getByText('Item 2', { exact: true }).waitFor({ timeout: 5000 });
        assert(pollCount > 0);
        savedQueue = ids.slice(4);
        await page.getByText('Item 5', { exact: true }).waitFor({ timeout: 5000 });
      }
      if (width === 320 || width === 1024) await page.screenshot({ path: path.join(require('node:os').tmpdir(), `conso-announcer-portal-${width}.png`) });
      await page.getByRole('button', { name: 'Mark Announced' }).click();
      await page.getByText('No items to announce.').waitFor();
      await page.getByRole('button', { name: 'Announced', exact: true }).click();
      await page.getByText('Item 5', { exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      revoked = true;
      await page.getByRole('button', { name: 'Refresh' }).click();
      await page.getByText('This link has expired or is no longer valid. Ask an admin for a new link.').waitFor();
      assert.equal(await page.getByText('Item 5', { exact: true }).count(), 0);
      revoked = false;
      await page.goto(`http://localhost:${server.address().port}/announcer/${'b'.repeat(64)}`);
      await page.getByText('Legacy Item', { exact: true }).waitFor();
      assert.equal(await page.getByText('Enter announcer PIN').count(), 0);
      revoked = true;
      await page.getByRole('button', { name: 'Refresh' }).click();
      await page.getByText('This link has expired or is no longer valid. Ask an admin for a new link.').waitFor();
      await page.goto(`http://localhost:${server.address().port}/team-leaders`);
      await page.getByText('Open Smart Announcer', { exact: true }).click({ timeout: 15000 });
      await page.getByText('Announcer queue', { exact: true }).waitFor();
      if (width === 1440) {
        await page.goto(`http://localhost:${server.address().port}/settings/leaderboard/item-results`);
        await page.getByText('Show Public', { exact: true }).first().waitFor({ timeout: 15000 });
        await page.getByText('Show Public', { exact: true }).first().click();
        await page.getByText('Hide Public', { exact: true }).first().waitFor();
        await Promise.all([
          page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/results') && response.request().method() === 'PATCH'),
          page.getByText('Hide Public', { exact: true }).first().click(),
        ]);
        assert.equal(changes.length, 2);
        assert.equal(changes[0].public_visible, true);
        assert.equal(changes[1].public_visible, false);
        assert(!changes.some(change => 'rank' in change || 'points_awarded' in change || 'total_score' in change));
      }
      console.log(`PASS ${width}: team queue, PIN, announcement, responsive layout${width === 1440 ? ', publish/hide' : ''}`);
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
