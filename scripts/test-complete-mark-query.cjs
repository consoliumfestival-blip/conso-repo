const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function createProvider(failOnPage = 0) {
  const calls = [];
  const rpcCalls = [];
  const marks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  let page = 0;
  const supabase = {
    async rpc(name, args) { rpcCalls.push({ name, args }); return { error: null }; },
    from(table) {
      let cursor;
      const q = {
        select() { return q; }, eq() { return q; }, in() { return q; },
        order() { return q; }, limit() { return q; },
        gt(_column, value) { cursor = value; return q; },
        then(resolve, reject) {
          if (table === 'schedule_judge_assignments') return Promise.resolve({ data: [{ judge_id: 'j' }], error: null }).then(resolve, reject);
          page += 1;
          calls.push(cursor ?? null);
          if (page === failOnPage) return Promise.resolve({ data: null, error: { message: 'page failed' } }).then(resolve, reject);
          // Simulate a server cap below the requested 500 rows.
          const rows = marks.filter(mark => !cursor || mark.id > cursor).slice(0, 2);
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  const source = fs.readFileSync('src/providers/database/SupabaseDatabaseProvider.ts', 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(output, { module: loaded, exports: loaded.exports, require: name => {
    if (name === '../../core/config/supabase') return { supabase };
    if (name === '../../types/scoring') return { competitionArguments: input => ({ p_schedule_id: input.scheduleId, p_mode: input.mode }) };
    throw new Error(`Unexpected import: ${name}`);
  } });
  return { provider: new loaded.exports.SupabaseDatabaseProvider(), calls, rpcCalls };
}

test('complete result query follows the cursor until empty despite a smaller server cap', async () => {
  const { provider, calls } = createProvider();
  const result = await provider.listMarkEntries('schedule', true);
  assert.equal(result.error, null);
  assert.equal(result.data.map(row => row.id).join(','), 'a,b,c');
  assert.deepEqual(calls, [null, 'b', 'c']);
});

test('a failed later page returns an error instead of a partial mark list', async () => {
  const { provider } = createProvider(2);
  const result = await provider.listMarkEntries('schedule', true);
  assert.equal(result.error.message, 'page failed');
  assert.equal(result.data.length, 0);
});

test('other mark screens keep their existing single-request path', async () => {
  const { provider, calls } = createProvider();
  const result = await provider.listMarkEntries('schedule');
  assert.equal(result.data.length, 2);
  assert.deepEqual(calls, [null]);
});

test('both direct and judge publication close codes through the new transaction', async () => {
  const { provider, rpcCalls } = createProvider();
  const base = { scheduleId: 'schedule', requestId: 'request', mode: 'manual' };
  await provider.publishResults(base);
  await provider.publishResults({ ...base, mode: 'judges', confirmedMissingMarks: [{ registration_id: 'r', judge_id: 'j' }], zeroMaximum: 100 });
  assert.equal(rpcCalls.length, 2);
  assert.ok(rpcCalls.every(call => call.name === 'publish_results_closing_judge_codes'));
  assert.equal(rpcCalls[0].args.p_missing.length, 0);
  assert.equal(rpcCalls[1].args.p_missing[0].registration_id, 'r');
});
