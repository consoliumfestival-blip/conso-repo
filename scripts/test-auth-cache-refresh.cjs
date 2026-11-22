const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const text = fs.readFileSync('src/app/_layout.tsx', 'utf8');
const source = ts.createSourceFile('layout.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'supabase.auth.onAuthStateChange') callback = node.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callback, 'Root auth callback must be found');
function harness(currentId) {
  const calls = { clears: 0, signedOut: 0, checks: 0, timers: [] };
  const state = { user: currentId ? { id: currentId } : null, setUser: () => calls.signedOut++, checkSession: () => calls.checks++ };
  const handle = vm.runInNewContext('(' + callback + ')', {
    queryClient: { clear: () => calls.clears++ },
    useAuthStore: { getState: () => state },
    setTimeout: (fn) => calls.timers.push(fn), teamPortalAtStartup: false,
  });
  return { handle, calls };
}
for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED']) {
  test(`${event} for the same account retains page data and validates the session`, () => {
    const { handle, calls } = harness('user-a');
    handle(event, { user: { id: 'user-a' } });
    assert.equal(calls.clears, 0);
    assert.equal(calls.checks, 0, 'Auth reads remain deferred outside callback');
    calls.timers.forEach(fn => fn());
    assert.equal(calls.checks, 1);
  });
}
for (const current of [null, 'user-a']) {
  test(`signing in from ${current ?? 'anonymous'} to another account clears cached data`, () => {
    const { handle, calls } = harness(current);
    handle('SIGNED_IN', { user: { id: 'user-b' } });
    assert.equal(calls.clears, 1);
    assert.equal(calls.timers.length, 1);
  });
}
test('sign-out clears cached data and the authenticated user immediately', () => {
  const { handle, calls } = harness('user-a');
  handle('SIGNED_OUT', null);
  assert.equal(calls.clears, 1);
  assert.equal(calls.signedOut, 1);
  assert.equal(calls.timers.length, 0);
});
