const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/provision-team-leader/index.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ visible = true, username = 'teamalpha', callerRole = 'admin' } = {}) {
  const authUpdates = [];
  const target = { id: 'leader-id', user_metadata: { full_name: 'Leader' }, app_metadata: { tenant: 'original' } };
  const admin = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-id' } }, error: null }),
      admin: {
        getUserById: async id => { assert.equal(id, target.id); return { data: { user: target }, error: null }; },
        updateUserById: async (id, changes) => { authUpdates.push({ id, changes }); return { error: null }; },
      },
    },
    from: table => {
      assert.equal(table, 'profiles', 'reset must not access participant/registration/result tables');
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { role: 'team_leader', team_leader_code: username }, error: null,
      }) }) }) };
    },
  };
  const caller = {
    from: table => {
      assert.equal(table, 'profiles');
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: 'admin-id', role: callerRole }, error: null,
      }) }) }) };
    },
    rpc: async (name, args) => {
      assert.equal(name, 'get_team_leader_assignments_for_admin');
      assert.equal(args.p_festival_id, 'festival-id');
      return { data: visible ? [{ user_id: target.id }] : [], error: null };
    },
  };
  let handler;
  let clientCount = 0;
  vm.runInNewContext(compiled, {
    exports: {},
    require: id => {
      if (id.includes('deno.land/std')) return { serve: fn => { handler = fn; } };
      if (id.includes('supabase-js')) return { createClient: () => ++clientCount === 1 ? admin : caller };
      throw new Error(`Unexpected import ${id}`);
    },
    Deno: { env: { get: () => 'configured' } },
    crypto: { getRandomValues: array => { array[0] = 1234; return array; } },
    Response,
    console,
  });
  return {
    authUpdates,
    request: async () => {
      const response = await handler(new Request('https://example.test/reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-session', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_password', user_id: target.id, festival_id: 'festival-id' }),
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}

test('authorized reset returns separate username and six digits, preserving existing metadata', async () => {
  const context = setup();
  const { status, body } = await context.request();
  assert.equal(status, 200);
  assert.equal(body.username, 'teamalpha');
  assert.equal(body.password, '001234');
  assert.equal(context.authUpdates.length, 1);
  const { id, changes } = context.authUpdates[0];
  assert.equal(id, 'leader-id');
  assert.equal(changes.password, '001234');
  assert.equal(changes.user_metadata.full_name, 'Leader');
  assert.equal(changes.app_metadata.tenant, 'original');
  assert.equal(changes.app_metadata.must_change_password, true);
});

test('a hidden or other-tenant assignment cannot be reset', async () => {
  const context = setup({ visible: false });
  assert.equal((await context.request()).status, 404);
  assert.equal(context.authUpdates.length, 0);
});

test('a non-admin cannot reset credentials', async () => {
  const context = setup({ callerRole: 'team_leader' });
  assert.equal((await context.request()).status, 403);
  assert.equal(context.authUpdates.length, 0);
});

test('an unusable username blocks reset before changing the password', async () => {
  for (const username of ['', ' padded-name ']) {
    const context = setup({ username });
    const response = await context.request();
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'INVALID_LOGIN_USERNAME');
    assert.equal(context.authUpdates.length, 0);
  }
});
