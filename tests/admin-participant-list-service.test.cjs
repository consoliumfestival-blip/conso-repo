/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/services/adminParticipantListService.ts'), 'utf8');
function serviceWith(client) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (name === '../core/config/supabase') return { supabase: client };
    throw new Error(`Unexpected import: ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}
const filters = { search: 'Name', category: 'JR', status: 'Pending', gender: 'Boys', festivalId: 'festival', itemId: 'item', competitionCategory: 'JR' };
function clientFor(rows, changes = {}) {
  const calls = [];
  return { calls, client: { rpc(name, args, options) {
    calls.push({ name, args, options });
    const builder = { select() { return this; }, order() { return this; }, abortSignal(signal) { calls[calls.length - 1].signal = signal; return this; }, async range(start, end) {
      const index = calls.length - 1;
      if (changes.failAt === index) return { data: null, count: null, error: new Error('Read failed') };
      return { data: rows.slice(start, end + 1), count: rows.length + (changes.changeCountAt === index ? 1 : 0), error: null };
    } };
    return builder;
  } } };
}
test('page requests filters and inclusive backend range', async () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: String(i) }));
  const { client, calls } = clientFor(rows);
  const result = await serviceWith(client).loadAdminParticipantPage(filters, 1, 50);
  assert.deepEqual(result.participants, rows.slice(50,100)); assert.equal(result.count, 120);
  assert.equal(calls[0].name, 'admin_filtered_participants');
  assert.deepEqual(calls[0].args, { p_search: 'Name', p_category: 'JR', p_status: 'Pending', p_gender: 'Boys', p_festival_id: 'festival', p_item_id: 'item', p_competition_category: 'JR' });
});
test('page query forwards the cancellation signal to Supabase', async () => {
  const { client, calls } = clientFor([{ id: 'one' }]);
  const controller = new AbortController();
  await serviceWith(client).loadAdminParticipantPage(filters, 0, 50, controller.signal);
  assert.equal(calls[0].signal, controller.signal);
});
test('page and category RPC responses must be row lists', async () => {
  const client = { rpc() { return { select() { return this; }, order() { return this; }, async range() { return { data: { id: 'unexpected-object' }, count: 1, error: null }; } }; } };
  await assert.rejects(serviceWith(client).loadAdminParticipantPage(filters, 0, 50), /response was not a row list/);
  await assert.rejects(serviceWith(client).loadAdminParticipantCategories(), /response was not a row list/);
});
test('category options use distinct backend query', async () => {
  const calls = [];
  const client = { rpc(name) { calls.push(name); return { select() { return this; }, order() { return this; }, async range() { return { data: [{ category_code: 'Senior' }, { category_code: 'Junior' }], error: null }; } }; } };
  assert.deepEqual(await serviceWith(client).loadAdminParticipantCategories(), ['Junior', 'Senior']);
  assert.deepEqual(calls, ['admin_participant_categories']);
});
test('full-result load spans batches for export and select all', async () => {
  const rows = Array.from({ length: 1101 }, (_, i) => ({ id: String(i) }));
  const { client, calls } = clientFor(rows);
  assert.deepEqual(await serviceWith(client).loadAllAdminParticipants(filters), rows);
  assert.equal(calls.length, 3);
});
test('full-result load fails closed on request failure or changing count', async () => {
  const rows = Array.from({ length: 600 }, (_, i) => ({ id: String(i) }));
  for (const changes of [{ failAt: 1 }, { changeCountAt: 1 }]) {
    const { client } = clientFor(rows, changes);
    await assert.rejects(serviceWith(client).loadAllAdminParticipants(filters));
  }
});

function tableClient(datasets, failTable) {
  const calls = [];
  return { calls, client: { from(table) {
    const entry = { table, filters: [] }; calls.push(entry);
    let rows = datasets[table].filter(row => row.visible !== false);
    const q = {
      select(columns) {
        entry.columns = columns;
        if (columns.includes('registrations!inner')) {
          rows = rows.flatMap(row => {
            const registration = datasets.registrations.find(r => r.id === row.registration_id && r.visible !== false);
            return registration ? [{ ...row, registrations: registration }] : [];
          });
        }
        return this;
      }, order() { rows.sort((a, b) => a.id.localeCompare(b.id)); return this; },
      limit(n) { this.n = n; return this; },
      eq(field, value) { entry.filters.push(['eq', field, value]); rows = rows.filter(row => field.split('.').reduce((value, key) => value?.[key], row) === value); return this; },
      is(field, value) { entry.filters.push(['is', field, value]); rows = rows.filter(row => row[field] == null); return this; },
      gt(field, value) { entry.filters.push(['gt', field, value]); rows = rows.filter(row => row[field] > value); return this; },
      in(field, values) { entry.filters.push(['in', field, [...values]]); rows = rows.filter(row => values.includes(row[field])); return this; },
      then(resolve, reject) { return Promise.resolve(table === failTable ? { data: null, error: new Error('Read failed') } : { data: rows.slice(0, this.n), error: null }).then(resolve, reject); },
    }; return q;
  } } };
}

test('team report candidates preserve direct and group fallback and exclude other teams', async () => {
  const datasets = {
    participants: [
      { id: '01', festival_id: 'f', organisation_id: 'team-a', organisations: { name: 'A' } },
      { id: '02', festival_id: 'f', organisation_id: 'team-b', organisations: { name: 'B' } },
      { id: '03', festival_id: 'f', organisation_id: 'team-a', organisations: { name: 'A' } },
    ],
    registrations: [
      { id: '11', festival_id: 'f', item_id: 'item-a', organisation_id: 'team-a', participant_id: '01' },
      { id: '12', festival_id: 'f', item_id: 'item-b', organisation_id: null, participant_id: null },
      { id: '13', festival_id: 'f', item_id: 'item-b', organisation_id: null, participant_id: '01' },
      { id: '14', festival_id: 'f', item_id: 'item-b', organisation_id: null, participant_id: '02' },
      { id: '15', festival_id: 'f', item_id: 'item-b', organisation_id: null, participant_id: null },
      { id: '16', festival_id: 'f', item_id: 'item-b', organisation_id: 'team-b', participant_id: '01' },
      { id: '17', festival_id: 'f', item_id: 'item-b', organisation_id: null, participant_id: '02' },
      { id: '18', festival_id: 'other', item_id: 'item-b', organisation_id: null, participant_id: '01' },
      { id: '19', festival_id: 'other', organisation_id: null, participant_id: null },
      { id: '20', festival_id: 'f', organisation_id: null, participant_id: null, visible: false },
    ],
    group_members: [
      { id: '21', registration_id: '12', participant_id: '01' },
      { id: '22', registration_id: '12', participant_id: '03' },
      { id: '23', registration_id: '15', participant_id: '02' },
      { id: '24', registration_id: '17', participant_id: '01' },
      { id: '25', registration_id: '19', participant_id: '01' },
      { id: '26', registration_id: '20', participant_id: '01' },
    ],
  };
  const { client, calls } = tableClient(datasets);
  const service = serviceWith(client);
  const people = await service.loadAdminExportPeople('f', 'team-a', null);
  const team = await service.loadAdminTeamExportRegistrations('f', 'team-a', people.map(p => p.id));
  assert.deepEqual(team.map(r => r.id), ['11', '12', '13']);
  const discoveryCalls = calls.filter(c => c.table === 'group_members');
  assert.ok(discoveryCalls.length > 0);
  assert.ok(discoveryCalls.every(c => c.columns.includes('registrations!inner') && c.filters.some(f => f[1] === 'registrations.festival_id' && f[2] === 'f')));
  assert.deepEqual((await service.loadAdminExportGroupMembers(team)).map(r => r.participant_id), ['01', '03']);
  assert.deepEqual((await service.loadAdminExportGroupMembers(team, ['01'])).map(r => r.participant_id), ['01']);
  assert.deepEqual((await service.loadAdminExportRegistrations('f', 'item-a')).map(r => r.id), ['11']);
  const teamRegistrationCalls = calls.filter(c => c.table === 'registrations').slice(0, -2);
  assert.ok(teamRegistrationCalls.every(c => c.filters.some(f => f[1] === 'organisation_id')));
  assert.ok(teamRegistrationCalls.filter(c => c.filters.some(f => f[0] === 'is' && f[1] === 'organisation_id')).every(c => c.filters.some(f => f[0] === 'in')));
});

test('team report chunks IDs, paginates membership, deduplicates and propagates failures', async () => {
  const ids = Array.from({ length: 101 }, (_, i) => `p${String(i).padStart(3, '0')}`);
  const datasets = {
    participants: [],
    registrations: ids.map((id, i) => ({ id: `r${String(i).padStart(3, '0')}`, festival_id: 'f', organisation_id: null, participant_id: null })),
    group_members: Array.from({ length: 602 }, (_, i) => ({ id: `m${String(i).padStart(4, '0')}`, registration_id: `r${String(i % 101).padStart(3, '0')}`, participant_id: ids[i % 101] })),
  };
  const { client, calls } = tableClient(datasets);
  const result = await serviceWith(client).loadAdminTeamExportRegistrations('f', 'team-a', [...ids, ids[0]]);
  assert.equal(result.length, 101);
  assert.equal(new Set(result.map(r => r.id)).size, 101);
  const inFilters = calls.flatMap(c => c.filters.filter(f => f[0] === 'in'));
  assert.ok(inFilters.every(f => f[2].length > 0 && f[2].length <= 100));
  assert.ok(calls.some(c => c.table === 'group_members' && c.filters.some(f => f[0] === 'gt')));
  assert.equal(calls.filter(c => c.table === 'registrations' && c.filters.some(f => f[0] === 'in' && f[1] === 'id') && !c.filters.some(f => f[0] === 'gt')).length, 2);
  await assert.rejects(serviceWith(tableClient(datasets, 'group_members').client).loadAdminTeamExportRegistrations('f', 'team-a', ids), /Read failed/);
  const empty = tableClient(datasets);
  await serviceWith(empty.client).loadAdminTeamExportRegistrations('f', 'team-a', []);
  assert.ok(empty.calls.every(c => !c.filters.some(f => f[0] === 'in')));
});

test('Supabase client sends count, embedding, filters and range to PostgREST', async () => {
  const { createClient } = require('@supabase/supabase-js');
  let request;
  const client = createClient('http://localhost:54321', 'local-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      request = { url: new URL(url), options };
      return new Response(JSON.stringify([{ id: '1' }]), { status: 200, headers: { 'content-type': 'application/json', 'content-range': '50-50/101' } });
    } },
  });
  const result = await serviceWith(client).loadAdminParticipantPage(filters, 1, 50);
  assert.equal(result.count, 101);
  assert.equal(request.url.pathname, '/rest/v1/rpc/admin_filtered_participants');
  assert.equal(request.url.searchParams.get('offset'), '50');
  assert.equal(request.url.searchParams.get('limit'), '50');
  assert.match(request.url.searchParams.get('select'), /organisations/);
  assert.match(request.options.headers.get('Prefer'), /count=exact/);
  assert.equal(JSON.parse(request.options.body).p_item_id, 'item');
});

test('team membership HTTP reads require an inner registration join and festival filter', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const requests = [];
  const client = createClient('http://localhost:54321', 'local-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => {
      requests.push(new URL(url));
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  await serviceWith(client).loadAdminTeamExportRegistrations('festival-a', 'team-a', ['person-a']);
  const memberships = requests.filter(url => url.pathname.endsWith('/group_members'));
  assert.equal(memberships.length, 1);
  assert.match(memberships[0].searchParams.get('select'), /registrations!inner\(festival_id\)/);
  assert.equal(memberships[0].searchParams.get('registrations.festival_id'), 'eq.festival-a');
  assert.equal(memberships[0].searchParams.get('participant_id'), 'in.(person-a)');
});


