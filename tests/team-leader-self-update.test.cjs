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

function setup() {
  const profileUpdates = [];
  const authUpdates = [];
  const user = {
    id: 'leader-id',
    app_metadata: { must_change_credentials: true, must_change_password: true },
    user_metadata: { username: 'tl289984', must_change_credentials: true, must_change_password: true },
  };
  const admin = {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      admin: { updateUserById: async (id, changes) => {
        authUpdates.push({ id, changes });
        return { error: null };
      } },
    },
    from: table => {
      assert.equal(table, 'profiles');
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { id: user.id, role: 'team_leader', team_leader_code: 'tl289984' }, error: null,
        }) }) }),
        update: changes => ({ eq: async () => {
          profileUpdates.push(changes);
          return { error: null };
        } }),
      };
    },
  };
  let handler;
  vm.runInNewContext(compiled, {
    exports: {},
    require: id => {
      if (id.includes('deno.land/std')) return { serve: callback => { handler = callback; } };
      if (id.includes('@supabase/supabase-js')) return { createClient: () => admin };
      throw new Error(`Unexpected import: ${id}`);
    },
    Deno: { env: { get: () => 'configured' } },
    Response,
    crypto,
    console,
  });
  return {
    profileUpdates,
    authUpdates,
    request: async newUsername => {
      const response = await handler({
        method: 'POST',
        headers: { get: () => 'Bearer valid-token' },
        json: async () => ({ action: 'self_update_credentials', new_username: newUsername, new_password: 'new-password' }),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

test('first setup may keep the temporary username without changing the profile', async () => {
  const context = setup();
  const response = await context.request('tl289984');
  assert.equal(response.status, 200);
  assert.equal(response.body.username, 'tl289984');
  assert.equal(context.profileUpdates.length, 0);
  assert.equal(context.authUpdates.length, 1);
  assert.equal(context.authUpdates[0].changes.app_metadata.must_change_credentials, false);
});

test('a newly chosen username still updates the profile', async () => {
  const context = setup();
  const response = await context.request('my-leader-name');
  assert.equal(response.status, 200);
  assert.equal(response.body.username, 'my-leader-name');
  assert.equal(context.profileUpdates.length, 1);
  assert.equal(context.profileUpdates[0].team_leader_code, 'my-leader-name');
});

test('first setup still rejects an empty username', async () => {
  const context = setup();
  const response = await context.request('   ');
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'USERNAME_REQUIRED');
  assert.equal(context.profileUpdates.length, 0);
  assert.equal(context.authUpdates.length, 0);
});
