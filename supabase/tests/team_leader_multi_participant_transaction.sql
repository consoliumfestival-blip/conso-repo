SELECT team_assignment_test.assert(
  (SELECT cardinality(eligible_participant_ids) = 2
          AND cardinality(assigned_participant_ids) = 0
          AND is_eligible
   FROM public.get_team_leader_programs_for_team()
   WHERE item_id = '10000000-0000-0000-0000-000000000001'),
  'team-wide listing includes eligible members and excludes rejected members');

INSERT INTO team_assignment_test.assignment_results(data)
SELECT public.team_leader_assign_program_participants(
    '10000000-0000-0000-0000-000000000001',
    ARRAY['20000000-0000-0000-0000-000000000001'::uuid,
          '20000000-0000-0000-0000-000000000002'::uuid]
  );

SELECT team_assignment_test.assert(
  (SELECT data->>'assigned_count' = '2' FROM team_assignment_test.assignment_results)
  AND (SELECT count(*) = 2 FROM public.registrations WHERE item_id = '10000000-0000-0000-0000-000000000001'),
  'batch assignment creates normal registrations for multiple team members');

SELECT team_assignment_test.assert(
  (SELECT is_assigned AND NOT is_eligible
          AND cardinality(assigned_participant_ids) = 2
   FROM public.get_team_leader_programs_for_team()
   WHERE item_id = '10000000-0000-0000-0000-000000000001'),
  'team-wide listing reports assigned members and no remaining eligible assignment');

DO $$
BEGIN
  BEGIN
    PERFORM public.team_leader_assign_program_participants(
      '10000000-0000-0000-0000-000000000003',
      ARRAY['20000000-0000-0000-0000-000000000001'::uuid,
            '20000000-0000-0000-0000-000000000003'::uuid]
    );
    RAISE EXCEPTION 'expected ineligible-member failure';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
  IF (SELECT count(*) FROM public.registrations
      WHERE item_id = '10000000-0000-0000-0000-000000000003') <> 0 THEN
    RAISE EXCEPTION 'FAIL: failed batch left a partial assignment';
  END IF;
  RAISE NOTICE 'PASS: failed batch rolls back all earlier participant inserts';
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.team_leader_assign_program_participants(
      '10000000-0000-0000-0000-000000000001',
      ARRAY['20000000-0000-0000-0000-000000000001'::uuid,
            '20000000-0000-0000-0000-000000000001'::uuid]
    );
    RAISE EXCEPTION 'expected duplicate-member failure';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  RAISE NOTICE 'PASS: duplicate participant IDs are rejected';
END;
$$;
