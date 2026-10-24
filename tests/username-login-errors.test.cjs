const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/providers/auth/SupabaseAuthProvider.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadProvider(invokeResult) {
  const exports = {};
  const supabase = { functions: { invoke: async () => invokeResult } };
  vm.runInNewContext(compiled, {
    exports,
    require: id => {
      assert.equal(id, '../../core/config/supabase');
      return { supabase };
    },
  });
  return new exports.SupabaseAuthProvider();
}

test('wrong credentials stay generic', async () => {
  const provider = loadProvider({ data: null, error: {
    context: { status: 401, json: async () => ({ error: 'INVALID_CREDENTIALS' }) },
  } });
  const result = await provider.resolveUsernameLogin('unknown', 'wrong-password', 'team_leader');
  assert.equal(result.error.code, 'INVALID_CREDENTIALS');
  assert.equal(result.error.message, 'Invalid username or password.');
});

test('rate limits are not reported as a wrong password', async () => {
  const provider = loadProvider({ data: null, error: {
    context: { status: 429, json: async () => ({ error: 'RATE_LIMITED' }) },
  } });
  const result = await provider.resolveUsernameLogin('user', 'password');
  assert.equal(result.error.code, 'RATE_LIMITED');
});

test('server failures are not reported as a wrong password', async () => {
  const provider = loadProvider({ data: null, error: {
    context: { status: 503, json: async () => ({ error: 'LOGIN_UNAVAILABLE' }) },
  } });
  const result = await provider.resolveUsernameLogin('user', 'password');
  assert.equal(result.error.code, 'LOGIN_UNAVAILABLE');
});

test('network failures are not reported as a wrong password', async () => {
  const provider = loadProvider({ data: null, error: { message: 'Failed to fetch' } });
  const result = await provider.resolveUsernameLogin('user', 'password');
  assert.equal(result.error.code, 'LOGIN_CONNECTION_ERROR');
});

test('malformed successful responses do not claim a wrong password', async () => {
  const provider = loadProvider({ data: { success: true }, error: null });
  const result = await provider.resolveUsernameLogin('user', 'password');
  assert.equal(result.error.code, 'LOGIN_UNAVAILABLE');
});

test('Team Leader login trims only the username, preserving the password exactly', async () => {
  const authSource = fs.readFileSync(path.join(__dirname, '../src/services/authService.ts'), 'utf8');
  const authCompiled = ts.transpileModule(authSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const authProvider = {
    resolveUsernameLogin: async (...args) => {
      calls.push(args);
      return { data: { session: { access_token: 'access', refresh_token: 'refresh' } }, error: null };
    },
    getProfile: async () => ({ data: { role: 'team_leader', tenant_id: null }, error: null }),
  };
  const supabase = { auth: { setSession: async () => ({ data: { user: { id: 'user-id' } }, error: null }) } };
  const exports = {};
  vm.runInNewContext(authCompiled, {
    exports,
    require: id => {
      if (id === '../providers/auth') return { authProvider };
      if (id === '../core/config/supabase') return { supabase };
      throw new Error(`Unexpected import: ${id}`);
    },
  });
  await exports.authService.loginTeamLeader('  leader  ', ' password ');
  assert.deepEqual(calls[0], ['leader', ' password ', 'team_leader']);
});
