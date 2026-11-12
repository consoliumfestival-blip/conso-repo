-- Disposable fixture database ONLY. This test assumes fixture_full's minimal
-- schema, the actual prepare_results/publish functions, and the scoring trigger.
-- It uses synthetic IDs and rolls back all inserted data.
BEGIN;
SET LOCAL test.is_admin = 'yes';
INSERT INTO schedules VALUES ('10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000006',2,NULL);
INSERT INTO items VALUES ('10000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000007',ARRAY['A'],'individual','custom',NULL,NULL);
INSERT INTO points_config VALUES ('10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000007',1,false,'{"a":80,"b":50,"c":30}');
INSERT INTO registrations VALUES
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000009','A',NULL),
 ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000009','B',NULL);
INSERT INTO schedule_judge_assignments VALUES
 ('10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000003','active'),
 ('10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000004','active');
INSERT INTO judge_tokens(id,tenant_id,schedule_id,judge_id,token,status) VALUES
 ('10000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000003','FAKE1','approved'),
 ('10000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000003','FAKE2','approved');
INSERT INTO mark_entries(id,tenant_id,schedule_id,judge_id,registration_id,criteria_scores,total_mark,is_draft,is_final,entry_mode_snapshot,max_mark_snapshot,criteria_snapshot,updated_at) VALUES
 ('10000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','{}',80,false,true,'total_only',100,'[]','2026-01-01Z'),
 ('10000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','{"a":5}',5,true,false,'criteria',20,'[{"key":"a","max":10},{"key":"b","max":10}]','2026-01-01Z');
-- A stale draft body must fail even when its updated_at did not change.
DO $$ BEGIN
 BEGIN
  PERFORM public.publish_results_with_confirmed_zero_marks(
   '10000000-0000-0000-0000-000000000009',1,'[]','10000000-0000-0000-0000-000000000095','a',NULL,
   '[{"registration_id":"10000000-0000-0000-0000-000000000001","judge_id":"10000000-0000-0000-0000-000000000004","mark_id":"10000000-0000-0000-0000-000000000012","updated_at":"2026-01-01T00:00:00Z","snapshot":{"criteria_scores":{"a":4},"total_mark":4,"entry_mode_snapshot":"criteria","max_mark_snapshot":20,"criteria_snapshot":[{"key":"a","max":10},{"key":"b","max":10}],"is_draft":true}},{"registration_id":"10000000-0000-0000-0000-000000000002","judge_id":"10000000-0000-0000-0000-000000000003","mark_id":null,"updated_at":null},{"registration_id":"10000000-0000-0000-0000-000000000002","judge_id":"10000000-0000-0000-0000-000000000004","mark_id":null,"updated_at":null}]',100);
  RAISE EXCEPTION 'Stale draft was accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF (SELECT count(*) FROM mark_entries WHERE schedule_id='10000000-0000-0000-0000-000000000009') <> 2
 THEN RAISE EXCEPTION 'Stale draft check changed marks'; END IF;
END $$;
SELECT public.publish_results_closing_judge_codes(
 '10000000-0000-0000-0000-000000000009',1,
 '[{"registration_id":"10000000-0000-0000-0000-000000000001"},{"registration_id":"10000000-0000-0000-0000-000000000002"}]',
 'judges','10000000-0000-0000-0000-000000000099','a',NULL,
 '[{"registration_id":"10000000-0000-0000-0000-000000000001","judge_id":"10000000-0000-0000-0000-000000000004","mark_id":"10000000-0000-0000-0000-000000000012","updated_at":"2026-01-01T00:00:00Z","snapshot":{"criteria_scores":{"a":5},"total_mark":5,"entry_mode_snapshot":"criteria","max_mark_snapshot":20,"criteria_snapshot":[{"key":"a","max":10},{"key":"b","max":10}],"is_draft":true}},{"registration_id":"10000000-0000-0000-0000-000000000002","judge_id":"10000000-0000-0000-0000-000000000003","mark_id":null,"updated_at":null,"snapshot":null},{"registration_id":"10000000-0000-0000-0000-000000000002","judge_id":"10000000-0000-0000-0000-000000000004","mark_id":null,"updated_at":null,"snapshot":null}]',100);
DO $$ BEGIN
 IF (SELECT total_mark FROM mark_entries WHERE id='10000000-0000-0000-0000-000000000011') <> 80
 OR (SELECT criteria_scores FROM mark_entries WHERE id='10000000-0000-0000-0000-000000000012') <> '{"a":5,"b":0}'::jsonb
 OR (SELECT count(*) FROM mark_entries WHERE schedule_id='10000000-0000-0000-0000-000000000009' AND is_final AND total_mark=0) <> 2
 OR (SELECT (points_calculation->>'percentage')::numeric FROM results WHERE registration_id='10000000-0000-0000-0000-000000000001') <> 52.5
 OR (SELECT total_score FROM results WHERE registration_id='10000000-0000-0000-0000-000000000002') <> 0
 OR (SELECT is_revoked FROM judge_tokens WHERE id='10000000-0000-0000-0000-000000000051') IS NOT TRUE
 OR (SELECT is_revoked FROM judge_tokens WHERE id='10000000-0000-0000-0000-000000000052') IS NOT FALSE
 THEN RAISE EXCEPTION 'Confirmed zero mark fixture failed'; END IF;
