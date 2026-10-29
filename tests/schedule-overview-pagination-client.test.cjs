const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/services/scheduleOverviewService.ts'), 'utf8');

function loadService(respond) {
  const calls = [];
  const moduleObject = { exports: {} };
  const requireStub = (name) => {
    if (name.endsWith('/core/config/supabase')) {
      return { supabase: { rpc: (rpcName, args) => {
        calls.push({ rpcName, args });
        return Promise.resolve(respond(rpcName, args));
      } } };
    }
    return {};
  };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', compiled)(requireStub, moduleObject, moduleObject.exports);
  return { service: moduleObject.exports.scheduleOverviewService, calls };
}

test('PDF export traverses every filtered page with the same filter scope and never exports only the visible page', async () => {
  const { service, calls } = loadService((_name, args) => {
    const start = (args.p_page - 1) * args.p_page_size;
    const count = Math.max(0, Math.min(args.p_page_size, 251 - start));
    return {
      data: {
        total_count: 251,
        festival_total_count: 800,
        as_of: '2026-10-29T12:00:00.000Z',
        rows: Array.from({ length: count }, (_, index) => ({ id: `s-${start + index + 1}`, item_id: 'i-1' })),
      },
      error: null,
    };
  });
  const filters = {
    tenantId: 'tenant-1', festivalId: 'festival-1', search: 'speech', itemId: 'item-1',
    category: 'LP', venueId: 'venue-1', date: '2026-10-28', workflowStatus: 'scheduled', timezone: 'Asia/Kolkata',
  };
  const rows = await service.allFiltered(filters);
  assert.equal(rows.length, 251);
  assert.deepEqual(calls.map(({ args }) => [args.p_page, args.p_page_size]), [[1,100],[2,100],[3,100]]);
  assert.deepEqual(calls.map(({ args }) => args.p_as_of), [null,'2026-10-29T12:00:00.000Z','2026-10-29T12:00:00.000Z'], 'export keeps relevance ordering anchored to the first database read');
  for (const { rpcName, args } of calls) {
    assert.equal(rpcName, 'admin_schedule_overview_page');
    for (const [key, value] of Object.entries({ p_tenant_id: 'tenant-1', p_festival_id: 'festival-1', p_search: 'speech', p_item_id: 'item-1', p_category: 'LP', p_venue_id: 'venue-1', p_date: '2026-10-28', p_workflow_status: 'scheduled', p_timezone: 'Asia/Kolkata' })) {
      assert.equal(args[key], value, `${key} stays consistent across export pages`);
    }
  }
});

test('PDF export fails instead of silently returning incomplete results when page traversal stops early', async () => {
  const { service } = loadService((_name, args) => ({
    data: { total_count: 201, festival_total_count: 201, rows: args.p_page === 1 ? Array.from({ length: 100 }, (_, index) => ({ id: `s-${index}` })) : [] },
    error: null,
  }));
  await assert.rejects(service.allFiltered({ tenantId: 'tenant-1', festivalId: 'festival-1' }), /changed during PDF export/);
});

test('PDF export aborts if the matching count changes between bounded page reads', async () => {
  const { service } = loadService((_name, args) => ({
    data: {
      total_count: args.p_page === 1 ? 201 : 200,
      festival_total_count: 201,
      rows: Array.from({ length: 100 }, (_, index) => ({ id: `s-${(args.p_page - 1) * 100 + index + 1}` })),
    },
    error: null,
  }));
  await assert.rejects(service.allFiltered({ tenantId: 'tenant-1', festivalId: 'festival-1' }), /changed during PDF export/);
});

test('PDF export aborts if changing sort positions cause duplicate rows across pages', async () => {
  const { service } = loadService((_name, args) => ({
    data: {
      total_count: 101,
      festival_total_count: 101,
      rows: args.p_page === 1
        ? Array.from({ length: 100 }, (_, index) => ({ id: `s-${index + 1}` }))
        : [{ id: 's-100' }],
    },
    error: null,
  }));
  await assert.rejects(service.allFiltered({ tenantId: 'tenant-1', festivalId: 'festival-1' }), /changed during PDF export/);
});
