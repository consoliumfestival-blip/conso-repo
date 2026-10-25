SELECT team_assignment_test.assert(
  (SELECT NOT assignment_locked FROM public.get_team_leader_programs_for_team_with_locks()
   WHERE item_id = '10000000-0000-0000-0000-000000000004')
  AND (SELECT NOT assignment_locked FROM public.get_team_leader_programs_for_team_with_locks()
       WHERE item_id = '10000000-0000-0000-0000-000000000003'),
  'both stages start writable');

SELECT public.team_leader_assign_program(
  '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004');
SELECT public.team_leader_assign_program(
  '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003');

INSERT INTO public.registrations (id, participant_id, item_id, entry_kind, is_group_registration,
                                  group_leader_participant_id, entry_chest_number)
VALUES ('10000000-0000-0000-0000-000000000100', NULL, '10000000-0000-0000-0000-000000000002', 'general_team', true,
        '20000000-0000-0000-0000-000000000001', 'GE-TEST')
INSERT INTO public.group_members (registration_id, participant_id, member_order)
VALUES ('10000000-0000-0000-0000-000000000100', '20000000-0000-0000-0000-000000000001', 1),
       ('10000000-0000-0000-0000-000000000100', '20000000-0000-0000-0000-000000000002', 2);

UPDATE public.festival_calendar SET team_leader_on_stage_locked = true;
SELECT team_assignment_test.assert(
  (SELECT assignment_locked FROM public.get_team_leader_programs_for_team_with_locks()
   WHERE item_id = '10000000-0000-0000-0000-000000000004')
  AND (SELECT NOT assignment_locked FROM public.get_team_leader_programs_for_team_with_locks()
       WHERE item_id = '10000000-0000-0000-0000-000000000003'),
  'On Stage lock is isolated from Off Stage');

DO $$
BEGIN
  BEGIN
    PERFORM public.team_leader_assign_program(
      '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004');
    RAISE EXCEPTION 'expected locked On Stage assignment to fail';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  PERFORM public.team_leader_assign_program(
    '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
  RAISE NOTICE 'PASS: On Stage writes stop while Off Stage writes continue';
END;
$$;

UPDATE public.festival_calendar SET team_leader_on_stage_locked = false, team_leader_off_stage_locked = true;
SELECT team_assignment_test.assert(
  (SELECT NOT assignment_locked FROM public.get_team_leader_programs_for_team_with_locks()
   WHERE item_id = '10000000-0000-0000-0000-000000000004')
  AND (SELECT assignment_locked FROM public.get_team_leader_programs_for_team_with_locks()
       WHERE item_id = '10000000-0000-0000-0000-000000000003'),
  'Off Stage lock is isolated from On Stage');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.registrations (participant_id, item_id)
    VALUES ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'expected locked Off Stage insert to fail';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    DELETE FROM public.group_members
    WHERE registration_id = '10000000-0000-0000-0000-000000000100';
    RAISE EXCEPTION 'expected locked group roster edit to fail';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    UPDATE public.registrations SET status = 'cancelled'
    WHERE item_id = '10000000-0000-0000-0000-000000000003'
      AND participant_id = '20000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'expected locked Off Stage edit to fail';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    DELETE FROM public.registrations
    WHERE item_id = '10000000-0000-0000-0000-000000000003'
      AND participant_id = '20000000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'expected locked Off Stage deselect to fail';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'PASS: Off Stage insert, edit, deselect and group roster writes are blocked';
END;
$$;

UPDATE public.festival_calendar SET team_leader_on_stage_locked = true, team_leader_off_stage_locked = true;
SELECT team_assignment_test.assert(
  (SELECT bool_and(assignment_locked) FROM public.get_team_leader_programs_for_team_with_locks()),
  'both locks close both stages');
SELECT team_assignment_test.assert(
  (SELECT count(*) = 1 FROM public.get_team_leader_program_individual_roster('10000000-0000-0000-0000-000000000004'))
  AND (SELECT count(*) = 2 FROM public.get_team_leader_program_group_roster('10000000-0000-0000-0000-000000000002')),
  'View Participants reads continue while both stages are locked');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.team_leader_program_completions (
      tenant_id, festival_id, organisation_id, item_id, assigned_participant_ids, completed_by
    ) VALUES (
      '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004',
      ARRAY['20000000-0000-0000-0000-000000000001'::uuid], '50000000-0000-0000-0000-000000000001'
    );
    RAISE EXCEPTION 'expected locked completion edit to fail';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'PASS: locked stage blocks Team Leader completion changes';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', false);
INSERT INTO public.registrations (participant_id, item_id)
VALUES ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004');
SELECT set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', false);
SELECT team_assignment_test.assert(
  (SELECT count(*) = 1 FROM public.registrations
   WHERE participant_id = '20000000-0000-0000-0000-000000000003'
     AND item_id = '10000000-0000-0000-0000-000000000004'),
  'Admin registration remains available when Team Leader locks are on');
