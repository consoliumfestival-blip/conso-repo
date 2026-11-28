import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestGetVersion } from '../functions/api/public-snapshot.ts';
import { readFreshPublicSnapshot } from '../src/core/utils/publicSnapshotFreshness.ts';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const festivalA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const festivalB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const itemA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const env = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

function fakeCache() {
  const entries = new Map();
  return {
    entries,
    default: {
      async match(request) {
        const entry = entries.get(request.url);
        return entry && Date.now() < entry.expires ? entry.response.clone() : undefined;
      },
      async put(request, response) {
        const age = Number(/max-age=(\d+)/.exec(response.headers.get('Cache-Control') ?? '')?.[1] ?? 0);
        entries.set(request.url, { response: response.clone(), expires: Date.now() + age * 1000 });
      },
    },
  };
}

function installSource({ disabled = false, leaderboardDisabled = false, hiddenLeaderboard = false, fail = false, revision = () => 1 } = {}) {
  const calls = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ path: url.pathname, body, headers: options.headers });
    if (fail) return new Response('failed', { status: 500 });
    const tenant = body.p_tenant_id ?? new URLSearchParams(url.search).get('tenant_id')?.replace('eq.', '');
    const festival = tenant === tenantA ? festivalA : festivalB;
    let value;
    switch (url.pathname) {
      case '/rest/v1/rpc/get_public_tenant_feature_settings':
        value = { public_page: !disabled, public_leaderboard: !disabled && !leaderboardDisabled,
          sections: { schedule: !disabled, results: !disabled, participant_results: !disabled, media: !disabled } };
        break;
      case '/rest/v1/rpc/get_public_snapshot_revision':
        value = disabled ? null : revision();
        break;
      case '/rest/v1/rpc/get_public_leaderboard_settings':
        value = hiddenLeaderboard ? [] : [{ festival_id: festival, is_public_visible: true, show_individual_rankings: true }];
        break;
      case '/rest/v1/rpc/get_public_active_festival_id':
        value = festival;
        break;
      case '/rest/v1/rpc/get_public_leaderboard_scoped':
        value = [{ organisation_id: tenant, organisation_name: tenant, total_points: '12' }];
        break;
      case '/rest/v1/rpc/get_public_team_roster_scoped':
        value = [
          { organisation_id: tenant, organisation_name: tenant },
          { organisation_id: festival, organisation_name: 'Unscored team' },
        ];
        break;
      case '/rest/v1/rpc/get_public_published_results_scoped':
      case '/rest/v1/rpc/get_public_participant_results_scoped':
        value = [{ result_id: tenant, item_id: itemA, item_category_codes: ['G'], rank: '1', points_awarded: '5' }];
        break;
      case '/rest/v1/rpc/get_public_schedules_scoped':
        value = [{ schedule_id: tenant, item_id: itemA, item_name: 'Event', item_category_codes: ['G'] }];
        break;
      case '/rest/v1/items':
        value = [{ id: itemA, item_code: 'ITM' }];
        break;
      default: throw new Error(`Unexpected origin call: ${url.pathname}`);
    }
    return new Response(JSON.stringify(value), { status: 200 });
  };
  return calls;
}

async function snapshot(tenant, headers) {
  const response = await onRequestGet({
    request: new Request(`https://consoulium.example/api/public-snapshot?tenant_id=${tenant}`, { headers }),
    env,
  });
  return { response, body: await response.json() };
}

