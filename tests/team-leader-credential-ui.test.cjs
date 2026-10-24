const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function screenHandler(file, name, context) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) handler = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(handler);
  vm.runInNewContext(ts.transpileModule(`globalThis.run = ${handler}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.run;
}

test('invalid numeric input blocks login and password setup before any API action', async () => {
  const context = { invalidPasswordInput: true };
  await screenHandler('src/app/team/login.tsx', 'handleLogin', context)();
  await screenHandler('src/app/team/first-login.tsx', 'handleUpdate', context)();
});

test('after password save, a failed automatic login retries login without updating credentials again', async () => {
  let saves = 0;
  let logins = 0;
  const routes = [];
  const messages = [];
  const context = {
    invalidPasswordInput: false,
    requiresUsernameChange: false,
    newUsername: '', currentUsername: 'existing-leader', newPassword: '012345',
    savedUsername: null,
    user: { id: 'leader-id' },
    isSixDigitPassword: value => /^[0-9]{6}$/.test(value),
    setErrorMsg: () => {}, setLoading: () => {}, setUser: () => {},
    setSuccessMsg: message => messages.push(message),
    setSavedUsername: value => { context.savedUsername = value; },
    setTimeout: fn => fn(),
    router: { replace: route => routes.push(route) },
    teamLeaderPortalService: { selfUpdateCredentials: async (username, password) => {
      saves++;
      assert.equal(username, null);
      assert.equal(password, '012345');
      return { success: true, username: 'existing-leader' };
    } },
    authService: { loginTeamLeader: async (username, password) => {
      logins++;
      assert.equal(username, 'existing-leader');
      assert.equal(password, '012345');
      if (logins === 1) throw new Error('Network request failed');
      return { user: { id: 'leader-id' }, role: 'team_leader', tenant_id: 'tenant' };
    } },
  };
  const run = screenHandler('src/app/team/first-login.tsx', 'handleUpdate', context);
  await run();
  assert.equal(saves, 1);
  assert.match(messages.at(-1), /password has changed/);
  assert.equal(routes.length, 0);
  await run();
  assert.equal(saves, 1);
  assert.equal(logins, 2);
  assert.deepEqual(routes, ['/team/dashboard']);
});

test('the actual copy action writes exactly the separate trimmed value to the browser clipboard', async () => {
  const helperSource = fs.readFileSync(path.join(__dirname, '../src/core/utils/teamLeaderCredentials.ts'), 'utf8');
  const helperExports = {};
  vm.runInNewContext(ts.transpileModule(helperSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: helperExports });
  const copied = [];
  const context = {
    Platform: { OS: 'web' },
    navigator: { clipboard: { writeText: async value => copied.push(value) } },
    teamLeaderClipboardValue: helperExports.teamLeaderClipboardValue,
    setCopiedCredential: () => {}, setTimeout: () => {}, console,
  };
  const copy = screenHandler('src/app/(admin)/settings/team-leader-portal.tsx', 'copyCredential', context);
  await copy('  leader \n', 'Username', 'username');
  await copy(' 001234 \n', 'Password', 'password');
  assert.deepEqual(copied, ['leader', '001234']);
});
