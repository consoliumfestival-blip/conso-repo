const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/core/utils/teamLeaderCredentials.ts'), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject });
const { isSixDigitPassword, readNumericPasswordInput, teamLeaderClipboardValue } = exportsObject;

test('numeric paste removes surrounding whitespace and preserves leading zeroes', () => {
  assert.equal(readNumericPasswordInput(' \n012345\t '), '012345');
  assert.equal(isSixDigitPassword('012345'), true);
  assert.equal(readNumericPasswordInput(''), '');
});

test('mixed text and excessive digits are rejected without inventing a password', () => {
  for (const value of ['Password: 012345', '12 3456', '0123456', 'abc123', '١٢٣٤٥٦']) {
    assert.equal(readNumericPasswordInput(value), null);
  }
});

test('each clipboard value contains only its own credential with no surrounding spaces', () => {
  assert.equal(teamLeaderClipboardValue(' \nTeamLeader\t', 'username'), 'TeamLeader');
  assert.equal(teamLeaderClipboardValue(' \n012345\t', 'password'), '012345');
  assert.equal(teamLeaderClipboardValue(' Leader Name ', 'username'), 'Leader Name');
  assert.throws(() => teamLeaderClipboardValue('Username: leader\nPassword: 012345', 'password'));
  assert.throws(() => teamLeaderClipboardValue('old-password', 'password'));
});
