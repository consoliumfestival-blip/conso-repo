const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migration = fs.readFileSync(path.join(
  __dirname, '../supabase/migrations/20261126082300_stage_topic_display.sql',
), 'utf8');

const ids = {
  tenant: '11111111-1111-4111-8111-111111111111',
  otherTenant: '22222222-2222-4222-8222-222222222222',
  festival: '33333333-3333-4333-8333-333333333333',
  venue: '44444444-4444-4444-8444-444444444444',
  otherVenue: '55555555-5555-4555-8555-555555555555',
  secondVenue: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  item: '66666666-6666-4666-8666-666666666666',
  schedule: '77777777-7777-4777-8777-777777777777',
  secondSchedule: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  registrationA: '88888888-8888-4888-8888-888888888888',
  registrationB: '99999999-9999-4999-8999-999999999999',
  topicA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  topicB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  topicC: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
};

const fixture = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA realtime;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid
$$;
CREATE TABLE public.venues (
  id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, name text
);
CREATE TABLE public.items (
  id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid,
  item_name_en text, item_name_ml text, item_code text
);
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, item_id uuid,
  venue_id uuid, topic_draw_enabled boolean NOT NULL DEFAULT false,
  topic_draw_duration_seconds integer NOT NULL DEFAULT 300
);
CREATE TABLE public.registrations (
  id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, item_id uuid,
  code_letter text, status text
);
CREATE TABLE public.mark_entries (schedule_id uuid, tenant_id uuid);
CREATE TABLE private.schedule_topics (
  id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, schedule_id uuid,
  topic_text text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false, updated_by uuid, updated_at timestamptz
);
CREATE TABLE private.schedule_topic_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid, festival_id uuid, schedule_id uuid,
  registration_id uuid, topic_id uuid, topic_text_snapshot text,
  is_current boolean NOT NULL DEFAULT true, replaces_assignment_id uuid,
  drawn_by uuid, drawn_at timestamptz DEFAULT now()
);
CREATE TABLE private.schedule_topic_display_states (
  schedule_id uuid PRIMARY KEY, tenant_id uuid, displayed_assignment_id uuid
);
CREATE FUNCTION public.stage_assert_admin_access() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT current_setting('test.tenant')::uuid
$$;
CREATE FUNCTION public.is_superadmin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT false
$$;
CREATE FUNCTION public.get_stage_management_registrations_scoped(
  p_schedule_id uuid, p_unused uuid
) RETURNS TABLE(id uuid, status text)
LANGUAGE sql STABLE AS $$
  SELECT r.id, r.status FROM public.registrations r
  JOIN public.schedules s ON s.item_id = r.item_id AND s.festival_id = r.festival_id
    AND s.tenant_id = r.tenant_id
  WHERE s.id = p_schedule_id
$$;
CREATE FUNCTION realtime.send(jsonb, text, text, boolean) RETURNS void
LANGUAGE sql AS $$ SELECT $$;
SELECT set_config('test.tenant', '${ids.tenant}', false);
INSERT INTO public.venues VALUES
  ('${ids.venue}', '${ids.tenant}', '${ids.festival}', 'Main stage'),
  ('${ids.secondVenue}', '${ids.tenant}', '${ids.festival}', 'Second stage'),
  ('${ids.otherVenue}', '${ids.otherTenant}', '${ids.festival}', 'Other tenant');
INSERT INTO public.items VALUES
  ('${ids.item}', '${ids.tenant}', '${ids.festival}', 'Speech', NULL, 'SP');
INSERT INTO public.schedules VALUES
  ('${ids.schedule}', '${ids.tenant}', '${ids.festival}',
   '${ids.item}', '${ids.venue}', true, 300),
  ('${ids.secondSchedule}', '${ids.tenant}', '${ids.festival}',
   '${ids.item}', '${ids.venue}', true, 420);
INSERT INTO public.registrations VALUES
  ('${ids.registrationA}', '${ids.tenant}', '${ids.festival}', '${ids.item}', 'A', 'approved'),
  ('${ids.registrationB}', '${ids.tenant}', '${ids.festival}', '${ids.item}', 'B', 'approved');
INSERT INTO private.schedule_topics VALUES
  ('${ids.topicA}', '${ids.tenant}', '${ids.festival}', '${ids.schedule}',
   'Topic A', true, false, NULL, now()),
  ('${ids.topicB}', '${ids.tenant}', '${ids.festival}', '${ids.schedule}',
   'Topic B', true, false, NULL, now()),
  ('${ids.topicC}', '${ids.tenant}', '${ids.festival}', '${ids.secondSchedule}',
   'Topic C', true, false, NULL, now());
