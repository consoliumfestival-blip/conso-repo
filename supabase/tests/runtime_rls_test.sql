-- ============================================================
-- RUNTIME RLS TEST SUITE: Team Leader Security Foundation
-- ============================================================
\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS _test;

CREATE OR REPLACE FUNCTION _test.assert(condition boolean, msg text)
RETURNS void AS $$
BEGIN
  IF NOT condition THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', msg;
  END IF;
  RAISE NOTICE '  PASS: %', msg;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION _test.assert_rows(query text, expected integer, msg text)
RETURNS void AS $$
DECLARE actual integer;
BEGIN
  EXECUTE query INTO actual;
  IF actual != expected THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % (expected %, got %)', msg, expected, actual;
  END IF;
  RAISE NOTICE '  PASS: % (rows=%)', msg, actual;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN RAISE NOTICE '=== SECTION 1: FIXTURES ==='; END $$;

-- Tenants
INSERT INTO public.tenants (id, name, org_type, subscription_status)
VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'Tenant Alpha', 'STATE', 'active'),
  ('b0000000-0000-0000-0000-000000000001'::uuid, 'Tenant Beta',  'STATE', 'active')
ON CONFLICT (id) DO NOTHING;

-- Organisations for Tenant Alpha (unique org per team)
INSERT INTO public.organisations (id, tenant_id, name, org_type, parent_id)
VALUES
  ('20000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'Alpha Root Org', 'STATE', NULL),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'Alpha Unit A', 'UNIT', '20000000-0000-0000-0000-000000000001'::uuid),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'Alpha Unit B', 'UNIT', '20000000-0000-0000-0000-000000000001'::uuid),
  ('20000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'Alpha Unit C', 'UNIT', '20000000-0000-0000-0000-000000000001'::uuid),
  ('20000000-0000-0000-0000-000000000005'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'Alpha Unit D', 'UNIT', '20000000-0000-0000-0000-000000000001'::uuid),
  ('20000000-0000-0000-0000-000000000006'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'Alpha Unit E', 'UNIT', '20000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Organisation for Tenant Beta
INSERT INTO public.organisations (id, tenant_id, name, org_type, parent_id)
VALUES
  ('20000000-0000-0000-0000-000000000011'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 'Beta Root Org', 'STATE', NULL)
ON CONFLICT (id) DO NOTHING;

-- Festivals
INSERT INTO public.festival_calendar (id, tenant_id, custom_name, festival_year, start_date, end_date, is_active, festival_template)
VALUES
  ('30000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'Alpha Fest 2026', 2026, '2026-01-01', '2026-12-31', true, 'sahithyolsav'),
  ('30000000-0000-0000-0000-000000000011'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 'Beta Fest 2026',  2026, '2026-01-01', '2026-12-31', true, 'sahithyolsav')
ON CONFLICT (id) DO NOTHING;

-- Festival teams (each with unique festival+org)
INSERT INTO public.festival_teams (id, parent_tenant_id, festival_id, organisation_id, is_active)
VALUES
  ('40000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, true),
  ('40000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000003'::uuid, true),
  ('40000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000004'::uuid, true),
  ('40000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000005'::uuid, true),
  ('40000000-0000-0000-0000-000000000005'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000006'::uuid, true),
  ('40000000-0000-0000-0000-000000000011'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000011'::uuid, '20000000-0000-0000-0000-000000000011'::uuid, true)
ON CONFLICT (id) DO NOTHING;

-- Update profiles to team_leader role for TL users
UPDATE public.profiles SET role = 'team_leader', tenant_id = 'a0000000-0000-0000-0000-000000000001'::uuid
WHERE id IN (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  '44444444-4444-4444-4444-444444444444'::uuid,
  '55555555-5555-5555-5555-555555555555'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
);
UPDATE public.profiles SET role = 'team_leader', tenant_id = 'b0000000-0000-0000-0000-000000000001'::uuid
WHERE id = '33333333-3333-3333-3333-333333333333'::uuid;

-- Team Leader Assignments (one active per team, unique team per active assignment)
INSERT INTO public.team_leader_assignments (id, festival_team_id, user_id, status, valid_from, valid_until, revoked_at)
VALUES
  ('50000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'active', '2026-01-01', NULL, NULL),
  ('50000000-0000-0000-0000-000000000002'::uuid, '40000000-0000-0000-0000-000000000002'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'active', '2026-01-01', NULL, NULL),
  ('50000000-0000-0000-0000-000000000003'::uuid, '40000000-0000-0000-0000-000000000003'::uuid, '44444444-4444-4444-4444-444444444444'::uuid, 'revoked', '2026-01-01', NULL, '2026-06-01'),
  ('50000000-0000-0000-0000-000000000004'::uuid, '40000000-0000-0000-0000-000000000004'::uuid, '55555555-5555-5555-5555-555555555555'::uuid, 'active', '2025-01-01', '2025-06-01', NULL),
  ('50000000-0000-0000-0000-000000000005'::uuid, '40000000-0000-0000-0000-000000000005'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'active', '2027-01-01', NULL, NULL),
  ('50000000-0000-0000-0000-000000000011'::uuid, '40000000-0000-0000-0000-000000000011'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'active', '2026-01-01', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Items (correct columns: item_code, item_name_en, category_codes)
INSERT INTO public.items (id, tenant_id, festival_id, item_code, item_name_en, item_type, category_codes)
VALUES
  ('60000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'STORY', 'Story Writing', 'individual', ARRAY['STORY']),
  ('60000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'POETRY', 'Poetry Reading', 'group', ARRAY['POETRY'])
ON CONFLICT (id) DO NOTHING;

-- Participants (unique emails required)
INSERT INTO public.participants (id, tenant_id, festival_id, organisation_id, name, category_code, status, email)
VALUES
  ('70000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'Alpha Student A', 'STORY', 'active', 'student-a@test.com'),
  ('70000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'Alpha Student B', 'STORY', 'active', 'student-b@test.com'),
  ('70000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000003'::uuid, 'Alpha Student C', 'POETRY', 'active', 'student-c@test.com'),
  ('70000000-0000-0000-0000-000000000011'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000011'::uuid, '20000000-0000-0000-0000-000000000011'::uuid, 'Beta Student X', 'STORY', 'active', 'student-x@test.com')
ON CONFLICT (id) DO NOTHING;

-- Registrations (each registration_id must be unique across results)
INSERT INTO public.registrations (id, tenant_id, festival_id, item_id, participant_id, organisation_id, status, code_letter, is_verified)
VALUES
  ('80000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'approved', 'A01', true),
  ('80000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000002'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'approved', 'A02', true),
  ('80000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000002'::uuid, '70000000-0000-0000-0000-000000000003'::uuid, '20000000-0000-0000-0000-000000000003'::uuid, 'approved', 'B01', true),
  ('80000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000002'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'approved', 'B02', true),
  ('80000000-0000-0000-0000-000000000005'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000002'::uuid, '70000000-0000-0000-0000-000000000002'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'approved', 'B03', true),
  ('80000000-0000-0000-0000-000000000011'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000011'::uuid, '60000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000011'::uuid, '20000000-0000-0000-0000-000000000011'::uuid, 'approved', 'X01', true)
ON CONFLICT (id) DO NOTHING;

-- Venues
INSERT INTO public.venues (id, tenant_id, festival_id, name, venue_type)
VALUES
  ('90000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'Main Stage', 'stage'),
  ('90000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'Hall B', 'hall'),
  ('90000000-0000-0000-0000-000000000011'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000011'::uuid, 'Beta Hall', 'hall')
ON CONFLICT (id) DO NOTHING;

-- Schedules (include expected_judge_count)
INSERT INTO public.schedules (id, tenant_id, festival_id, item_id, venue_id, start_time, end_time, status, expected_judge_count)
VALUES
  ('aa000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000001'::uuid, '90000000-0000-0000-0000-000000000001'::uuid, '2026-08-01 09:00:00+05:30', '2026-08-01 10:00:00+05:30', 'scheduled', 3),
  ('aa000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000002'::uuid, '90000000-0000-0000-0000-000000000002'::uuid, '2026-08-01 11:00:00+05:30', '2026-08-01 12:00:00+05:30', 'scheduled', 3),
  ('aa000000-0000-0000-0000-000000000011'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000011'::uuid, '60000000-0000-0000-0000-000000000001'::uuid, '90000000-0000-0000-0000-000000000011'::uuid, '2026-08-02 09:00:00+05:30', '2026-08-02 10:00:00+05:30', 'scheduled', 3)
ON CONFLICT (id) DO NOTHING;

-- Attendance (correct columns: participant_id, schedule_id, checkin_time, status)
INSERT INTO public.attendance (id, tenant_id, participant_id, schedule_id, checkin_time, status)
VALUES
  ('bb000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, 'aa000000-0000-0000-0000-000000000001'::uuid, '2026-08-01 09:05:00+05:30', 'present'),
  ('bb000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000002'::uuid, 'aa000000-0000-0000-0000-000000000001'::uuid, NULL, 'absent')
ON CONFLICT (id) DO NOTHING;

-- Results (triple-gate test data, each registration_id unique)
INSERT INTO public.results (id, tenant_id, festival_id, item_id, registration_id, total_score, rank, grade, published, result_status, public_visible)
VALUES
  ('cc000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000001'::uuid, 95.5, 1, 'A+', true, 'published', true),
  ('cc000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000002'::uuid, 88.0, 2, 'A', true, 'published', false),
  ('cc000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000002'::uuid, '80000000-0000-0000-0000-000000000003'::uuid, NULL, NULL, NULL, false, 'draft', false),
  ('cc000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000002'::uuid, '80000000-0000-0000-0000-000000000004'::uuid, 75.0, 3, 'B', true, 'hidden', false),
  ('cc000000-0000-0000-0000-000000000005'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000002'::uuid, '80000000-0000-0000-0000-000000000005'::uuid, 65.0, 4, 'C', true, 'published', true),
  ('cc000000-0000-0000-0000-000000000011'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000011'::uuid, '60000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000011'::uuid, 90.0, 1, 'A+', true, 'published', true)
ON CONFLICT (id) DO NOTHING;

-- Announcements
INSERT INTO public.announcements (id, tenant_id, festival_id, title, message, type, target_role)
VALUES
  ('dd000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'Team A Notice', 'Schedule change', 'info', 'team_leader'),
  ('dd000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'General Notice', 'Festival starts tomorrow', 'info', 'general'),
  ('dd000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'Judge Notice', 'Scoring updated', 'info', 'judge'),
  ('dd000000-0000-0000-0000-000000000011'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000011'::uuid, 'Beta Notice', 'Beta festival notice', 'info', 'team_leader')
ON CONFLICT (id) DO NOTHING;

-- Point table
INSERT INTO public.point_table (id, tenant_id, festival_id, org_id, category_code, total_points)
VALUES
  ('ee000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'STORY', 50),
  ('ee000000-0000-0000-0000-000000000011'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000011'::uuid, '20000000-0000-0000-0000-000000000011'::uuid, 'STORY', 30)
ON CONFLICT (id) DO NOTHING;

-- Group members
INSERT INTO public.group_members (id, registration_id, participant_id, is_locked)
VALUES
  ('ff000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000003'::uuid, '70000000-0000-0000-0000-000000000003'::uuid, false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN RAISE NOTICE '=== FIXTURES CREATED ==='; END $$;

-- ============================================================
-- SECTION 2: RPC ACCESS CONTROL
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 2: RPC ACCESS CONTROL ==='; END $$;

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines WHERE routine_name = 'get_team_leader_context' AND routine_schema = 'public') = 1,
  'T2.1: get_team_leader_context function exists'
);

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines WHERE routine_name = 'get_team_leader_participants' AND routine_schema = 'public') = 1,
  'T2.2: get_team_leader_participants function exists'
);

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines WHERE routine_name = 'get_team_leader_schedule' AND routine_schema = 'public') = 1,
  'T2.3: get_team_leader_schedule function exists'
);

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines WHERE routine_name = 'get_team_leader_published_results' AND routine_schema = 'public') = 1,
  'T2.4: get_team_leader_published_results function exists'
);

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines WHERE routine_name = 'get_team_leader_announcements' AND routine_schema = 'public') = 1,
  'T2.5: get_team_leader_announcements function exists'
);

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines WHERE routine_name = 'get_team_leader_standings' AND routine_schema = 'public') = 1,
  'T2.6: get_team_leader_standings function exists'
);

-- ============================================================
-- SECTION 3: ZERO-PARAMETER VERIFICATION
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 3: ZERO PARAMETERS ==='; END $$;

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines r JOIN information_schema.parameters p ON r.specific_name = p.specific_name WHERE r.routine_name = 'get_team_leader_context' AND p.parameter_mode = 'IN' AND p.parameter_name IS NOT NULL) = 0,
  'T3.1: get_team_leader_context has zero IN params'
);

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines r JOIN information_schema.parameters p ON r.specific_name = p.specific_name WHERE r.routine_name = 'get_team_leader_participants' AND p.parameter_mode = 'IN' AND p.parameter_name IS NOT NULL) = 0,
  'T3.2: get_team_leader_participants has zero IN params'
);

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines r JOIN information_schema.parameters p ON r.specific_name = p.specific_name WHERE r.routine_name = 'get_team_leader_schedule' AND p.parameter_mode = 'IN' AND p.parameter_name IS NOT NULL) = 0,
  'T3.3: get_team_leader_schedule has zero IN params'
);

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines r JOIN information_schema.parameters p ON r.specific_name = p.specific_name WHERE r.routine_name = 'get_team_leader_published_results' AND p.parameter_mode = 'IN' AND p.parameter_name IS NOT NULL) = 0,
  'T3.4: get_team_leader_published_results has zero IN params'
);

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines r JOIN information_schema.parameters p ON r.specific_name = p.specific_name WHERE r.routine_name = 'get_team_leader_announcements' AND p.parameter_mode = 'IN' AND p.parameter_name IS NOT NULL) = 0,
  'T3.5: get_team_leader_announcements has zero IN params'
);

SELECT _test.assert(
  (SELECT count(*) FROM information_schema.routines r JOIN information_schema.parameters p ON r.specific_name = p.specific_name WHERE r.routine_name = 'get_team_leader_standings' AND p.parameter_mode = 'IN' AND p.parameter_name IS NOT NULL) = 0,
  'T3.6: get_team_leader_standings has zero IN params'
);

-- ============================================================
-- SECTION 4: SECURITY DEFINER
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 4: SECURITY DEFINER ==='; END $$;

SELECT _test.assert(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname IN ('get_team_leader_context','get_team_leader_participants','get_team_leader_schedule','get_team_leader_published_results','get_team_leader_announcements','get_team_leader_standings') AND p.prosecdef = true) = 6,
  'T4.1: All 6 RPCs are SECURITY DEFINER'
);

-- ============================================================
-- SECTION 5: RLS ENABLED ON CORE TABLES
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 5: RLS ON CORE TABLES ==='; END $$;

SELECT _test.assert(
  (SELECT count(*) FROM pg_tables t JOIN pg_class c ON c.relname = t.tablename
   WHERE t.schemaname = 'public'
   AND t.tablename IN ('schedules','venues','attendance','point_table','announcements','group_members')
   AND c.relrowsecurity = true) = 6,
  'T5.1: RLS enabled on all 6 team-scoped tables'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_tables t JOIN pg_class c ON c.relname = t.tablename
   WHERE t.schemaname = 'public'
   AND t.tablename IN ('team_leader_assignments','festival_teams')
   AND c.relrowsecurity = true) = 2,
  'T5.2: RLS enabled on team_leader_assignments and festival_teams'
);

-- ============================================================
-- SECTION 6: RESTRICTIVE DENY POLICIES FOR TEAM LEADERS
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 6: RESTRICTIVE DENY POLICIES ==='; END $$;

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'schedules' AND policyname LIKE 'deny_team_leader_direct%' AND with_check = '(NOT is_team_leader())') >= 1,
  'T6.1: Deny policy on schedules blocks team_leader'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'venues' AND policyname LIKE 'deny_team_leader_direct%' AND with_check = '(NOT is_team_leader())') >= 1,
  'T6.2: Deny policy on venues blocks team_leader'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attendance' AND policyname LIKE 'deny_team_leader_direct%' AND with_check = '(NOT is_team_leader())') >= 1,
  'T6.3: Deny policy on attendance blocks team_leader'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'point_table' AND policyname LIKE 'deny_team_leader_direct%' AND with_check = '(NOT is_team_leader())') >= 1,
  'T6.4: Deny policy on point_table blocks team_leader'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'announcements' AND policyname LIKE 'deny_team_leader_direct%' AND with_check = '(NOT is_team_leader())') >= 1,
  'T6.5: Deny policy on announcements blocks team_leader'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'group_members' AND policyname LIKE 'deny_team_leader_direct%' AND with_check = '(NOT is_team_leader())') >= 1,
  'T6.6: Deny policy on group_members blocks team_leader'
);

-- ============================================================
-- SECTION 7: PERMISSIVE READ POLICIES
-- schedules & venues: public read (anon + authenticated)
-- attendance, point_table, announcements, group_members: tenant-access (authenticated only)
-- Team leaders access ALL via SECURITY DEFINER RPCs, not direct table reads.
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 7: PERMISSIVE READ POLICIES ==='; END $$;

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'schedules' AND cmd = 'SELECT' AND policyname LIKE 'team_foundation_public%') >= 1,
  'T7.1: Public read policy exists on schedules'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'venues' AND cmd = 'SELECT' AND policyname LIKE 'team_foundation_public%') >= 1,
  'T7.2: Public read policy exists on venues'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attendance' AND policyname LIKE 'team_foundation%_tenant_access%') >= 1,
  'T7.3: Tenant-access policy exists on attendance'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'point_table' AND policyname LIKE 'team_foundation%_tenant_access%') >= 1,
  'T7.4: Tenant-access policy exists on point_table'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'announcements' AND policyname LIKE 'team_foundation%_tenant_access%') >= 1,
  'T7.5: Tenant-access policy exists on announcements'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'group_members' AND policyname LIKE 'team_foundation%_tenant_access%') >= 1,
  'T7.6: Tenant-access policy exists on group_members'
);

