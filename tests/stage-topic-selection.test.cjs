const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { ids, fixture, rpc } = require('./helpers/stageTopicFixture.cjs');

const sql = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');
const strictFile = fs.readdirSync(path.join(__dirname, '../supabase/migrations'))
  .find(name => name.endsWith('_strict_selected_stage_topic.sql'));

async function setup({ migrate = true } = {}) {
  const db = new PGlite();
  await db.exec(fixture);
  await db.exec(sql('20261126082300_stage_topic_display.sql'));
  // Production's existing venue capability verifier is a dependency; this
  // fixture accepts valid tenant/festival venue links and rejects missing ones.
  await db.exec(`CREATE SCHEMA stage_portal_private;
    CREATE FUNCTION stage_portal_private.assert_pin(p_venue_id uuid, p_pin text)
    RETURNS text LANGUAGE sql AS $$ SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.venues WHERE id = p_venue_id AND tenant_id IS NOT NULL
        AND festival_id IS NOT NULL) THEN NULL ELSE 'Invalid stage link.' END $$;`);
  await db.exec(sql('20261126143826_stage_portal_topic_controls.sql'));
  if (migrate) await db.exec(sql(strictFile));
  await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, false, false]);
  await rpc(db, 'stage_draw_schedule_topic', [ids.secondSchedule, ids.registrationB, false, false]);
  return db;
}

function show(db, row, version = 0, portal = false, overrides = {}) {
  const selected = { ...row, ...overrides };
  return rpc(db, portal ? 'stage_portal_topic_show_selected' : 'admin_stage_topic_show_selected', [
    ids.venue, version, selected.schedule_id, selected.registration_id,
    selected.id, selected.draw_id, selected.code_letter, selected.topic_text, selected.item_name,
  ]);
}

test('admin and portal show exactly the selected later event, leaving the earlier queue untouched', async () => {
  for (const portal of [false, true]) {
    const db = await setup();
    try {
      const state = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
      const selected = state.ready[1];
      assert.ok(selected.draw_id);
      const shown = await show(db, selected, 0, portal);
      assert.equal(shown.on_screen.code_letter, selected.code_letter);
      assert.equal(shown.on_screen.topic_text, selected.topic_text);
      assert.equal(shown.on_screen.item_name, selected.item_name);
      assert.equal(shown.on_screen.duration_seconds, 420);
      assert.deepEqual(shown.ready.map(row => row.registration_id), [ids.registrationA]);
      const history = await db.query('SELECT count(*)::int AS n FROM private.stage_topic_display_queue WHERE published_at IS NOT NULL');
      assert.equal(history.rows[0].n, 1);
    } finally { await db.close(); }
  }
});

test('mismatched event, registration, draw or preview never falls back to another topic', async () => {
  const db = await setup();
  try {
    const state = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    const target = state.ready[1];
    for (const portal of [false, true]) {
      for (const overrides of [
        { schedule_id: ids.schedule }, { registration_id: ids.registrationA },
        { draw_id: state.ready[0].draw_id }, { id: state.ready[0].id },
        { code_letter: 'Changed' }, { topic_text: 'Changed' }, { item_name: 'Changed' },
        { draw_id: null },
      ]) await assert.rejects(show(db, target, 0, portal, overrides));
    }
    const unchanged = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(unchanged.version, 0);
    assert.equal(unchanged.on_screen, null);
    assert.equal(unchanged.ready.length, 2);
  } finally { await db.close(); }
});

test('paused display, stale versions and replayed selections cannot publish', async () => {
  const db = await setup();
  try {
    const state = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    await rpc(db, 'admin_stage_topic_set_paused', [ids.venue, true, 0]);
    await assert.rejects(show(db, state.ready[1], 1), /Resume the display/);
    await assert.rejects(show(db, state.ready[1], 1, true), /Resume the display/);
    const resumed = await rpc(db, 'admin_stage_topic_set_paused', [ids.venue, false, 1]);
    assert.equal(resumed.on_screen, null);
    await assert.rejects(show(db, state.ready[1], 0), /Stage display changed/);
    await show(db, state.ready[1], 2);
    await assert.rejects(show(db, state.ready[1], 3, true), /no longer ready/);
    const after = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(after.version, 3);
    assert.equal(after.ready[0].registration_id, ids.registrationA);
  } finally { await db.close(); }
});