test('separates tenants and festivals in the shared cache and never forwards admin auth', async () => {
  const cache = fakeCache();
  globalThis.caches = cache;
  const calls = installSource();
  const first = await snapshot(tenantA, { Authorization: 'Bearer admin-session' });
  const repeated = await snapshot(tenantA);
  const second = await snapshot(tenantB);
  assert.equal(first.response.status, 200);
  assert.equal(first.body.festival_id, festivalA);
  assert.equal(repeated.body.festival_id, festivalA);
  assert.equal(second.body.festival_id, festivalB);
  assert.equal(first.body.results[0].item_code, 'ITM');
  assert.equal(first.body.leaderboard[0].total_points, 12);
  assert.equal(first.body.leaderboard[1].total_points, 0);
  assert.equal(first.response.headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(first.response.headers.get('X-Public-Snapshot-Cache'), 'MISS');
  assert.equal(repeated.response.headers.get('X-Public-Snapshot-Cache'), 'HIT');
  assert.equal(calls.filter((call) => call.body.p_tenant_id === tenantA && call.path.includes('/rpc/')).length, 8);
  assert.ok(calls.every((call) => !('Authorization' in call.headers) && call.headers.apikey === env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
  const dataKeys = [...cache.entries.keys()].filter((key) => key.includes('kind=snapshot'));
  assert.equal(dataKeys.length, 2);
  assert.ok(dataKeys.some((key) => key.includes(tenantA) && key.includes(festivalA)));
  assert.ok(dataKeys.some((key) => key.includes(tenantB) && key.includes(festivalB)));
});

test('disabled public page does not read or cache results', async () => {
  globalThis.caches = fakeCache();
  const calls = installSource({ disabled: true });
  const { body } = await snapshot(tenantA);
  assert.equal(body.settings, null);
  assert.deepEqual(body.results, []);
  assert.deepEqual(body.schedules, []);
  assert.ok(calls.every((call) => !call.path.includes('published_results') && !call.path.includes('schedules')));
});

test('hidden leaderboard shows only zero-point teams and public schedules', async () => {
  globalThis.caches = fakeCache();
  const calls = installSource({ hiddenLeaderboard: true });
  const { response, body } = await snapshot(tenantA);
  assert.equal(response.status, 200);
  assert.equal(body.festival_id, festivalA);
  assert.equal(body.settings, null);
  assert.equal(body.schedules.length, 1);
  assert.deepEqual(body.results, []);
  assert.equal(body.leaderboard.length, 2);
  assert.ok(body.leaderboard.every((team) => team.total_points === 0 && team.result_count === 0));
  assert.ok(calls.some((call) => call.path.endsWith('/get_public_active_festival_id')));
  assert.ok(calls.every((call) => !call.path.includes('published_results') && !call.path.includes('leaderboard_scoped')));
});

test('disabled leaderboard module does not read team roster', async () => {
  globalThis.caches = fakeCache();
  const calls = installSource({ leaderboardDisabled: true, hiddenLeaderboard: true });
  const { body } = await snapshot(tenantA);
  assert.deepEqual(body.leaderboard, []);
  assert.ok(calls.every((call) => !call.path.includes('team_roster')));
});

test('bad identifiers and origin failures fail closed', async () => {
  globalThis.caches = fakeCache();
  installSource();
  assert.equal((await snapshot('not-a-tenant')).response.status, 400);
  installSource({ fail: true });
  const failed = await snapshot(tenantB);
  assert.equal(failed.response.status, 503);
  assert.equal(failed.body.results, undefined);
});

test('browser discards a public snapshot at the 60-second boundary', () => {
  const created = Date.parse('2026-11-16T12:00:00.000Z');
  const value = {
    tenant_id: tenantA,
    generated_at: new Date(created).toISOString(),
    expires_at: new Date(created + 60_000).toISOString(),
  };
  assert.equal(readFreshPublicSnapshot(value, tenantA, created + 59_999), value);
  assert.equal(readFreshPublicSnapshot(value, tenantA, created + 60_000), undefined);
  assert.equal(readFreshPublicSnapshot(value, tenantB, created + 1), undefined);
  assert.equal(readFreshPublicSnapshot({ ...value, expires_at: new Date(created + 61_000).toISOString() }, tenantA, created + 1), undefined);
  assert.equal(readFreshPublicSnapshot(value, tenantA, created + 3600_000, created + 3590_000), value);
  assert.equal(readFreshPublicSnapshot(value, tenantA, created + 3650_000, created + 3590_000), undefined);
});

test('browser preserves snapshot under clock skew behind server generated_at', () => {
  const created = Date.parse('2026-11-16T12:00:00.000Z');
  const value = {
    tenant_id: tenantA,
    generated_at: new Date(created).toISOString(),
    expires_at: new Date(created + 60_000).toISOString(),
  };
  assert.equal(readFreshPublicSnapshot(value, tenantA, created - 2_500), value);
  assert.equal(readFreshPublicSnapshot(value, tenantA, created - 31_000), undefined);
  assert.equal(readFreshPublicSnapshot(value, tenantA, created - 600_000, created - 600_000), value);
});

test('version checks return a small revision without reading snapshot data', async () => {
  globalThis.caches = fakeCache();
  const calls = installSource();
  const request = new Request(`https://consoulium.example/api/public-version?tenant_id=${tenantA}`);
  const response = await onRequestGetVersion({ request, env });
  const body = await response.json();
  assert.equal(body.tenant_id, tenantA);
  assert.equal(body.revision, '1');
  assert.ok(Number.isFinite(Date.parse(body.checked_at)));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/rest/v1/rpc/get_public_snapshot_revision');
});

test('a changed revision does not reuse the prior context or snapshot cache', async () => {
  const cache = fakeCache();
  globalThis.caches = cache;
  let currentRevision = 1;
  const calls = installSource({ revision: () => currentRevision });
  const first = await snapshot(tenantA);
  assert.equal(first.body.revision, '1');
  currentRevision = 2;
  for (const key of cache.entries.keys()) {
    if (key.includes('kind=version')) cache.entries.delete(key);
  }
  const next = await snapshot(tenantA);
  assert.equal(next.body.revision, '2');
  assert.equal(next.response.headers.get('X-Public-Snapshot-Cache'), 'MISS');
  assert.equal(calls.filter((call) => call.path.endsWith('/get_public_published_results_scoped')).length, 2);
});

test('supports ETag 304 conditional requests, long revision-keyed snapshot TTL, and invalidates on revision change', async () => {
  const cache = fakeCache();
  globalThis.caches = cache;
  let currentRevision = 7;
  const calls = installSource({ revision: () => currentRevision });

  const first = await snapshot(tenantA);
  assert.equal(first.response.status, 200);
  const etag = first.response.headers.get('ETag');
  assert.equal(etag, `W/"snap:${tenantA}:${festivalA}:7"`);

  // Revision-keyed context & snapshot cache entries persist well beyond 5s (300s TTL)
  const snapCacheEntry = [...cache.entries.entries()].find(([k]) => k.includes('kind=snapshot'));
  assert.ok(snapCacheEntry);
  assert.ok(snapCacheEntry[1].expires - Date.now() > 60_000);

  // Repeated request with matching ETag & unchanged revision -> 304 without heavy RPC calls
  const cond = await onRequestGet({
    request: new Request(`https://consoulium.example/api/public-snapshot?tenant_id=${tenantA}`, {
      headers: { 'If-None-Match': etag },
    }),
    env,
  });
  assert.equal(cond.status, 304);
  assert.equal(cond.headers.get('ETag'), etag);
  assert.equal(calls.filter((call) => call.path.endsWith('/get_public_published_results_scoped')).length, 1);

  // Publish/hide bumps revision -> old ETag does NOT get 304, returns 200 with fresh data and new ETag
  currentRevision = 8;
  for (const key of cache.entries.keys()) {
    if (key.includes('kind=version')) cache.entries.delete(key);
  }
  const updatedRes = await onRequestGet({
    request: new Request(`https://consoulium.example/api/public-snapshot?tenant_id=${tenantA}`, {
      headers: { 'If-None-Match': etag },
    }),
    env,
  });
  assert.equal(updatedRes.status, 200);
  assert.equal(updatedRes.headers.get('ETag'), `W/"snap:${tenantA}:${festivalA}:8"`);
  const updatedBody = await updatedRes.json();
  assert.equal(updatedBody.revision, '8');
});

test('passes ranking_mode, item_limit, and limit_public_results settings through to snapshot consumers', async () => {
  globalThis.caches = fakeCache();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    switch (url.pathname) {
      case '/rest/v1/rpc/get_public_tenant_feature_settings':
        return new Response(JSON.stringify({
          public_page: true,
          public_leaderboard: true,
          sections: { schedule: true, results: true, participant_results: true, media: true },
        }), { status: 200 });
      case '/rest/v1/rpc/get_public_snapshot_revision':
        return new Response(JSON.stringify(12), { status: 200 });
      case '/rest/v1/rpc/get_public_leaderboard_settings':
        return new Response(JSON.stringify([{
          festival_id: festivalA,
          is_public_visible: true,
          show_individual_rankings: true,
          show_competition_points_grades: true,
          ranking_mode: 'LIMITED',
          item_limit: 60,
          limit_public_results: true,
        }]), { status: 200 });
      case '/rest/v1/rpc/get_public_leaderboard_scoped':
        return new Response(JSON.stringify([{ organisation_id: tenantA, organisation_name: 'Unit A', total_points: '600' }]), { status: 200 });
      case '/rest/v1/rpc/get_public_team_roster_scoped':
        return new Response(JSON.stringify([{ organisation_id: tenantA, organisation_name: 'Unit A' }]), { status: 200 });
      case '/rest/v1/rpc/get_public_published_results_scoped':
      case '/rest/v1/rpc/get_public_participant_results_scoped':
        return new Response(JSON.stringify([{ result_id: 'r-60', item_id: itemA, item_category_codes: ['SR'], rank: '1', points_awarded: '10' }]), { status: 200 });
      case '/rest/v1/rpc/get_public_schedules_scoped':
        return new Response(JSON.stringify([]), { status: 200 });
      case '/rest/v1/items':
        return new Response(JSON.stringify([{ id: itemA, item_code: 'IT60' }]), { status: 200 });
      default:
        throw new Error(`Unexpected origin call: ${url.pathname}`);
    }
  };
  try {
    const { response, body } = await snapshot(tenantA);
    assert.equal(response.status, 200);
    assert.equal(body.settings.ranking_mode, 'LIMITED');
    assert.equal(body.settings.item_limit, 60);
    assert.equal(body.settings.limit_public_results, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('paginates results and participant_results in 500-row chunks beyond 1,000 rows without truncation', async () => {
  globalThis.caches = fakeCache();
  const origFetch = globalThis.fetch;
  const totalRows = 1250;
  const makeRow = (i) => ({
    result_id: `res-${i}`,
    item_id: itemA,
    item_category_codes: ['SR'],
    rank: '1',
    points_awarded: '5',
  });
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    const limit = Number(url.searchParams.get('limit') || '500');
    const offset = Number(url.searchParams.get('offset') || '0');
    switch (url.pathname) {
      case '/rest/v1/rpc/get_public_tenant_feature_settings':
        return new Response(JSON.stringify({
          public_page: true,
          public_leaderboard: true,
          sections: { schedule: true, results: true, participant_results: true, media: true },
        }), { status: 200 });
      case '/rest/v1/rpc/get_public_snapshot_revision':
        return new Response(JSON.stringify(99), { status: 200 });
      case '/rest/v1/rpc/get_public_leaderboard_settings':
        return new Response(JSON.stringify([{
          festival_id: festivalA,
          is_public_visible: true,
          show_individual_rankings: true,
          ranking_mode: 'LIMITED',
          item_limit: 80,
          limit_public_results: true,
        }]), { status: 200 });
      case '/rest/v1/rpc/get_public_leaderboard_scoped':
        return new Response(JSON.stringify([{ organisation_id: tenantA, organisation_name: 'Unit A', total_points: '100' }]), { status: 200 });
      case '/rest/v1/rpc/get_public_team_roster_scoped':
        return new Response(JSON.stringify([{ organisation_id: tenantA, organisation_name: 'Unit A' }]), { status: 200 });
      case '/rest/v1/rpc/get_public_published_results_scoped':
      case '/rest/v1/rpc/get_public_participant_results_scoped': {
        assert.equal(limit, 500);
        const end = Math.min(offset + limit, totalRows);
        const slice = Array.from({ length: Math.max(0, end - offset) }, (_, idx) => makeRow(offset + idx));
        const rangeHeader = slice.length > 0 ? `${offset}-${offset + slice.length - 1}/${totalRows}` : `*/${totalRows}`;
        return new Response(JSON.stringify(slice), {
          status: slice.length < totalRows ? 206 : 200,
          headers: { 'Content-Range': rangeHeader },
        });
      }
      case '/rest/v1/rpc/get_public_schedules_scoped':
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Range': '*/0' } });
      case '/rest/v1/items':
        return new Response(JSON.stringify([{ id: itemA, item_code: 'IT80' }]), { status: 200 });
      default:
        throw new Error(`Unexpected origin call: ${url.pathname}`);
    }
  };
  try {
    const { response, body } = await snapshot(tenantA);
    assert.equal(response.status, 200);
    assert.equal(body.results.length, 1250);
    assert.equal(body.participant_results.length, 1250);
    assert.equal(body.results[0].result_id, 'res-0');
    assert.equal(body.results[1249].result_id, 'res-1249');
  } finally {
    globalThis.fetch = origFetch;
  }
});
