const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the actual screen handler with platform and API boundaries mocked.
const source = fs.readFileSync(path.join(__dirname, '../src/app/(admin)/settings/team-leader-portal.tsx'), 'utf8');
const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleResetPassword') {
    handler = node.initializer.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler, 'Team Leader screen must expose its password action handler');
const compiled = ts.transpileModule(`globalThis.run = ${handler};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

const assignment = { id: 'assignment', user_id: 'leader', team_name: 'Team', leader_code: 'username', password_state: 'ready_to_reset' };
function createHarness({ platform = 'web', confirmed = true, fail = false, festival = { id: 'festival' } } = {}) {
  const calls = [];
  const notices = [];
  const loading = [];
  let credentials;
  let rows = [assignment, { id: 'other', password_state: 'ready_to_reset' }];
  const context = {
    Platform: { OS: platform },
    window: { confirm: message => { calls.push(['confirm', message]); return confirmed; }, alert: message => notices.push(message) },
    Alert: { alert: (...args) => calls.push(['nativeAlert', ...args]) },
    activeFestival: festival,
    tenantId: 'tenant',
    temporaryPasswordsByUser: new Map(),
    temporaryPasswordKey: (tenant, fest, user) => `${tenant}:${fest}:${user}`,
    setResettingAssignmentId: value => loading.push(value),
    setResetCredentials: value => { credentials = value; },
    setAssignments: update => { rows = update(rows); },
    teamLeaderPortalService: { resetPassword: async (...args) => {
      calls.push(['reset', ...args]);
      if (fail) throw new Error('Service unavailable');
      return { username: 'username', password: 'test-temporary-password' };
    } },
  };
  vm.runInNewContext(compiled, context);
  return { context, calls, notices, loading, credentials: () => credentials, rows: () => rows };
}

for (const reissue of [false, true]) {
  test(`web ${reissue ? 'reissue' : 'reset'} confirms, invokes the API once, and exposes copyable credentials`, async () => {
    const h = createHarness();
    await h.context.run(assignment, reissue);
    assert.equal(h.calls[0][0], 'confirm');
    assert.match(h.calls[0][1], /current password will stop working/);
    assert.deepEqual(h.calls.filter(call => call[0] === 'reset'), [['reset', 'leader', 'festival']]);
    assert.equal(h.credentials().password, 'test-temporary-password');
    assert.equal(h.context.temporaryPasswordsByUser.get('tenant:festival:leader'), h.credentials().password);
    assert.equal(h.rows()[0].password_state, 'pending_change');
    assert.equal(h.rows()[1].password_state, 'ready_to_reset');
    assert.deepEqual(h.loading, ['assignment', null]);
    assert.match(h.notices[0], reissue ? /Temporary Password Reissued/ : /Password Reset Complete/);
    assert.equal(h.calls.some(call => call[0] === 'nativeAlert'), false, 'web must not depend on React Native Alert');
  });
}

test('cancelling the web confirmation does not rotate credentials or change screen state', async () => {
  const h = createHarness({ confirmed: false });
  await h.context.run(assignment, true);
  assert.equal(h.calls.filter(call => call[0] === 'reset').length, 0);
  assert.deepEqual(h.loading, []);
  assert.equal(h.credentials(), undefined);
  assert.equal(h.context.temporaryPasswordsByUser.size, 0);
});

test('API failure is visible on web and clears the busy state without exposing credentials', async () => {
  const h = createHarness({ fail: true });
  await h.context.run(assignment, true);
  assert.match(h.notices[0], /Password reissue failed[\s\S]*Service unavailable/);
  assert.equal(h.credentials(), null);
  assert.equal(h.context.temporaryPasswordsByUser.size, 0);
  assert.deepEqual(h.loading, ['assignment', null]);
});

test('missing active festival reports a web error without invoking the API', async () => {
  const h = createHarness({ festival: null });
  await h.context.run(assignment, true);
  assert.equal(h.calls.filter(call => call[0] === 'reset').length, 0);
  assert.match(h.notices[0], /No active festival is selected/);
  assert.deepEqual(h.loading, ['assignment', null]);
});

test('native reset still waits for the destructive confirmation callback', async () => {
  const h = createHarness({ platform: 'android' });
  await h.context.run(assignment);
  assert.equal(h.calls.filter(call => call[0] === 'reset').length, 0);
  const buttons = h.calls[0][3];
  assert.equal(buttons[0].style, 'cancel');
  assert.equal(buttons[1].style, 'destructive');
  await buttons[1].onPress();
  assert.equal(h.calls.filter(call => call[0] === 'reset').length, 1);
  assert.equal(h.credentials().password, 'test-temporary-password');
  assert.deepEqual(h.notices, []);
});