-- ============================================================
-- SECTION 8: TEAM LEADER ASSIGNMENT CONSTRAINTS
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 8: ASSIGNMENT CONSTRAINTS ==='; END $$;

SELECT _test.assert(
  (SELECT count(*) FROM pg_constraint c JOIN pg_class r ON c.conrelid = r.oid WHERE r.relname = 'team_leader_assignments' AND c.conname = 'team_leader_assignment_valid_window') = 1,
  'T8.1: valid_window CHECK constraint'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_constraint c JOIN pg_class r ON c.conrelid = r.oid WHERE r.relname = 'team_leader_assignments' AND c.conname = 'team_leader_assignments_status_check') = 1,
  'T8.2: status CHECK constraint'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class r ON t.tgrelid = r.oid WHERE r.relname = 'team_leader_assignments' AND t.tgname = 'trg_validate_team_leader_assignment') = 1,
  'T8.3: validate trigger exists'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_indexes WHERE tablename = 'team_leader_assignments' AND indexname = 'team_leader_one_active_per_team_idx') = 1,
  'T8.4: unique one-active-per-team index'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_indexes WHERE tablename = 'team_leader_assignments' AND indexname = 'team_leader_one_active_assignment_per_festival_idx') = 1,
  'T8.5: unique one-active-per-festival index'
);

