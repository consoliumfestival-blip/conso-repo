const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/services/teamLeaderPortalService.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadService(invokeResult) {
  const exports = {};
  const supabase = { functions: { invoke: async () => invokeResult } };
  vm.runInNewContext(compiled, {
    exports,
    require: id => {
      assert.equal(id, '@/core/config/supabase');
      return { supabase };
    },
    Error,
  });
  return exports.teamLeaderPortalService;
}

test('self credential update surfaces the Edge Function message from a non-2xx response', async () => {
  const service = loadService({
    data: null,
    error: {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => ({ error: 'USERNAME_CHANGE_REQUIRED', message: 'Choose a username different from the temporary username.' }) },
    },
  });

  await assert.rejects(
    service.selfUpdateCredentials('tl289984', 'new-password'),
    { message: 'Choose a username different from the temporary username.' },
  );
});

test('self credential update keeps the standard invoke message when no response body is available', async () => {
  const service = loadService({
    data: null,
    error: { message: 'Network request failed', context: { json: async () => { throw new Error('No JSON'); } } },
  });

  await assert.rejects(service.selfUpdateCredentials('new-user', 'new-password'), { message: 'Network request failed' });
});
