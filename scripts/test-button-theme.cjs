const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const cp = require('node:child_process');
function load(file, dependencies = {}) {
  const context = { exports: {}, require: name => dependencies[name] ?? require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
const button = load('src/constants/buttonTheme.ts');
const tokens = require('../src/constants/coreThemeTokens.json');
const core = load('src/constants/coreTheme.ts', { 'react-native': { Platform: { OS: 'web' } }, './buttonTheme': button, './coreThemeTokens.json': tokens });
const plain = value => JSON.parse(JSON.stringify(value));
test('Team identity palettes retain their own action colours in light and dark mode', () => {
  const team = load('src/constants/teamLeaderTheme.ts', {
    'react-native': { Platform: { OS: 'web', select: options => options.web } },
    './designSystem': { ui: { radius: {} } }, './buttonTheme': button,
  });
  for (const name of ['LA-COSMIX', 'Al-Cognix', 'EL-CLARIX', 'LO-GLIFIX', 'DER-ZENIX', 'Unknown team']) {
    for (const mode of ['light', 'dark']) {
      const { colors } = team.createTeamUi(mode, name);
      assert.equal(colors.buttonPrimary, colors.primaryStrong);
      assert.equal(colors.buttonForeground, colors.onPrimary);
    }
  }
});
test('default buttons match the reference; unrelated palette roles stay unchanged', () => {
  const colors = core.resolveCoreColors({ mode: 'light', palette: 'teal' }, false);
  const variables = core.coreVariables(colors);
  assert.equal(variables['--core-button-primary'], '#4ADE80');
  assert.equal(variables['--core-button-foreground'], '#14532D');
  assert.equal(variables['--core-button-hover'], '#22C55E');
  for (const role of Object.keys(tokens.legacy)) assert.equal(variables[core.coreVariableName(role)], colors[role]);
});
test('other palettes and dark mode retain their existing action accent', () => {
  for (const palette of Object.keys(tokens.palettes)) for (const mode of ['light', 'dark']) {
    const colors = core.resolveCoreColors({ mode, palette }, false);
    const variables = core.coreVariables(colors);
    if (mode !== 'light' || palette !== 'teal') {
      assert.equal(variables['--core-button-primary'], colors.primary);
      assert.equal(variables['--core-button-foreground'], colors.onPrimary);
    }
  }
});
test('reference foreground has readable contrast', () => {
  const luminance = hex => hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
  assert.ok((luminance('#4ADE80') + .05) / (luminance('#14532D') + .05) >= 4.5);
});
test('public sources and backend contracts are unchanged', () => {
  const changed = cp.execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split(/\r?\n/);
  assert.ok(!changed.some(file => /^(src\/app\/\(public\)\/|src\/services\/|supabase\/)/.test(file)));
  const calls = text => {
    const source = ts.createSourceFile('audit.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), result = [];
    function visit(node) {
      if (ts.isCallExpression(node) && /supabase|\b\w*(?:Service|Repository)\./.test(node.expression.getText(source))) result.push(node.getText(source).replace(/\s+/g, ''));
      ts.forEachChild(node, visit);
    }
    visit(source); return result;
  };
  for (const file of changed.filter(file => file.endsWith('.tsx'))) {
    const before = cp.execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' });
    assert.deepEqual(calls(fs.readFileSync(file, 'utf8')), calls(before), file);
  }
  assert.deepEqual(plain(button.legacyButtonColors).buttonPrimary, tokens.legacy.primary);
});
