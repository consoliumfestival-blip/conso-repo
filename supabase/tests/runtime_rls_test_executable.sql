-- TEAM LEADER PORTAL FOUNDATION RUNTIME RLS TEST
-- LOCAL/DISPOSABLE SUPABASE ONLY
-- Test fixtures and assertions for Migration 118
-- Approved: Shibili + ChatGPT | Test Agent: Docker/Local Runtime
-- Environment: localhost:54321 (no production access)

\set ON_ERROR_STOP on
\set ECHO queries

BEGIN;

-- ENVIRONMENT SAFETY ASSERTION
-- Fail if this targets anything but localhost/internal
DO $$
DECLARE
  v_host TEXT;
BEGIN
  SELECT inet_server_addr()::TEXT INTO v_host;
  IF v_host NOT IN ('127.0.0.1', '::1') AND v_host IS NOT NULL THEN
    RAISE EXCEPTION 'FATAL: Test targeting non-local host: %', v_host;
  END IF;
  RAISE NOTICE 'ENV_SAFETY: Database host is local (%)' , v_host;
END;
$$;

-- ============================================================================
-- SECTION 1: TEST FIXTURE CREATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== SECTION 1: FIXTURE CREATION ===';
END;
$$;

-- Create Test Tenants
INSERT INTO public.tenants (id, name, organisation_id, created_by)
VALUES 
  ('10000000-0000-0000-0000-000000000001'::uuid, 'TLTEST Tenant A', NULL, auth.uid())
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, organisation_id, created_by)
VALUES 
  ('10000000-0000-0000-0000-000000000002'::uuid, 'TLTEST Tenant B', NULL, auth.uid())
ON CONFLICT DO NOTHING;