test('a redraw cannot replace the selected preview, even when the topic text stays the same', async () => {
  const db = await setup();
  try {
    const before = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    const selected = before.ready[1];
    await db.query('UPDATE private.schedule_topics SET is_active = true WHERE id = $1', [ids.topicC]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.secondSchedule, ids.registrationB, true, false]);
    const updated = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(updated.ready[1].id, selected.id);
    assert.equal(updated.ready[1].topic_text, selected.topic_text);
    assert.notEqual(updated.ready[1].draw_id, selected.draw_id);
    await assert.rejects(show(db, selected), /no longer ready/);
    await assert.rejects(show(db, selected, 0, true), /no longer ready/);
    assert.equal((await rpc(db, 'admin_stage_topic_display_state', [ids.venue])).version, 0);
  } finally { await db.close(); }
});

test('code edits, rejected participants, disabled events and venue moves fail closed', async () => {
  const db = await setup();
  try {
    const selected = (await rpc(db, 'admin_stage_topic_display_state', [ids.venue])).ready[1];
    await db.query('UPDATE public.registrations SET code_letter = $1 WHERE id = $2', ['Z', ids.registrationB]);
    await assert.rejects(show(db, selected), /code letter changed/);
    await db.query("UPDATE public.registrations SET code_letter = 'B', status = 'rejected' WHERE id = $1", [ids.registrationB]);
    await assert.rejects(show(db, selected, 0, true), /code letter changed/);
    await db.query("UPDATE public.registrations SET status = 'approved' WHERE id = $1", [ids.registrationB]);
    await db.query('UPDATE public.schedules SET topic_draw_enabled = false WHERE id = $1', [ids.secondSchedule]);
    await assert.rejects(show(db, selected), /Topic Draw is disabled/);
    await db.query('UPDATE public.schedules SET topic_draw_enabled = true, venue_id = $1 WHERE id = $2', [ids.secondVenue, ids.secondSchedule]);
    await assert.rejects(show(db, selected), /outside this stage/);
    await assert.rejects(show(db, selected, 0, true), /outside this stage/);
    assert.equal((await rpc(db, 'admin_stage_topic_display_state', [ids.venue])).on_screen, null);
  } finally { await db.close(); }
});

test('authorization and obsolete clients cannot bypass strict selection', async () => {
  const db = await setup();
  try {
    const selected = (await rpc(db, 'admin_stage_topic_display_state', [ids.venue])).ready[1];
    await db.query("SELECT set_config('test.tenant', $1, false)", [ids.otherTenant]);
    await assert.rejects(show(db, selected), /outside the current tenant/);
    await db.query("SELECT set_config('test.tenant', $1, false)", [ids.tenant]);
    for (const name of ['admin_stage_topic_show_next', 'stage_portal_topic_show_next']) {
      await assert.rejects(rpc(db, name, [ids.venue, 0]), /Refresh the app/);
    }
    const signature = '(uuid,bigint,uuid,uuid,uuid,uuid,text,text,text)';
    const grants = await db.query(`SELECT
      has_function_privilege('anon', $1, 'EXECUTE') AS admin,
      has_function_privilege('anon', $2, 'EXECUTE') AS portal`, [
      'public.admin_stage_topic_show_selected' + signature, 'public.stage_portal_topic_show_selected' + signature,
    ]);
    assert.deepEqual(grants.rows[0], { admin: false, portal: true });
    assert.equal((await rpc(db, 'admin_stage_topic_display_state', [ids.venue])).version, 0);
  } finally { await db.close(); }
});

