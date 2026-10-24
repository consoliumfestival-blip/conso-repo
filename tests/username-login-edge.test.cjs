const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/resolve-login-identifier/index.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadHandler({ resolution = { data: 'internal@example.test', error: null }, auth = { data: null, error: { status: 400 } } } = {}) {
  let handler;
  const calls = [];
  const admin = {
    rpc: async (name) => name === 'consume_username_login_attempt'
      ? { data: true, error: null }
      : resolution,
    auth: {
      signInWithPassword: async (credentials) => {
        calls.push(credentials);
        return auth;
      },
    },
  };
  vm.runInNewContext(compiled, {
    exports: {},
    require: id => {
      if (id.includes('deno.land/std')) return { serve: callback => { handler = callback; } };
      if (id.includes('supabase-js')) return { createClient: () => admin };
      throw new Error(`Unexpected import: ${id}`);
    },
    Deno: { env: { get: () => 'test-value' } },
    TextEncoder,
    crypto: webcrypto,
    Response,
  });
  return { handler, calls };
}

async function login(handler) {
  return handler(new Request('https://example.test/functions/v1/resolve-login-identifier', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'leader', password: 'example-password', login_type: 'team_leader' }),
  }));
}

test('resolver outage is not reported as invalid credentials', async () => {
  const { handler, calls } = loadHandler({ resolution: { data: null, error: { code: 'DB_UNAVAILABLE' } } });
  const response = await login(handler);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'LOGIN_UNAVAILABLE');
  assert.equal(calls.length, 0);
});

test('unknown username remains indistinguishable from a wrong password', async () => {
  const { handler, calls } = loadHandler({ resolution: { data: null, error: null } });
  const response = await login(handler);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'INVALID_CREDENTIALS');
  assert.equal(calls.length, 1);
  assert.match(calls[0].email, /^invalid_[0-9a-f]+@sahi\.local$/);
});

test('Auth server outage is not reported as invalid credentials', async () => {
  const { handler } = loadHandler({ auth: { data: null, error: { status: 503 } } });
  const response = await login(handler);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'LOGIN_UNAVAILABLE');
});

test('valid login still returns a session', async () => {
  const { handler } = loadHandler({ auth: {
    data: { session: { access_token: 'access', refresh_token: 'refresh' }, user: { id: 'user-id', user_metadata: {} } },
    error: null,
  } });
  const response = await login(handler);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});