END $$;
-- The same request is idempotent; a new request using an obsolete missing
-- list must fail instead of changing already-final marks.
INSERT INTO judge_tokens(id,tenant_id,schedule_id,judge_id,token,status) VALUES
 ('10000000-0000-0000-0000-000000000053','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000003','FAKE3','approved');
DO $$ BEGIN
 PERFORM public.publish_results_closing_judge_codes(
  '10000000-0000-0000-0000-000000000009',1,
  '[{"registration_id":"10000000-0000-0000-0000-000000000001"},{"registration_id":"10000000-0000-0000-0000-000000000002"}]',
  'judges','10000000-0000-0000-0000-000000000099','a',NULL,'[]',100);
 IF (SELECT count(*) FROM scoring_publications WHERE id='10000000-0000-0000-0000-000000000099') <> 1
 OR (SELECT is_revoked FROM judge_tokens WHERE id='10000000-0000-0000-0000-000000000053') IS NOT FALSE
 THEN RAISE EXCEPTION 'Publication retry was not idempotent'; END IF;
 BEGIN
  PERFORM public.publish_results_with_confirmed_zero_marks(
   '10000000-0000-0000-0000-000000000009',1,'[]',
   '10000000-0000-0000-0000-000000000098','a',NULL,
   '[{"registration_id":"10000000-0000-0000-0000-000000000002","judge_id":"10000000-0000-0000-0000-000000000003","mark_id":null,"updated_at":null}]',100);
  RAISE EXCEPTION 'Obsolete confirmation was accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
-- Failure in the existing publication function must roll back zero inserts.
INSERT INTO schedules VALUES ('10000000-0000-0000-0000-000000000019','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000006',1,NULL);
INSERT INTO registrations VALUES ('10000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000019','C',NULL);
INSERT INTO schedule_judge_assignments VALUES ('10000000-0000-0000-0000-000000000019','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000003','active');
INSERT INTO judge_tokens(id,tenant_id,schedule_id,judge_id,token,status) VALUES
 ('10000000-0000-0000-0000-000000000054','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000019','10000000-0000-0000-0000-000000000003','FAKE4','approved');
DO $$ BEGIN
 BEGIN
  PERFORM public.publish_results_closing_judge_codes(
   '10000000-0000-0000-0000-000000000019',2,
   '[{"registration_id":"10000000-0000-0000-0000-000000000021"}]',
   'judges','10000000-0000-0000-0000-000000000096','a',NULL,
   '[{"registration_id":"10000000-0000-0000-0000-000000000021","judge_id":"10000000-0000-0000-0000-000000000003","mark_id":null,"updated_at":null}]',100);
  RAISE EXCEPTION 'Outdated points configuration was accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF EXISTS (SELECT 1 FROM mark_entries WHERE schedule_id='10000000-0000-0000-0000-000000000019')
 OR EXISTS (SELECT 1 FROM results WHERE schedule_id='10000000-0000-0000-0000-000000000019')
 OR (SELECT is_revoked FROM judge_tokens WHERE id='10000000-0000-0000-0000-000000000054') IS NOT FALSE
 THEN RAISE EXCEPTION 'Failed publication did not roll back'; END IF;
END $$;
-- Direct entry publication also closes codes for this schedule.
INSERT INTO schedules VALUES ('10000000-0000-0000-0000-000000000029','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000006',1,NULL);
INSERT INTO registrations(id,tenant_id,schedule_id,code_letter,raw_group_members) VALUES ('10000000-0000-0000-0000-000000000031','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000029','D',NULL);
INSERT INTO judge_tokens(id,tenant_id,schedule_id,judge_id,token,status) VALUES ('10000000-0000-0000-0000-000000000055','10000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000029','10000000-0000-0000-0000-000000000003','FAKE5','approved');
SELECT public.publish_results_closing_judge_codes('10000000-0000-0000-0000-000000000029',1,
 '[{"registration_id":"10000000-0000-0000-0000-000000000031","raw_marks":[{"judge_slot":1,"total":0,"maximum":100}]}]',
 'manual','10000000-0000-0000-0000-000000000094','a',NULL,'[]',NULL);
DO $$ BEGIN
 IF (SELECT is_revoked FROM judge_tokens WHERE id='10000000-0000-0000-0000-000000000055') IS NOT TRUE
 OR (SELECT total_score FROM results WHERE registration_id='10000000-0000-0000-0000-000000000031') <> 0
 THEN RAISE EXCEPTION 'Direct publication did not close codes or save zero'; END IF;
END $$;
SET LOCAL test.is_admin = 'no';
DO $$ BEGIN
 BEGIN
  PERFORM public.publish_results_with_confirmed_zero_marks(
   '10000000-0000-0000-0000-000000000009',1,'[]',
   '10000000-0000-0000-0000-000000000097','a',NULL,'[]',100);
  RAISE EXCEPTION 'Non-admin request was accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'denied' THEN RAISE; END IF;
 END;
END $$;
ROLLBACK;
