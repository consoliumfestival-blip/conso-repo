const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const selection = {
  id: 'selected-queue', schedule_id: 'ArabicSpeech', registration_id: 'selected-participant',
  draw_id: 'selected-draw', code_letter: 'B', topic_text: 'Selected topic', item_name: 'Arabic Speech',
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
  const state = {
    stageQuery: { data: { version: 45, paused: false, ready: [{ ...selection, schedule_id: 'FiqhSummit' }, selection] }, refetch: async () => { refreshes++; } },
    topicQuery: {}, registrationsQuery: {}, busy: '',
    schedule: { id: selection.schedule_id }, selected: { id: selection.registration_id }, selectedPreview: selection,
    setNotice: notice => notices.push(notice), setActionError: error => errors.push(error), setBusy: () => {},
    portal, venueId: 'stage', queryClient: { setQueryData: () => {} }, stageKey: ['stage'],
    scheduleTopicDrawService: Object.fromEntries(['showNextPortalTopic', 'showNextStageTopic'].map(name => [name, async (...args) => {
      calls.push({ name, args }); if (failure) throw failure; return { version: 46 };
    }])), ...overrides,
  };
  const run = new Function(...Object.keys(state), compile(formatter + '\nconst run = ' + handler) + '\nreturn run;')(...Object.values(state));
  await run();
  return { calls, errors: errors.filter(Boolean), notices, refreshes };
}

test('Show Next sends the selected preview through admin and portal paths, never the queue head', async () => {
  for (const portal of [false, true]) {
    const result = await invokeShowNext({}, portal);
    assert.deepEqual(result.calls, [{ name: portal ? 'showNextPortalTopic' : 'showNextStageTopic', args: ['stage', 45, selection] }]);
    assert.ok(result.notices.includes('Shown: Arabic Speech · Code B · Selected topic'));
  }
});

test('missing selection, paused/loading/failed data and missing preview make no publish request', async () => {
  for (const overrides of [
    { schedule: undefined }, { selected: undefined }, { selectedPreview: undefined },
    { stageQuery: { isError: true, error: new Error('Permission denied') } },
    { stageQuery: { isPending: true } },
    { stageQuery: { data: { paused: true } } },
    { topicQuery: { isFetching: true } }, { registrationsQuery: { isError: true } },
  ]) {
    const result = await invokeShowNext(overrides);
    assert.equal(result.calls.length, 0);
    assert.equal(result.errors.length, 1);
  }
  assert.equal((await invokeShowNext({ busy: 'next' })).calls.length, 0);
  const failed = await invokeShowNext({}, false, new Error('Selected topic changed'));
  assert.match(failed.errors[0], /Selected topic changed/);
  assert.equal(failed.calls.length, 1);
  assert.equal(failed.refreshes, 1, 'refresh reads state without replaying the publish');
});

test('service preserves strict selection arguments and never falls back to a legacy RPC', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/scheduleTopicDrawService.ts'), 'utf8');
  const mod = { exports: {} };
  const calls = [];
  let error = null;
  new Function('module', 'exports', 'require', compile(source))(mod, mod.exports, () => ({ supabase: {
    rpc: async (name, args) => { calls.push({ name, args }); return { data: { version: 46 }, error }; },
  } }));
  const service = mod.exports.scheduleTopicDrawService;
  await service.showNextStageTopic('stage', 45, selection);
  await service.showNextPortalTopic('stage', 45, selection);
  assert.deepEqual(calls.map(call => call.name), ['admin_stage_topic_show_selected', 'stage_portal_topic_show_selected']);
  for (const { args } of calls) assert.deepEqual(args, {
    p_venue_id: 'stage', p_expected_version: 45, p_schedule_id: selection.schedule_id,
    p_registration_id: selection.registration_id, p_queue_id: selection.id, p_draw_id: selection.draw_id,
    p_expected_code_letter: selection.code_letter, p_expected_topic_text: selection.topic_text,
    p_expected_item_name: selection.item_name,
  });
  error = { message: 'Selected topic has changed' };
  await assert.rejects(service.showNextStageTopic('stage', 45, selection), /Selected topic has changed/);
  assert.equal(calls.length, 3);
});
