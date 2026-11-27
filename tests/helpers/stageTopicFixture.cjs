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


module.exports = { ids, fixture, rpc };
