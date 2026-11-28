const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

const CAMPUS = '73ee92f3-d795-43eb-997e-380e52856424';
const FESTIVAL = '67768549-ba37-47ca-8c7c-209953002bfa';
const endpoint = import(pathToFileURL(path.join(__dirname, '..', 'functions', 'api', 'campus-category-standings.ts')).href);
const env = { EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
const request = (tenant = CAMPUS, festival = FESTIVAL) => new Request(`https://example.test/api/campus-category-standings?tenant_id=${tenant}&festival_id=${festival}`);

test('Pages routes send the Campus endpoint to the function without looping the Campus page', () => {
  const routes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', '_routes.json'), 'utf8'));
  const redirects = fs.readFileSync(path.join(__dirname, '..', 'public', '_redirects'), 'utf8');
  assert.ok(routes.include.includes('/api/campus-category-standings'));
  assert.doesNotMatch(redirects, /^\/campus\s/m);
});

test('rejects another tenant before calling Supabase', async () => {
  const original = global.fetch;
  global.fetch = () => { throw new Error('must not fetch'); };
  try {
    const { onRequestGet } = await endpoint;
    const response = await onRequestGet({ request: request('45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe'), env });
    assert.equal(response.status, 400);
  } finally { global.fetch = original; }
});

test('honors public feature gates without requesting standings', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({ public_page: false }), { status: 200 });
  };
  try {
    const { onRequestGet } = await endpoint;
    const response = await onRequestGet({ request: request(), env });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).rows, []);
    assert.equal(calls.length, 1);
  } finally { global.fetch = original; }
});

test('passes the exact tenant and festival to the public category RPC', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(calls.length === 1
      ? { public_page: true, public_leaderboard: true, sections: { results: true } }
      : [{ category_code: 'JR', organisation_name: 'Team', total_points: 10 }]), { status: 200 });
  };
  try {
    const { onRequestGet } = await endpoint;
    const response = await onRequestGet({ request: request(), env });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).rows.length, 1);
    assert.equal(calls[1].url, 'https://example.supabase.co/rest/v1/rpc/get_public_category_trophy_standings');
    assert.deepEqual(calls[1].body, { p_tenant_id: CAMPUS, p_festival_id: FESTIVAL });
  } finally { global.fetch = original; }
});