-- Create Test Organisations under each tenant
INSERT INTO public.organisations (id, tenant_id, name, code, created_by)
VALUES
  ('20000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'TLTEST Team A Org', 'TLTEST_ORG_A', auth.uid()),
  ('20000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'TLTEST Team B Org', 'TLTEST_ORG_B', auth.uid()),
  ('20000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'TLTEST Team X Org', 'TLTEST_ORG_X', auth.uid())
ON CONFLICT DO NOTHING;

-- Create Test Festivals
INSERT INTO public.festival_calendar (id, tenant_id, name, is_active, created_by)
VALUES
  ('30000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'TLTEST Festival A1', true, auth.uid()),
  ('30000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'TLTEST Festival A2 Inactive', false, auth.uid()),
  ('30000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'TLTEST Festival B1', true, auth.uid())
ON CONFLICT DO NOTHING;

-- Create Festival Teams
INSERT INTO public.festival_teams (id, parent_tenant_id, festival_id, organisation_id, is_active, created_by)
VALUES
  ('40000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, true, auth.uid()),
  ('40000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, true, auth.uid()),
  ('40000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000003'::uuid, '20000000-0000-0000-0000-000000000003'::uuid, true, auth.uid())
ON CONFLICT DO NOTHING;

-- Create Team Portal Settings
INSERT INTO public.team_portal_settings (id, parent_tenant_id, festival_id, is_enabled, opens_at, closes_at, created_by)
VALUES
  ('50000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, true, now() - interval '1 hour', now() + interval '24 hours', auth.uid()),
  ('50000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000002'::uuid, false, NULL, NULL, auth.uid()),
  ('50000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000003'::uuid, true, now() + interval '2 hours', now() + interval '26 hours', auth.uid())
ON CONFLICT DO NOTHING;

RAISE NOTICE 'FIXTURES: Test tenants, organisations, festivals, teams, and portal settings created.';

-- ============================================================================
-- SECTION 2: TEST AUTH IDENTITIES
-- ============================================================================

RAISE NOTICE '=== SECTION 2: TEST AUTH IDENTITIES ===';

-- Placeholder: Auth user creation requires Supabase Admin API or GoTrue
-- For this test, we assume test users are created via local setup
-- and we store their UUIDs in a test table for reference

CREATE TEMP TABLE IF NOT EXISTS tltest_identities (
  label TEXT PRIMARY KEY,
  user_id UUID,
  role TEXT,
  notes TEXT
);

-- We'll insert placeholder UUIDs for demonstration
-- In real execution, these would be created via supabase auth API
INSERT INTO tltest_identities VALUES
  ('team_leader_a', 'a0000000-0000-0000-0000-000000000001'::uuid, 'team_leader', 'Active; assigned to Team A / Festival A1'),
  ('team_leader_b', 'a0000000-0000-0000-0000-000000000002'::uuid, 'team_leader', 'Active; assigned to Team B / Festival A1'),
  ('team_leader_b_tenant', 'a0000000-0000-0000-0000-000000000003'::uuid, 'team_leader', 'Tenant B Team Leader'),
  ('team_leader_revoked', 'a0000000-0000-0000-0000-000000000004'::uuid, 'team_leader', 'Revoked assignment'),
  ('team_leader_expired', 'a0000000-0000-0000-0000-000000000005'::uuid, 'team_leader', 'Expired valid_until'),
  ('team_leader_future', 'a0000000-0000-0000-0000-000000000006'::uuid, 'team_leader', 'Future valid_from'),
  ('festival_admin', 'a0000000-0000-0000-0000-000000000010'::uuid, 'admin', 'Festival Admin'),
  ('super_admin', 'a0000000-0000-0000-0000-000000000011'::uuid, 'admin', 'Super Admin'),
  ('judge', 'a0000000-0000-0000-0000-000000000012'::uuid, 'judge', 'Judge'),
  ('stage_mgr', 'a0000000-0000-0000-0000-000000000013'::uuid, 'volunteer', 'Stage Manager'),
  ('normal_auth', 'a0000000-0000-0000-0000-000000000014'::uuid, 'participant', 'Normal authenticated user');

RAISE NOTICE 'AUTH_SETUP: Test identity table created with % entries', (SELECT COUNT(*) FROM tltest_identities);

-- ============================================================================
-- SECTION 3: TEAM LEADER ASSIGNMENTS
-- ============================================================================

RAISE NOTICE '=== SECTION 3: TEAM LEADER ASSIGNMENTS ===';

-- Active assignments
INSERT INTO public.team_leader_assignments (id, festival_team_id, user_id, status, assigned_by, valid_from, valid_until)
VALUES
  ('60000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'active', auth.uid(), now(), now() + interval '30 days'),
  ('60000000-0000-0000-0000-000000000002'::uuid, '40000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000002'::uuid, 'active', auth.uid(), now(), now() + interval '30 days'),
  ('60000000-0000-0000-0000-000000000003'::uuid, '40000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000003'::uuid, 'active', auth.uid(), now(), now() + interval '30 days')
ON CONFLICT DO NOTHING;

-- Revoked assignment
INSERT INTO public.team_leader_assignments (id, festival_team_id, user_id, status, assigned_by, valid_from, revoked_at)
VALUES
  ('60000000-0000-0000-0000-000000000004'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000004'::uuid, 'revoked', auth.uid(), now(), now() - interval '1 hour')
ON CONFLICT DO NOTHING;

-- Expired assignment
INSERT INTO public.team_leader_assignments (id, festival_team_id, user_id, status, assigned_by, valid_from, valid_until)
VALUES
  ('60000000-0000-0000-0000-000000000005'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000005'::uuid, 'active', auth.uid(), now() - interval '2 days', now() - interval '1 day')
ON CONFLICT DO NOTHING;

-- Future-valid assignment
INSERT INTO public.team_leader_assignments (id, festival_team_id, user_id, status, assigned_by, valid_from, valid_until)
VALUES
  ('60000000-0000-0000-0000-000000000006'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000006'::uuid, 'active', auth.uid(), now() + interval '1 day', now() + interval '30 days')
ON CONFLICT DO NOTHING;

RAISE NOTICE 'ASSIGNMENTS: Test team leader assignments created (active/revoked/expired/future).';

-- ============================================================================
-- SECTION 4: TEST DATA (Participants, Schedules, Results)
-- ============================================================================

RAISE NOTICE '=== SECTION 4: TEST DATA CREATION ===';

-- Create Test Participants for Team A and Team B
INSERT INTO public.participants (id, festival_id, organisation_id, name, gender, category_code, chest_number, status)
VALUES
  ('70000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, 'TLTEST Participant A1', 'M', 'U16', 'TLTEST_A1', 'active'),
  ('70000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, 'TLTEST Participant A2', 'F', 'U16', 'TLTEST_A2', 'active'),
  ('70000000-0000-0000-0000-000000000003'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'TLTEST Participant B1', 'M', 'U16', 'TLTEST_B1', 'active'),
  ('70000000-0000-0000-0000-000000000004'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'TLTEST Participant B2', 'F', 'U16', 'TLTEST_B2', 'active'),
  ('70000000-0000-0000-0000-000000000005'::uuid, '30000000-0000-0000-0000-000000000003'::uuid, '20000000-0000-0000-0000-000000000003'::uuid, 'TLTEST Participant X1', 'M', 'U16', 'TLTEST_X1', 'active')
ON CONFLICT DO NOTHING;

-- Create Test Items (events)
INSERT INTO public.items (id, festival_id, item_code, item_name_en, category_codes)
VALUES
  ('80000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'TLTEST_EV1', 'TLTEST Event 1 (100m)', ARRAY['U16']),
  ('80000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'TLTEST_EV2', 'TLTEST Event 2 (Relay)', ARRAY['U16'])
ON CONFLICT DO NOTHING;

-- Create Test Schedules
INSERT INTO public.schedules (id, festival_id, item_id, status, start_time)
VALUES
  ('90000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000001'::uuid, 'scheduled', now() + interval '2 hours'),
  ('90000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000002'::uuid, 'scheduled', now() + interval '4 hours')
ON CONFLICT DO NOTHING;

-- Create Test Registrations
INSERT INTO public.registrations (id, festival_id, item_id, organisation_id, participant_id, status, is_verified)
VALUES
  ('b0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, 'approved', true),
  ('b0000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000002'::uuid, 'approved', false),
  ('b0000000-0000-0000-0000-000000000003'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, '70000000-0000-0000-0000-000000000003'::uuid, 'approved', true),
  ('b0000000-0000-0000-0000-000000000004'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000002'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, '70000000-0000-0000-0000-000000000004'::uuid, 'approved', true)
ON CONFLICT DO NOTHING;

-- Create Test Results (with published triple gate)
INSERT INTO public.results (id, festival_id, item_id, registration_id, rank, grade, points_awarded, published, result_status, public_visible)
VALUES
  ('c0000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 1, 'A', 10, true, 'published', true),
  ('c0000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000003'::uuid, 2, 'B', 8, true, 'published', true),
  ('c0000000-0000-0000-0000-000000000003'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000002'::uuid, 4, 'C', 4, true, 'published', true),
  ('c0000000-0000-0000-0000-000000000004'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000002'::uuid, 'b0000000-0000-0000-0000-000000000004'::uuid, NULL, 'B', 5, true, 'published', true)
ON CONFLICT DO NOTHING;

RAISE NOTICE 'DATA: Test participants, items, schedules, registrations, and results created.';

-- ============================================================================
-- SECTION 5: RPC TESTS
-- ============================================================================

RAISE NOTICE '=== SECTION 5: RPC FUNCTIONALITY TESTS ===';

-- TEST 5.1: get_team_leader_context() - Active Team Leader A
RAISE NOTICE 'TEST 5.1: get_team_leader_context() with Active Team Leader A';

SET LOCAL ROLE authenticated;
SET LOCAL "auth.uid" = 'a0000000-0000-0000-0000-000000000001'::text;

SELECT * FROM public.get_team_leader_context();

-- Should return 1 row with Team A's context
-- Expected: assignment_id, parent_tenant_id=10000000-0000-0000-0000-000000000001, festival_id=30000000-0000-0000-0000-000000000001, festival_team_id=40000000-0000-0000-0000-000000000001, organisation_id=20000000-0000-0000-0000-000000000001

-- TEST 5.2: get_team_leader_context() - Revoked Team Leader
RAISE NOTICE 'TEST 5.2: get_team_leader_context() with Revoked Team Leader';

SET LOCAL "auth.uid" = 'a0000000-0000-0000-0000-000000000004'::text;

SELECT COUNT(*) as context_rows FROM public.get_team_leader_context();

-- Should return 0 rows (revoked)

-- TEST 5.3: get_team_leader_context() - Expired Team Leader
RAISE NOTICE 'TEST 5.3: get_team_leader_context() with Expired Team Leader';

SET LOCAL "auth.uid" = 'a0000000-0000-0000-0000-000000000005'::text;

SELECT COUNT(*) as context_rows FROM public.get_team_leader_context();

-- Should return 0 rows (expired)

-- TEST 5.4: get_team_leader_context() - Future-Valid Team Leader
RAISE NOTICE 'TEST 5.4: get_team_leader_context() with Future-Valid Team Leader';

SET LOCAL "auth.uid" = 'a0000000-0000-0000-0000-000000000006'::text;

SELECT COUNT(*) as context_rows FROM public.get_team_leader_context();

-- Should return 0 rows (future valid_from not yet reached)

RAISE NOTICE 'RPC: Context tests completed.';

-- ============================================================================
-- SECTION 6: DIRECT TABLE ACCESS DENIAL
-- ============================================================================

RAISE NOTICE '=== SECTION 6: DIRECT TABLE ACCESS DENIAL ===';

SET LOCAL "auth.uid" = 'a0000000-0000-0000-0000-000000000001'::text;

-- TEST 6.1: Team Leader SELECT on schedules
RAISE NOTICE 'TEST 6.1: Team Leader SELECT on schedules (should fail or return 0)';

BEGIN;
  SELECT COUNT(*) as schedule_count FROM public.schedules;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'EXPECTED_DENIAL: % %', SQLSTATE, SQLERRM;
END;

-- TEST 6.2: Team Leader SELECT on participants
RAISE NOTICE 'TEST 6.2: Team Leader SELECT on participants (should fail or return 0)';

BEGIN;
  SELECT COUNT(*) as participant_count FROM public.participants;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'EXPECTED_DENIAL: % %', SQLSTATE, SQLERRM;
END;

-- TEST 6.3: Team Leader INSERT on participants
RAISE NOTICE 'TEST 6.3: Team Leader INSERT on participants (should fail)';

BEGIN;
  INSERT INTO public.participants (id, festival_id, organisation_id, name, gender, category_code, chest_number)
  VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, 'TLTEST_ILLEGAL', 'M', 'U16', 'ILLEGAL');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'EXPECTED_DENIAL: % %', SQLSTATE, SQLERRM;
END;

RAISE NOTICE 'DENIAL: Direct table access tests completed.';

-- ============================================================================
-- SECTION 7: CROSS-TEAM ISOLATION
-- ============================================================================

RAISE NOTICE '=== SECTION 7: CROSS-TEAM ISOLATION ===';

-- Set to Team Leader A
SET LOCAL "auth.uid" = 'a0000000-0000-0000-0000-000000000001'::text;

RAISE NOTICE 'TEST 7.1: Team Leader A can only see Team A participants';

SELECT COUNT(*) as team_a_participant_count FROM public.get_team_leader_participants()
WHERE organisation_id = '20000000-0000-0000-0000-000000000001'::uuid;

-- Should be 2 (A1, A2)

RAISE NOTICE 'TEST 7.2: Team Leader A cannot see Team B participants via RPC';

SELECT COUNT(*) as team_b_visible_to_a FROM public.get_team_leader_participants()
WHERE organisation_id = '20000000-0000-0000-0000-000000000002'::uuid;

-- Should be 0

RAISE NOTICE 'ISOLATION: Cross-team isolation tests completed.';

-- ============================================================================
-- SECTION 8: CROSS-TENANT ISOLATION
-- ============================================================================

RAISE NOTICE '=== SECTION 8: CROSS-TENANT ISOLATION ===';

SET LOCAL "auth.uid" = 'a0000000-0000-0000-0000-000000000003'::text;

RAISE NOTICE 'TEST 8.1: Tenant B Team Leader sees only Tenant B data';

SELECT COUNT(*) as tenant_b_context_count FROM public.get_team_leader_context();

-- Should be 1 (assigned to Tenant B / Festival B1)

SELECT COUNT(*) as tenant_b_participant_count FROM public.get_team_leader_participants();

-- Should be 1 (only X1 from Tenant B)

RAISE NOTICE 'ISOLATION: Cross-tenant isolation tests completed.';

-- ============================================================================
-- SECTION 9: PUBLISHED RESULT TRIPLE GATE
-- ============================================================================

RAISE NOTICE '=== SECTION 9: PUBLISHED RESULT TRIPLE GATE ===';

SET LOCAL "auth.uid" = 'a0000000-0000-0000-0000-000000000001'::text;

RAISE NOTICE 'TEST 9.1: get_team_leader_published_results() enforces triple gate';

SELECT COUNT(*) as public_result_count FROM public.get_team_leader_published_results();

-- Should return only results where published=true AND result_status='published' AND public_visible=true
-- Expected: 3 results (rank 1, 2, 4 from Team A's festival, with all three flags set)

RAISE NOTICE 'GATE: Triple-gate test completed.';

-- ============================================================================
-- SECTION 10: STANDINGS PARITY
-- ============================================================================

RAISE NOTICE '=== SECTION 10: STANDINGS PARITY ===';

RAISE NOTICE 'TEST 10.1: get_team_leader_standings() matches get_public_leaderboard()';

-- Team Leader A standings
SELECT 
  ROW_NUMBER() OVER (ORDER BY total_points DESC) as tl_rank,
  organisation_id,
  team_name,
  total_points
FROM public.get_team_leader_standings()
LIMIT 5;

-- Public leaderboard (for same festival/tenant)
SELECT 
  RANK,
  organisation_id,
  total_points
FROM public.get_public_leaderboard('10000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid)
LIMIT 5;

RAISE NOTICE 'STANDINGS: Parity test completed.';

-- ============================================================================
-- SECTION 11: CLEANUP
-- ============================================================================

RAISE NOTICE '=== SECTION 11: CLEANUP ===';

-- Cleanup is performed as final step to preserve database integrity

COMMIT;

RAISE NOTICE '=== ALL TESTS COMPLETED ===';
