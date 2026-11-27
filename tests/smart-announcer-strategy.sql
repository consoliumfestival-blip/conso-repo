-- Run after schema fixture and strategy migration in a disposable database.
INSERT INTO festival_calendar VALUES(md5('festival')::uuid,md5('tenant')::uuid);
INSERT INTO festival_leaderboard_settings VALUES(md5('festival')::uuid,'ALL',NULL);
INSERT INTO organisations SELECT md5(team)::uuid,md5('tenant')::uuid,NULL,team,'unit' FROM unnest(ARRAY['A','B']) team;
INSERT INTO festival_teams SELECT md5('festival')::uuid,md5(team)::uuid FROM unnest(ARRAY['A','B']) team;
INSERT INTO items SELECT md5(item)::uuid,md5('tenant')::uuid,md5('festival')::uuid,item,NULL,item,ARRAY['GN'] FROM unnest(ARRAY['base','small','large','next']) item;
INSERT INTO registrations SELECT md5(item||team)::uuid,md5(item)::uuid,NULL,md5(team)::uuid,'approved' FROM unnest(ARRAY['base','small','large','next']) item CROSS JOIN unnest(ARRAY['A','B']) team;
INSERT INTO results SELECT md5(item||team)::uuid,md5(item)::uuid,md5(item||team)::uuid,md5('festival')::uuid,points,2,'A',true,'published',item='base',now()-interval '1 day'
FROM (VALUES('base','A',100),('base','B',110),('small','A',15),('small','B',0),('large','A',30),('large','B',0),('next','A',5),('next','B',4)) v(item,team,points);
DO $test$
DECLARE strategy jsonb; count_items integer;
BEGIN
  SELECT count(*) INTO count_items FROM smart_announcer_team_candidates(md5('tenant')::uuid,md5('festival')::uuid,md5('A')::uuid);
  IF count_items<>3 THEN RAISE EXCEPTION 'Non-first-place candidates missing'; END IF;
  strategy:=smart_announcer_team_strategy(md5('tenant')::uuid,md5('festival')::uuid,md5('A')::uuid);
  IF strategy->'items'->0->>'item_id' <> md5('small')::uuid::text THEN RAISE EXCEPTION 'Leader priority / minimum gap failed: %',strategy; END IF;
  IF strategy->'items'->1->>'item_id' <> md5('next')::uuid::text THEN RAISE EXCEPTION 'Sequential projection failed: %',strategy; END IF;
  IF (strategy->'items'->0->>'team_points')::integer<>115 THEN RAISE EXCEPTION 'Points mismatch'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(strategy->'items'->0->'point_deltas') delta
    WHERE delta->>'organisation_id' = md5('A')::uuid::text AND (delta->>'points')::integer = 15
  ) THEN RAISE EXCEPTION 'Canonical per-team point delta missing: %',strategy; END IF;
END;
$test$;
-- Queue announcement state never becomes the published leaderboard baseline.
INSERT INTO smart_announcer_queue VALUES(md5('tenant')::uuid,md5('festival')::uuid,md5('base')::uuid,now());
INSERT INTO smart_announcer_queue VALUES(md5('tenant')::uuid,md5('festival')::uuid,md5('small')::uuid,now());
DO $test$
DECLARE strategy jsonb; baseline_points integer;
BEGIN
  SELECT total_points INTO baseline_points
  FROM smart_announcer_project_sequence(md5('tenant')::uuid,md5('festival')::uuid,ARRAY[]::uuid[])
  WHERE organisation_id = md5('A')::uuid;
  IF baseline_points <> 100 THEN RAISE EXCEPTION 'Announced but unpublished result changed baseline points: %',baseline_points; END IF;
  strategy:=smart_announcer_team_strategy(md5('tenant')::uuid,md5('festival')::uuid,md5('A')::uuid);
  IF strategy->'items'->0->>'item_id' <> md5('large')::uuid::text OR (strategy->'items'->0->>'team_points')::integer<>130 THEN
    RAISE EXCEPTION 'Queue history affected the next unpublished recommendation: %',strategy;
  END IF;
  BEGIN
    PERFORM smart_announcer_team_strategy(md5('foreign')::uuid,md5('festival')::uuid,md5('A')::uuid);
    RAISE EXCEPTION 'Tenant guard failed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Forbidden' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM smart_announcer_team_strategy(md5('tenant')::uuid,md5('festival')::uuid,md5('A')::uuid,ARRAY[md5('small')::uuid]);
    RAISE EXCEPTION 'Stale selection accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$test$;
SELECT 'strategy regression checks passed' AS result;

-- Additional edge cases; each transaction rolls its fixture back.
BEGIN;
UPDATE results SET points_awarded=CASE WHEN registration_id=md5('baseB')::uuid THEN 1000 ELSE points_awarded END;
DO $$ DECLARE s jsonb; BEGIN
 s:=smart_announcer_team_strategy(md5('tenant')::uuid,md5('festival')::uuid,md5('A')::uuid);
 IF s->'items'->0->>'item_id'<>md5('large')::uuid::text THEN RAISE EXCEPTION 'No-lead fallback failed: %',s; END IF;
END $$;
ROLLBACK;
BEGIN;
DELETE FROM smart_announcer_queue;
UPDATE results SET points_awarded=10 WHERE id=md5('smallA')::uuid;
DO $$ DECLARE s jsonb; BEGIN
 s:=smart_announcer_team_strategy(md5('tenant')::uuid,md5('festival')::uuid,md5('A')::uuid);
 IF (s->'items'->0->>'team_rank')::integer<>1 OR (s->'items'->0->>'leader_gap')::integer<>0 THEN
 RAISE EXCEPTION 'Shared first-place tie failed: %',s; END IF;
 IF (s->'items'->0->>'target_tied_first')::boolean IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Shared first-place tie was not labelled: %',s; END IF;
END $$;
ROLLBACK;
BEGIN;
UPDATE festival_leaderboard_settings SET ranking_mode='LIMITED',item_limit=1;
DO $$ DECLARE s jsonb; BEGIN
 s:=smart_announcer_team_strategy(md5('tenant')::uuid,md5('festival')::uuid,md5('A')::uuid);
 IF jsonb_array_length(s->'items')<>0 THEN RAISE EXCEPTION 'LIMITED mode must not add excluded points'; END IF;
END $$;
ROLLBACK;
BEGIN;
-- Award ownership resolves a group result without participant attribution.
UPDATE registrations SET organisation_id=NULL WHERE id=md5('largeA')::uuid;
INSERT INTO result_team_awards VALUES(md5('largeA')::uuid,md5('A')::uuid);
INSERT INTO points_config VALUES(md5('festival')::uuid,true,1);
INSERT INTO grace_marks VALUES(md5('A')::uuid,md5('festival')::uuid,md5('tenant')::uuid,md5('submission')::uuid,7);
DO $$ DECLARE points bigint; BEGIN
 SELECT total_points INTO points FROM smart_announcer_project_sequence(md5('tenant')::uuid,md5('festival')::uuid,ARRAY[md5('large')::uuid]) WHERE organisation_id=md5('A')::uuid;
 IF points<>137 THEN RAISE EXCEPTION 'Group award / grace marks mismatch: %',points; END IF;
END $$;
ROLLBACK;
SELECT 'edge case checks passed' AS result;