-- ============================================================
-- SECTION 9: POLICY COMPLETENESS ON ASSIGNMENT TABLES
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 9: ASSIGNMENT TABLE POLICIES ==='; END $$;

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'team_leader_assignments' AND policyname = 'team_leader_assignments_admin_manage') = 1,
  'T9.1: team_leader_assignments admin_manage policy'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'team_leader_assignments' AND policyname = 'team_leader_assignments_self_read') = 1,
  'T9.2: team_leader_assignments self_read policy'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'festival_teams' AND policyname = 'festival_teams_admin_manage') = 1,
  'T9.3: festival_teams admin_manage policy'
);

SELECT _test.assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'festival_teams' AND policyname = 'festival_teams_team_leader_read') = 1,
  'T9.4: festival_teams team_leader_read policy'
);

-- ============================================================
-- SECTION 10: TRIPLE-GATE ON PUBLISHED RESULTS
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 10: TRIPLE-GATE DATA VERIFICATION ==='; END $$;

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.results WHERE published = true AND result_status = ''published'' AND public_visible = true',
  3,
  'T10.1: 3 results pass triple-gate'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.results WHERE NOT (published = true AND result_status = ''published'' AND public_visible = true)',
  3,
  'T10.2: 3 results fail triple-gate'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.results WHERE published = true AND result_status = ''published'' AND public_visible = true AND rank >= 4',
  1,
  'T10.3: Grade-only rank 4+ result passes triple-gate'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.results WHERE published = true AND result_status = ''published'' AND public_visible = false',
  1,
  'T10.4: Published+published but public_visible=false is excluded'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.results WHERE result_status = ''draft''',
  1,
  'T10.5: Draft result exists and is excluded from triple-gate'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.results WHERE result_status = ''hidden''',
  1,
  'T10.6: Hidden result_status exists and is excluded from triple-gate'
);

