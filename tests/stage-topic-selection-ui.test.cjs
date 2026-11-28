const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const selection = {
  schedule_id: 'ArabicSpeech', registration_id: 'selected-participant',
  draw_id: 'selected-draw', code_letter: 'B', topic_text: 'Selected topic', item_name: 'Arabic Speech',
  duration_seconds: 300,
};

function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

async function invokeShowNext(overrides = {}, portal = false, failure) {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/stage/StageTopicControlModal.tsx'), 'utf8');
  const ast = ts.createSourceFile('modal.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let formatter, handler;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'errorMessage') formatter = node.getText(ast);
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'showNext') handler = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(handler && formatter);
  const calls = [], errors = [], notices = [];
  let refreshes = 0;
  const serviceMethods = ['showSavedPortalDraw', 'showSavedStageDraw', 'showNextQueuedPortalTopic', 'showNextQueuedStageTopic'];
  const state = {
    stageQuery: { data: { version: 45, paused: false, on_screen: null, ready: [selection] }, refetch: async () => { refreshes++; } },
    topicQuery: { refetch: async () => { refreshes++; } },
    busy: '',
    selectedPreview: selection,
    setNotice: notice => notices.push(notice), setActionError: error => errors.push(error), setBusy: () => {},
    portal, venueId: 'stage', queryClient: { setQueryData: () => {} }, stageKey: ['stage'],
    scheduleTopicDrawService: Object.fromEntries(serviceMethods.map(name => [name, async (...args) => {
      calls.push({ name, args }); if (failure) throw failure; return { version: 46, on_screen: selection };
    }])), ...overrides,
  };
  const run = new Function(...Object.keys(state), compile(formatter + '\nconst run = ' + handler) + '\nreturn run;')(...Object.values(state));
  await run();
  return { calls, errors: errors.filter(Boolean), notices, refreshes };
}

test('Show Next shows selected draw when not yet on screen, and works when paused or background fetching', async () => {
  for (const portal of [false, true]) {
    const result = await invokeShowNext({
      stageQuery: { isFetching: true, data: { version: 45, paused: true, on_screen: null, ready: [] }, refetch: async () => {} },
    }, portal);
    assert.deepEqual(result.calls, [{ name: portal ? 'showSavedPortalDraw' : 'showSavedStageDraw', args: ['stage', 45, selection] }]);
    assert.ok(result.notices.includes('Shown: Arabic Speech · Code B · Selected topic'));
  }
});

test('Show Next advances queued draw when current selection is already on screen or unselected', async () => {
  for (const portal of [false, true]) {
    const result = await invokeShowNext({
      stageQuery: {
        data: { version: 45, paused: false, on_screen: { draw_id: selection.draw_id }, ready: [{ id: 'q2', draw_id: 'd2' }] },
        refetch: async () => {},
      },
    }, portal);
    assert.deepEqual(result.calls, [{ name: portal ? 'showNextQueuedPortalTopic' : 'showNextQueuedStageTopic', args: ['stage', 45] }]);
  }
});

test('Show Next blocks only when loading/failed or when neither selection nor queue exists', async () => {
  for (const overrides of [
    { selectedPreview: undefined, stageQuery: { data: { version: 45, paused: false, on_screen: null, ready: [] } } },
    { stageQuery: { isError: true, error: new Error('Permission denied') } },
    { stageQuery: { isPending: true } },
  ]) {
    const result = await invokeShowNext(overrides);
    assert.equal(result.calls.length, 0);
    assert.equal(result.errors.length, 1);
  }
  assert.equal((await invokeShowNext({ busy: 'next' })).calls.length, 0);
  const failed = await invokeShowNext({}, false, new Error('Network issue'));
  assert.match(failed.errors[0], /Network issue/);
  assert.equal(failed.calls.length, 1);
});

test('service preserves saved draw publish and FIFO queue advance RPC calls', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/scheduleTopicDrawService.ts'), 'utf8');
  const mod = { exports: {} };
  const calls = [];
  let error = null;
  new Function('module', 'exports', 'require', compile(source))(mod, mod.exports, () => ({ supabase: {
    rpc: async (name, args) => { calls.push({ name, args }); return { data: { version: 46 }, error }; },
  } }));
  const service = mod.exports.scheduleTopicDrawService;
  await service.showSavedStageDraw('stage', 45, selection);
  await service.showSavedPortalDraw('stage', 45, selection);
  await service.showNextQueuedStageTopic('stage', 45);
  await service.showNextQueuedPortalTopic('stage', 45);
  assert.deepEqual(calls.map(call => call.name), [
    'admin_stage_topic_show_draw',
    'stage_portal_topic_show_draw',
    'admin_stage_topic_show_next',
    'stage_portal_topic_show_next',
  ]);
  error = { message: 'Selected topic has changed' };
  await assert.rejects(service.showSavedStageDraw('stage', 45, selection), /Selected topic has changed/);
});