`;

async function rpc(db, name, args) {
  const { rows } = await db.query(`SELECT public.${name}(${args.map((_, i) => `$${i + 1}`).join(', ')}) AS value`, args);
  return rows[0].value;
}

test('stage display keeps the current screen while another draw is ready', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);
    const initial = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(initial.ready.length, 0);
    assert.equal(initial.on_screen, null);
    const otherStage = await rpc(db, 'admin_stage_topic_display_state', [ids.secondVenue]);
    assert.notEqual(initial.display_token, otherStage.display_token);
    const token = initial.display_token;
    const first = await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, false, false]);
    const readyA = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(readyA.ready.length, 1);
    assert.equal(readyA.ready[0].code_letter, 'A');
    assert.equal((await rpc(db, 'get_stage_topic_display', [token])).on_screen, null);
    const shownA = await rpc(db, 'admin_stage_topic_show_next', [ids.venue, 0]);
    assert.equal(shownA.on_screen.code_letter, 'A');
    assert.equal(shownA.on_screen.duration_seconds, 300);
    const second = await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationB, false, false]);
    assert.notEqual(first.assignment_id, second.assignment_id);
    const readyB = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(readyB.on_screen.code_letter, 'A');
    assert.equal(readyB.ready.length, 1);
    assert.equal(readyB.ready[0].code_letter, 'B');
    await assert.rejects(rpc(db, 'admin_stage_topic_show_next', [ids.venue, 0]), /Stage display changed/);
    const shownB = await rpc(db, 'admin_stage_topic_show_next', [ids.venue, 1]);
    assert.equal(shownB.on_screen.code_letter, 'B');
    await db.query('UPDATE private.schedule_topics SET is_active = true WHERE id = $1', [ids.topicA]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, true, false]);
    const afterRedraw = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(afterRedraw.on_screen.code_letter, 'B');
    assert.equal(afterRedraw.ready[0].code_letter, 'A');
    const paused = await rpc(db, 'admin_stage_topic_set_paused', [ids.venue, true, 2]);
    assert.equal(paused.paused, true);
    assert.equal((await rpc(db, 'get_stage_topic_display', [token])).on_screen, null);
    await assert.rejects(rpc(db, 'admin_stage_topic_show_next', [ids.venue, 3]), /Resume the display/);
    const resumed = await rpc(db, 'admin_stage_topic_set_paused', [ids.venue, false, 3]);
    assert.equal(resumed.on_screen.code_letter, 'B');
    const shownRedraw = await rpc(db, 'admin_stage_topic_show_next', [ids.venue, 4]);
    assert.equal(shownRedraw.on_screen.code_letter, 'A');
    assert.equal((await rpc(db, 'get_stage_topic_display', [ids.otherVenue])), null);
  } finally {
    await db.close();
  }
});

test('stage display rejects cross-tenant admin reads and writes', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);
    await assert.rejects(rpc(db, 'admin_stage_topic_display_state', [ids.otherVenue]), /outside the current tenant/);
    await assert.rejects(rpc(db, 'admin_stage_topic_show_next', [ids.otherVenue, 0]), /outside the current tenant/);
    await assert.rejects(rpc(db, 'admin_stage_topic_set_paused', [ids.otherVenue, true, 0]), /outside the current tenant/);
  } finally {
    await db.close();
  }
});

test('draws from different schedules on one stage keep one FIFO audience queue', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, false, false]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.secondSchedule, ids.registrationB, false, false]);
    const ready = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.deepEqual(ready.ready.map((row) => row.schedule_id), [ids.schedule, ids.secondSchedule]);
    const first = await rpc(db, 'admin_stage_topic_show_next', [ids.venue, 0]);
    assert.equal(first.on_screen.code_letter, 'A');
    assert.equal(first.ready[0].code_letter, 'B');
    const second = await rpc(db, 'admin_stage_topic_show_next', [ids.venue, 1]);
    assert.equal(second.on_screen.code_letter, 'B');
    assert.equal(second.on_screen.duration_seconds, 420);
    assert.equal(second.ready.length, 0);
  } finally {
    await db.close();
  }
});

test('two Show Next requests using one version cannot both advance the stage', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, false, false]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.secondSchedule, ids.registrationB, false, false]);
    const results = await Promise.allSettled([
      rpc(db, 'admin_stage_topic_show_next', [ids.venue, 0]),
      rpc(db, 'admin_stage_topic_show_next', [ids.venue, 0]),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    const state = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(state.version, 1);
    assert.equal(state.on_screen.code_letter, 'A');
    assert.equal(state.ready.length, 1);
  } finally {
    await db.close();
  }
});

test('missing or changed code requires a fresh draw before it can be shown', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);
    await db.query('UPDATE public.registrations SET code_letter = NULL WHERE id = $1', [ids.registrationA]);
    const drawn = await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, false, false]);
    const waiting = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(waiting.ready.length, 0);
    await db.query('UPDATE public.registrations SET code_letter = $1 WHERE id = $2', ['Z', ids.registrationA]);
    const ready = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(ready.ready.length, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM private.schedule_topic_draws')).rows[0].n, 1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM private.stage_topic_display_queue')).rows[0].n, 0);
    await db.query('UPDATE private.schedule_topics SET is_active = true WHERE id = $1', [ids.topicA]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, true, false]);
    const queued = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(queued.ready.length, 1);
    assert.equal(queued.ready[0].registration_id, drawn.registration_id);
    assert.equal(queued.ready[0].code_letter, 'Z');
    await db.query('UPDATE public.registrations SET code_letter = $1 WHERE id = $2', ['Y', ids.registrationA]);
    await db.query('UPDATE public.schedules SET topic_draw_duration_seconds = 600 WHERE id = $1', [ids.schedule]);
    const refreshed = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(refreshed.ready.length, 0);
    await assert.rejects(rpc(db, 'admin_stage_topic_show_next', [ids.venue, 0]), /No ready topic/);
    await db.query('UPDATE private.schedule_topics SET is_active = true WHERE id = $1', [ids.topicA]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, true, false]);
    const shown = await rpc(db, 'admin_stage_topic_show_next', [ids.venue, 0]);
    assert.equal(shown.on_screen.code_letter, 'Y');
    assert.equal(shown.on_screen.duration_seconds, 600);
    await db.query('UPDATE public.registrations SET code_letter = $1 WHERE id = $2', ['Q', ids.registrationA]);
    await db.query('UPDATE public.items SET item_name_en = $1 WHERE id = $2', ['Renamed speech', ids.item]);
    await db.query('UPDATE public.schedules SET topic_draw_duration_seconds = 900 WHERE id = $1', [ids.schedule]);
    const snapshot = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(snapshot.on_screen.code_letter, 'Y');
    assert.equal(snapshot.on_screen.item_name, 'Speech');
    assert.equal(snapshot.on_screen.duration_seconds, 600);
  } finally {
    await db.close();
  }
});

test('anonymous token can read only published data and cannot call admin RPCs', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);
    const state = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, false, false]);
    await db.exec('SET ROLE anon');
    const publicState = await rpc(db, 'get_stage_topic_display', [state.display_token]);
    assert.equal(publicState.on_screen, null);
    assert.equal('ready' in publicState, false);
    assert.equal('venue_id' in publicState, false);
    await assert.rejects(rpc(db, 'admin_stage_topic_display_state', [ids.venue]), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM private.stage_topic_display_queue'), /permission denied/);
  } finally {
    await db.close();
  }
});

test('a moved schedule cannot publish its stale draw on either stage without re-draw', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);
    const original = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, false, false]);
    await db.query('UPDATE public.schedules SET venue_id = $1 WHERE id = $2', [ids.secondVenue, ids.schedule]);
    const state = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.equal(state.ready.length, 0);
    assert.equal(state.display_token, original.display_token);
    await assert.rejects(rpc(db, 'admin_stage_topic_show_next', [ids.venue, 0]), /No ready topic/);
    const moved = await rpc(db, 'admin_stage_topic_display_state', [ids.secondVenue]);
    assert.equal(moved.ready.length, 0);
    await db.query('UPDATE private.schedule_topics SET is_active = true WHERE id = $1', [ids.topicA]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, true, false]);
    const newStage = await rpc(db, 'admin_stage_topic_display_state', [ids.secondVenue]);
    assert.equal(newStage.ready.length, 1);
    assert.equal(newStage.ready[0].code_letter, 'A');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM private.stage_topic_display_queue')).rows[0].n, 1);
  } finally {
    await db.close();
  }
});

test('redrawing a pending participant keeps FIFO order', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, false, false]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationB, false, false]);
    await db.query('UPDATE private.schedule_topics SET is_active = true WHERE id = $1', [ids.topicA]);
    await rpc(db, 'stage_draw_schedule_topic', [ids.schedule, ids.registrationA, true, false]);
    const state = await rpc(db, 'admin_stage_topic_display_state', [ids.venue]);
    assert.deepEqual(state.ready.map((row) => row.code_letter), ['A', 'B']);
    assert.equal(state.ready.length, 2);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM private.stage_topic_display_queue')).rows[0].n, 2);
  } finally {
    await db.close();
  }
});
