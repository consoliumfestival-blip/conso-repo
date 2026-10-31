BEGIN;
INSERT INTO public.items(id, tenant_id, festival_id, participation_type, category_codes) VALUES
('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'individual', ARRAY['PRIME']),
('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'group', ARRAY['PRIME']);
INSERT INTO public.venues(id, tenant_id, festival_id) VALUES
('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
INSERT INTO public.schedules(id, tenant_id, festival_id, item_id, venue_id, substage_config) VALUES
('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020',
'[{"id":"one","name":"Stage 1","ranges":[{"from":10,"to":20}]},{"id":"two","name":"Stage 2","ranges":[{"from":30,"to":40}]}]');
INSERT INTO public.participants(id, chest_number) VALUES
('00000000-0000-0000-0000-000000000040', '11'),
('00000000-0000-0000-0000-000000000041', '31');
INSERT INTO public.registrations(id, tenant_id, festival_id, item_id, participant_id) VALUES
('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000040'),
('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000041');

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.admin_schedule_checkin_action('00000000-0000-0000-0000-000000000030', 'one', 'cancel_remaining');
  IF (v_result->>'changed')::integer <> 1 THEN RAISE EXCEPTION 'Stage 1 did not cancel exactly one entry'; END IF;
  IF NOT (SELECT checkin_cancelled FROM public.registrations WHERE id = '00000000-0000-0000-0000-000000000050')
    OR (SELECT checkin_cancelled FROM public.registrations WHERE id = '00000000-0000-0000-0000-000000000051') THEN
    RAISE EXCEPTION 'Cancellation crossed stage boundary';
  END IF;
  INSERT INTO public.participants(id, chest_number) VALUES ('00000000-0000-0000-0000-000000000042', '99');
  BEGIN
    INSERT INTO public.registrations(id, tenant_id, festival_id, item_id, participant_id) VALUES
      ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010',
       '00000000-0000-0000-0000-000000000042');
    RAISE EXCEPTION 'Late registration was accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  PERFORM public.admin_schedule_checkin_action('00000000-0000-0000-0000-000000000030', 'one', 'submit');
  BEGIN
    PERFORM public.admin_schedule_checkin_action('00000000-0000-0000-0000-000000000030', 'two', 'submit');
    RAISE EXCEPTION 'Unresolved stage submitted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN
    UPDATE public.participants SET chest_number = '12' WHERE id = '00000000-0000-0000-0000-000000000040';
    RAISE EXCEPTION 'Chest changed after check-in';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN
    UPDATE public.registrations SET code_letter = 'A' WHERE id = '00000000-0000-0000-0000-000000000051';
    RAISE EXCEPTION 'Code assigned before all stages submitted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  UPDATE public.registrations SET is_verified = true WHERE id = '00000000-0000-0000-0000-000000000051';
  PERFORM public.admin_schedule_checkin_action('00000000-0000-0000-0000-000000000030', 'two', 'submit');
  UPDATE public.registrations SET code_letter = 'A' WHERE id = '00000000-0000-0000-0000-000000000051';
  UPDATE public.registrations SET is_verified = true WHERE id = '00000000-0000-0000-0000-000000000050';
  IF (SELECT checkin_cancelled FROM public.registrations WHERE id = '00000000-0000-0000-0000-000000000050') THEN
    RAISE EXCEPTION 'Verify did not clear cancellation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedule_substage_submissions
    WHERE schedule_id = '00000000-0000-0000-0000-000000000030' AND stage_id = 'one') THEN
    RAISE EXCEPTION 'Reverification did not reopen stage';
  END IF;
  BEGIN
    UPDATE public.schedules SET substage_config = '[]'::jsonb
    WHERE id = '00000000-0000-0000-0000-000000000030';
    RAISE EXCEPTION 'Configuration changed after check-in';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN
    INSERT INTO public.schedules(id, tenant_id, festival_id, item_id, venue_id, substage_config)
    VALUES ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000020',
      '[{"id":"one","name":"Stage 1","ranges":[{"from":10,"to":20}]}]');
    RAISE EXCEPTION 'Group item accepted sub-stages';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    INSERT INTO public.schedules(id, tenant_id, festival_id, item_id, venue_id, substage_config)
    VALUES ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000020',
      '[{"id":"one","name":"Stage 1","ranges":[{"from":10,"to":20}]},{"id":"two","name":"Stage 2","ranges":[{"from":20,"to":30}]}]');
    RAISE EXCEPTION 'Overlapping ranges were accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END;
$$;
SET LOCAL ROLE anon;
DO $$
DECLARE v_state jsonb;
BEGIN
  v_state := public.get_venue_schedule_checkin_state(
    '00000000-0000-0000-0000-000000000020', '1234', '00000000-0000-0000-0000-000000000030');
  IF pg_catalog.jsonb_typeof(v_state->'cancelled_ids') <> 'array' THEN
    RAISE EXCEPTION 'PIN-scoped state read failed';
  END IF;
  BEGIN
    PERFORM public.get_venue_schedule_checkin_state(
      '00000000-0000-0000-0000-000000000099', '1234', '00000000-0000-0000-0000-000000000030');
    RAISE EXCEPTION 'Wrong venue was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    PERFORM stage_portal_private.checkin_state(
      '00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'Private helper was executable by anon';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
ROLLBACK;