-- ============================================================
-- SECTION 11: CROSS-TENANT DATA VERIFICATION
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 11: CROSS-TENANT ISOLATION ==='; END $$;

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.schedules WHERE tenant_id = ''a0000000-0000-0000-0000-000000000001''::uuid',
  2,
  'T11.1: Tenant Alpha has 2 schedules'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.schedules WHERE tenant_id = ''b0000000-0000-0000-0000-000000000001''::uuid',
  1,
  'T11.2: Tenant Beta has 1 schedule'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.participants WHERE tenant_id = ''a0000000-0000-0000-0000-000000000001''::uuid',
  3,
  'T11.3: Tenant Alpha has 3 participants'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.participants WHERE tenant_id = ''b0000000-0000-0000-0000-000000000001''::uuid',
  1,
  'T11.4: Tenant Beta has 1 participant'
);

-- ============================================================
-- SECTION 12: REVOKED / EXPIRED / FUTURE ASSIGNMENT SCENARIOS
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 12: EDGE CASE ASSIGNMENTS ==='; END $$;

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.team_leader_assignments WHERE user_id = ''44444444-4444-4444-4444-444444444444''::uuid AND status = ''revoked''',
  1,
  'T12.1: TL-REVOKED has 1 revoked assignment'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.team_leader_assignments WHERE user_id = ''55555555-5555-5555-5555-555555555555''::uuid AND valid_until < now()',
  1,
  'T12.2: TL-EXPIRED has expired valid_until'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.team_leader_assignments WHERE user_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''::uuid AND valid_from > now()',
  1,
  'T12.3: Future-user has future valid_from'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.team_leader_assignments WHERE status = ''active'' AND revoked_at IS NULL AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())',
  3,
  'T12.4: 3 assignments are active+valid+not-revoked'
);

-- ============================================================
-- SECTION 13: SERVICE_ROLE BYPASSES RLS
-- ============================================================
DO $$ BEGIN RAISE NOTICE '=== SECTION 13: SERVICE_ROLE BYPASS ==='; END $$;

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.schedules',
  3,
  'T13.1: service_role sees all 3 schedules (RLS bypassed)'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.results',
  6,
  'T13.2: service_role sees all 6 results (RLS bypassed)'
);

SELECT _test.assert_rows(
  'SELECT count(*) FROM public.announcements',
  4,
  'T13.3: service_role sees all 4 announcements (RLS bypassed)'
);

-- ============================================================
-- SUMMARY
-- ============================================================
DO $$ BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '  ALL RUNTIME RLS TESTS PASSED';
  RAISE NOTICE '========================================';
END $$;
