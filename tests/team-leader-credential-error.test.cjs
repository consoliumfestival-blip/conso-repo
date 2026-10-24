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

test('reset returns a separate trimmed username and preserves all six password digits', async () => {
  const service = loadService({ data: { success: true, username: '  leader  ', password: '001234' }, error: null });
  const result = await service.resetPassword('user', 'festival');
  assert.equal(result.username, 'leader');
  assert.equal(result.password, '001234');
});

test('malformed reset responses are not presented as usable credentials', async () => {
  for (const data of [
    { success: true, username: '', password: '001234' },
    { success: true, username: 'leader', password: 'letters' },
    { success: true, username: 'leader', password: '1234567' },
  ]) {
    const service = loadService({ data, error: null });
    await assert.rejects(service.resetPassword('user', 'festival'), /reset response/);
  }
});

test('a completed setup response directs a retrying user back to sign in', async () => {
  const service = loadService({ data: null, error: {
    context: { json: async () => ({ error: 'CREDENTIAL_CHANGE_NOT_REQUIRED', message: 'Credential setup is not required.' }) },
  } });
  await assert.rejects(service.selfUpdateCredentials(null, '012345'), /Sign in again/);
});
