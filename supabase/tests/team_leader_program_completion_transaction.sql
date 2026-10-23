INSERT INTO team_assignment_test.assignment_results(data)
SELECT public.team_leader_assign_program_participants(
    '10000000-0000-0000-0000-000000000003',
    ARRAY['20000000-0000-0000-0000-000000000001'::uuid,
          '20000000-0000-0000-0000-000000000002'::uuid]
  );

SELECT team_assignment_test.assert(
  (public.team_leader_mark_program_completed('10000000-0000-0000-0000-000000000003')->>'participant_count') = '2',
  'completion records the team leader confirmation and assigned roster');

SELECT team_assignment_test.assert(
  EXISTS (SELECT 1 FROM public.get_team_leader_completed_program_ids()
          WHERE item_id = '10000000-0000-0000-0000-000000000003'),
  'confirmed program appears in the completed status list');

INSERT INTO team_assignment_test.members VALUES
  ('20000000-0000-0000-0000-000000000005', 'Eligible C', 'approved', true);
INSERT INTO public.participants (id, status)
VALUES ('20000000-0000-0000-0000-000000000005', 'approved');
INSERT INTO public.registrations (participant_id, item_id)
VALUES ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003');

SELECT team_assignment_test.assert(
  NOT EXISTS (SELECT 1 FROM public.get_team_leader_completed_program_ids()
              WHERE item_id = '10000000-0000-0000-0000-000000000003'),
  'adding a participant invalidates the prior completion confirmation');

DO $$
BEGIN
  BEGIN
    PERFORM public.team_leader_mark_program_completed('10000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'expected group-program completion to be rejected';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  RAISE NOTICE 'PASS: this individual-only completion action rejects group programs';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.team_leader_mark_program_completed('10000000-0000-0000-0000-000000000001');
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS: missing authentication is rejected';
    RETURN;
  END;
  RAISE EXCEPTION 'expected authentication failure';
END;
$$;