test('concurrent selected publishes with the same version only advance once', async () => {
  const db = await setup();
  try {
    const state = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    const responses = await Promise.allSettled([show(db, state.ready[1]), show(db, state.ready[0], 0, true)]);
    assert.equal(responses.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(responses.filter(result => result.status === 'rejected').length, 1);
    const after = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(after.version, 1);
    assert.equal(after.ready.length, 1);
  } finally { await db.close(); }
});

test('migration preserves existing draws, pending queue, paused state and published history', async () => {
  const db = await setup({ migrate: false });
  try {
    await rpc(db, 'admin_stage_topic_show_next', [ids.venue, 0]);
    await rpc(db, 'admin_stage_topic_set_paused', [ids.venue, true, 1]);
    const snapshot = async () => Promise.all([
      db.query('SELECT * FROM private.stage_topic_display_queue ORDER BY sequence'),
      db.query('SELECT * FROM private.schedule_topic_draws ORDER BY id'),
      db.query('SELECT * FROM private.stage_topic_display_states ORDER BY venue_id'),
    ]).then(results => results.map(result => result.rows));
    const before = await snapshot();
    await db.exec(sql(strictFile));
    assert.deepEqual(await snapshot(), before);
    const state = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(state.paused, true);
    assert.equal(state.on_screen.code_letter, 'A');
    assert.equal(state.ready.length, 1);
    assert.ok(state.ready[0].draw_id);
    const publicState = await rpc(db, 'get_stage_topic_display', [state.display_token]);
    assert.equal('ready' in publicState, false);
    assert.equal(publicState.on_screen, null, 'paused audience screens keep topic content hidden');
    await rpc(db, 'admin_stage_topic_set_paused', [ids.venue, false, state.version]);
    const resumedPublic = await rpc(db, 'get_stage_topic_display', [state.display_token]);
    assert.equal(resumedPublic.on_screen.code_letter, 'A');
    assert.equal('draw_id' in resumedPublic.on_screen, false);
  } finally { await db.close(); }
});

test('a selected participant at the end of a large queue publishes without consuming earlier entries', async () => {
  const db = await setup();
  try {
    await db.query(`INSERT INTO public.registrations
      SELECT gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 'T' || n, 'approved'
      FROM generate_series(1, 200) AS n`, [ids.tenant, ids.festival, ids.item]);
    await db.query(`INSERT INTO private.schedule_topic_draws
      (tenant_id, festival_id, schedule_id, registration_id, topic_id, topic_text_snapshot)
      SELECT r.tenant_id, r.festival_id, $1::uuid, r.id, $2::uuid, 'Bulk topic'
      FROM public.registrations r WHERE r.code_letter LIKE 'T%'`, [ids.schedule, ids.topicA]);
    await db.query(`SELECT private.enqueue_stage_topic_draw(schedule_id, registration_id, id)
      FROM private.schedule_topic_draws WHERE topic_text_snapshot = 'Bulk topic'`);
    const state = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(state.ready.length, 202);
    const target = state.ready[state.ready.length - 1];
    const after = await show(db, target, 0, true);
    assert.equal(after.ready.length, 201);
    assert.equal(after.on_screen.code_letter, target.code_letter);
    assert.equal(after.on_screen.topic_text, target.topic_text);
    assert.deepEqual(after.ready.map(row => row.id), state.ready.slice(0, -1).map(row => row.id));
  } finally { await db.close(); }
});

test('frontend preview rejects unrelated and stale draws regardless of queue position', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/core/utils/stageTopicSelection.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', code)(mod, mod.exports);
  const { selectedReadyTopic } = mod.exports;
  const ready = Array.from({ length: 200 }, (_, i) => ({
    id: `q${i}`, schedule_id: `s${i}`, registration_id: `r${i}`, draw_id: `d${i}`,
    code_letter: `C${i}`, topic_text: `Topic ${i}`,
  }));
  assert.equal(selectedReadyTopic(ready, 's199', 'r199', 'd199', 'C199', 'Topic 199'), ready[199]);
  assert.equal(selectedReadyTopic(ready, 's199', 'r0', 'd199', 'C199', 'Topic 199'), undefined);
  assert.equal(selectedReadyTopic(ready, 's199', 'r199', 'old', 'C199', 'Topic 199'), undefined);
  assert.equal(selectedReadyTopic(ready, 's199', 'r199', undefined, 'C199', 'Topic 199'), undefined);
  assert.equal(selectedReadyTopic(ready, 's199', 'r199', 'd199', 'Changed', 'Topic 199'), undefined);
  assert.equal(selectedReadyTopic(ready, 's199', '', 'd199', 'C199', 'Topic 199'), undefined);
});
