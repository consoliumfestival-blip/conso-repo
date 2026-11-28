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
const publishSavedFile = fs.readdirSync(path.join(__dirname, '../supabase/migrations'))
  .find(name => name.endsWith('_publish_saved_stage_draw.sql'));
const simplifyFile = fs.readdirSync(path.join(__dirname, '../supabase/migrations'))
  .find(name => name.endsWith('_simplify_topic_draw_show_next.sql'));

async function setup() {
  const db = new PGlite();
  await db.exec(fixture);
  await db.exec(sql('20261126082300_stage_topic_display.sql'));
  await db.exec(`CREATE SCHEMA stage_portal_private;
    CREATE FUNCTION stage_portal_private.assert_pin(p_venue_id uuid, p_pin text)
    RETURNS text LANGUAGE sql AS $$ SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.venues WHERE id = p_venue_id AND tenant_id IS NOT NULL
        AND festival_id IS NOT NULL) THEN NULL ELSE 'Invalid stage link.' END $$;`);
  await db.exec(sql('20261126143826_stage_portal_topic_controls.sql'));
  await db.exec(sql(strictFile));
  await db.exec(sql(publishSavedFile));
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.stage_venue_portal_schedule_detail_v2(
      p_venue_id uuid, p_pin text, p_schedule_id uuid
    ) RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
      SELECT jsonb_build_object(
        'registrations',
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status))
          FROM public.registrations r
          JOIN public.schedules s ON s.id = p_schedule_id
            AND s.venue_id = p_venue_id
            AND s.festival_id = r.festival_id
            AND s.item_id = r.item_id
            AND s.tenant_id = r.tenant_id
        ), '[]'::jsonb)
      );
    $$;
    CREATE OR REPLACE FUNCTION private.stage_topic_registration_in_scope(
      p_registration public.registrations, p_schedule public.schedules
    ) RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
      SELECT COALESCE(
        (p_registration).festival_id = (p_schedule).festival_id
        AND (p_registration).item_id = (p_schedule).item_id
        AND (p_registration).tenant_id = (p_schedule).tenant_id
        AND (p_registration).status IS DISTINCT FROM 'rejected',
      false);
    $$;
  `);
  await db.exec(sql(simplifyFile));
  return db;
}

function showSelected(db, row, version = 0, portal = false) {
  return rpc(db, portal ? 'stage_portal_topic_show_draw' : 'admin_stage_topic_show_draw', [
    ids.venue, version, row.schedule_id, row.registration_id,
    row.draw_id, row.code_letter || '—', row.topic_text, row.item_name || 'Speech', 300,
  ]);
}

test('ahead-of-time draw queues without changing live screen until Show Next', async () => {
  const db = await setup();
  try {
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, false, false]);
    const queued1 = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(queued1.on_screen, null, 'drawing never auto-publishes to audience screen');
    assert.equal(queued1.ready.length, 1);

    const shown1 = await rpc(db, 'admin_stage_topic_show_next', [ids.venue, queued1.version]);
    assert.equal(shown1.on_screen.code_letter, 'A');
    assert.equal(shown1.ready.length, 0);

    // Draw participant B while participant A is speaking on stage.
    await rpc(db, 'stage_portal_draw_topic', [ids.venue, ids.secondSchedule, ids.registrationB, false, false]);
    const midShow = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(midShow.on_screen.code_letter, 'A', 'live screen must stay on participant A until Show Next');
    assert.equal(midShow.ready.length, 1);
    assert.equal(midShow.ready[0].registration_id, ids.registrationB);

    const shown2 = await rpc(db, 'stage_portal_topic_show_next', [ids.venue, midShow.version]);
    assert.equal(shown2.on_screen.code_letter, 'B');
    assert.equal(shown2.ready.length, 0);
  } finally { await db.close(); }
});

test('topics remain permanently active in random pool across draws (no reload cycle)', async () => {
  const db = await setup();
  try {
    // Second schedule has only 1 active topic (topicC). Drawing multiple times must keep it active.
    await rpc(db, 'stage_draw_schedule_topic', [ids.secondSchedule, ids.registrationB, false, false]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.secondSchedule, ids.registrationA, false, false]);
    await rpc(db, 'stage_portal_draw_topic', [ids.venue, ids.secondSchedule, ids.registrationB, true, false]);
    const activeRows = await db.query(
      'SELECT is_active FROM private.schedule_topics WHERE schedule_id = $1',
      [ids.secondSchedule],
    );
    assert.equal(activeRows.rows.length, 1);
    assert.equal(activeRows.rows[0].is_active, true);
  } finally { await db.close(); }
});

test('paused display auto-resumes, stale versions and replays succeed, missing code_letter and judging_started allowed', async () => {
  const db = await setup();
  try {
    // Judging started should not block draws.
    await db.query('INSERT INTO public.mark_entries (schedule_id, tenant_id) VALUES ($1, $2)', [ids.schedule, ids.tenant]);
    // Missing code_letter should not block draw or Show Next.
    await db.query('UPDATE public.registrations SET code_letter = NULL WHERE id = $1', [ids.registrationA]);
    const drawn = await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, false, false]);
    assert.ok(drawn.assignment_id);

    const state0 = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(state0.ready.length, 1);
    assert.equal(state0.ready[0].code_letter, '—');

    // Pause stage display, then publish using stale version 0 -> auto-resumes & publishes!
    await rpc(db, 'admin_stage_topic_set_paused', [ids.venue, true, 0]);
    const shown = await rpc(db, 'admin_stage_topic_show_next', [ids.venue, 0]);
    assert.equal(shown.paused, false);
    assert.equal(shown.on_screen.code_letter, '—');

    // Replay / re-show the already-shown draw even with stale version -> succeeds!
    const replayed = await showSelected(db, {
      schedule_id: ids.schedule, registration_id: ids.registrationA,
      draw_id: drawn.assignment_id, code_letter: '—', topic_text: drawn.topic_text, item_name: 'Speech',
    }, 0, true);
    assert.equal(replayed.on_screen.draw_id, drawn.assignment_id);
  } finally { await db.close(); }
});

test('tenant, stage, event and registration safety boundaries still hold', async () => {
  const db = await setup();
  try {
    const drawn = await rpc(db, 'stage_draw_schedule_topic', [ids.secondSchedule, ids.registrationB, false, false]);
    const selected = {
      schedule_id: ids.secondSchedule, registration_id: ids.registrationB,
      draw_id: drawn.assignment_id, code_letter: 'B', topic_text: drawn.topic_text, item_name: 'Speech',
    };

    await db.query("UPDATE public.registrations SET status = 'rejected' WHERE id = $1", [ids.registrationB]);
    await assert.rejects(showSelected(db, selected), /not eligible|no longer eligible/);

    await db.query("UPDATE public.registrations SET status = 'approved' WHERE id = $1", [ids.registrationB]);
    await db.query('UPDATE public.schedules SET topic_draw_enabled = false WHERE id = $1', [ids.secondSchedule]);
    await assert.rejects(showSelected(db, selected), /Topic Draw is disabled/);

    await db.query('UPDATE public.schedules SET topic_draw_enabled = true, venue_id = $1 WHERE id = $2', [ids.secondVenue, ids.secondSchedule]);
    await assert.rejects(showSelected(db, selected), /outside this stage|does not belong to this stage/);

    await db.query("SELECT set_config('test.tenant', $1, false)", [ids.otherTenant]);
    await assert.rejects(showSelected(db, selected), /outside the current tenant/);
  } finally { await db.close(); }
});

test('frontend selectedSavedDraw works without code_letter or duration validation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/core/utils/stageTopicSelection.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', code)(mod, mod.exports);
  const { selectedSavedDraw, selectedReadyTopic } = mod.exports;

  const schedule = { id: 's1', item_name_en: 'Arabic Speech' };
  const assignment = { id: 'd1', registration_id: 'r1', topic_id: 't1', topic_text: 'Unity', drawn_at: '2026-01-01', is_current: true };
  assert.deepEqual(selectedSavedDraw(schedule, { id: 'r1', code_letter: null, participant_chest_number: '123', status: 'approved' }, assignment, null), {
    schedule_id: 's1', registration_id: 'r1', draw_id: 'd1',
    code_letter: '123', topic_text: 'Unity', item_name: 'Arabic Speech', duration_seconds: 300,
  });
  assert.equal(selectedSavedDraw(schedule, { id: 'r1', code_letter: null, status: 'rejected' }, assignment, 300), undefined);
  assert.deepEqual(
    selectedReadyTopic([{ id: 'q1', schedule_id: 's1', registration_id: 'r1', draw_id: 'd1', code_letter: '—', topic_text: 'Unity' }], 's1', 'r1', 'd1'),
    { id: 'q1', schedule_id: 's1', registration_id: 'r1', draw_id: 'd1', code_letter: '—', topic_text: 'Unity' },
  );
  assert.equal(
    selectedReadyTopic([{ id: 'q1', schedule_id: 's1', registration_id: 'r1', draw_id: 'd1', code_letter: '—', topic_text: 'Unity' }], 's1', 'r2', 'd1'),
    undefined,
  );
});
