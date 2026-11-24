const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const providerFile = path.join(process.cwd(), 'src/providers/database/SupabaseDatabaseProvider.ts');
const providerCode = ts.transpileModule(fs.readFileSync(providerFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function createProvider(allRows, failAt = -1) {
  const calls = [];
  const supabase = {
    rpc(name, args, options) {
      assert.equal(name, 'get_admin_published_results');
      assert.equal(args.p_tenant_id, 'tenant');
      assert.equal(args.p_festival_id, 'festival');
      return {
        order() { return this; },
        async range(from, to) {
          calls.push([from, to]);
          if (from === failAt) return { data: null, error: { code: 'TEST_ERROR', message: 'Page failed' }, count: null };
          return {
            data: allRows.slice(from, to + 1),
            error: null,
            count: options?.count === 'exact' ? allRows.length : null,
          };
        },
      };
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(providerCode, {
    module,
    exports: module.exports,
    require: (id) => id.includes('/config/supabase') ? { supabase } : {},
  }, { filename: providerFile });
  return { provider: new module.exports.SupabaseDatabaseProvider(), calls };
}

test('admin published results include every page beyond the API row limit', async () => {
  const rows = Array.from({ length: 1631 }, (_, result_id) => ({ result_id }));
  const { provider, calls } = createProvider(rows);
  const result = await provider.listAdminPublishedResults('tenant', 'festival');
  assert.equal(result.error, null);
  assert.deepEqual(Array.from(result.data, (row) => row.result_id), rows.map((row) => row.result_id));
  assert.deepEqual(calls, [[0, 499], [500, 999], [1000, 1499], [1500, 1999]]);
});

test('admin published results include all rows across twenty 500-row pages', async () => {
  const rows = Array.from({ length: 10001 }, (_, result_id) => ({ result_id }));
  const { provider, calls } = createProvider(rows);
  const result = await provider.listAdminPublishedResults('tenant', 'festival');
  assert.equal(result.error, null);
  assert.equal(result.data.length, rows.length);
  assert.equal(result.data[10000].result_id, 10000);
  assert.equal(calls.length, 21);
  assert.deepEqual(calls[20], [10000, 10499]);
});

test('admin published results never expose partial standings after a page error', async () => {
  const { provider } = createProvider(Array.from({ length: 1200 }, (_, result_id) => ({ result_id })), 500);
  const result = await provider.listAdminPublishedResults('tenant', 'festival');
  assert.equal(result.error?.code, 'TEST_ERROR');
  assert.equal(result.data.length, 0);
});

test('an exact page multiple stops without requesting an out-of-range page', async () => {
  const { provider, calls } = createProvider(Array.from({ length: 1000 }, (_, result_id) => ({ result_id })));
  const result = await provider.listAdminPublishedResults('tenant', 'festival');
  assert.equal(result.error, null);
  assert.equal(result.data.length, 1000);
  assert.deepEqual(calls, [[0, 499], [500, 999]]);
});
