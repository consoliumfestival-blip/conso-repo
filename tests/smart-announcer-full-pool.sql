-- Full-pool planning and batch-size regression in a disposable database.
BEGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE TABLE smart_announcer_sessions(id uuid, tenant_id uuid, festival_id uuid, closed_at timestamptz);
CREATE TABLE smart_announcer_batches(session_id uuid, team_id uuid, item_ids uuid[], preview jsonb, created_by uuid);
CREATE TABLE venues(id uuid, name text);
CREATE TABLE schedules(tenant_id uuid, festival_id uuid, item_id uuid, start_time timestamptz, venue_id uuid);
INSERT INTO smart_announcer_sessions VALUES (md5('session')::uuid, md5('tenant')::uuid, md5('festival')::uuid, NULL);
DO $zero$
DECLARE planned jsonb;
BEGIN
  INSERT INTO items VALUES (md5('zero-item')::uuid, md5('tenant')::uuid,
    md5('festival')::uuid, 'Zero-point item', NULL, 'zero-item', ARRAY['GN']);
  INSERT INTO registrations VALUES (md5('zero-reg')::uuid,
    md5('zero-item')::uuid, NULL, md5('A')::uuid, 'approved');
  INSERT INTO results VALUES (md5('zero-result')::uuid,
    md5('zero-item')::uuid, md5('zero-reg')::uuid, md5('festival')::uuid,
    0, NULL, NULL, true, 'published', false, now());
  planned := smart_announcer_team_strategy_v2(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid,
    5, 'auto', 'team', ARRAY[md5('zero-item')::uuid]);
  IF jsonb_array_length(planned->'items') <> 1 THEN
    RAISE EXCEPTION 'Eligible zero-point result was not available to announce';
  END IF;
END $zero$;
DO $modes$
DECLARE planned jsonb; auto_plan jsonb;
BEGIN
  planned := smart_announcer_team_strategy_v2(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid,
    5, 'very_small', 'spread');
  IF planned->>'mode' <> 'very_small'
    OR planned->'available_modes'->>'very_small' <> 'false'
    OR planned->'available_modes'->>'high' <> 'true'
    OR planned->>'mode_met' <> 'false' THEN
    RAISE EXCEPTION 'Unavailable mode and feasible alternatives were not reported correctly';
  END IF;
  auto_plan := smart_announcer_team_strategy_v2(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid,
    5, 'auto', 'team');
  IF auto_plan->>'target_is_first_at_batch_end' = 'true'
    AND (auto_plan->>'batch_spread')::bigint IS DISTINCT FROM
      (auto_plan->>'minimum_team_first_spread')::bigint THEN
    RAISE EXCEPTION 'Auto did not choose the closest team-first spread';
  END IF;
  BEGIN
    PERFORM smart_announcer_send_batch_v2(
      md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid,
      ARRAY[md5('large')::uuid], 5, 'very_small', 'team', false);
    RAISE EXCEPTION 'Cap was bypassed without explicit override';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM smart_announcer_send_batch_v2(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid,
    ARRAY[md5('large')::uuid], 5, 'very_small', 'team', true);
  IF NOT EXISTS (SELECT 1 FROM smart_announcer_batches WHERE preview->>'mode_override_confirmed' = 'true') THEN
    RAISE EXCEPTION 'Explicit override was not recorded';
  END IF;
  BEGIN
    PERFORM smart_announcer_team_strategy_v2(
      md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid,
      7, 'auto', 'team');
    RAISE EXCEPTION 'Invalid batch size was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $modes$;
-- A team-first batch can also meet the tight suspense limit. Prefer that
-- combination before asking Admin to trade one goal for the other.
DO $balanced$
DECLARE label text; team text; award integer; planned jsonb;
BEGIN
  FOR label, team, award IN SELECT * FROM (VALUES
    ('balance-a', 'A', 16), ('balance-b1', 'B', 20), ('balance-b2', 'B', 16)
  ) AS v(label, team, award) LOOP
    INSERT INTO items VALUES (md5(label)::uuid, md5('tenant')::uuid,
      md5('festival')::uuid, label, NULL, label, ARRAY['GN']);
    INSERT INTO registrations VALUES (md5(label || '-reg')::uuid,
      md5(label)::uuid, NULL, md5(team)::uuid, 'approved');
    INSERT INTO results VALUES (md5(label || '-result')::uuid,
      md5(label)::uuid, md5(label || '-reg')::uuid, md5('festival')::uuid,
      award, 3, 'C', true, 'published', false, now());
  END LOOP;
  planned := smart_announcer_team_strategy_v2(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid,
    5, 'very_small', 'team');
  IF planned->>'target_is_first_at_batch_end' <> 'true'
    OR planned->>'mode_met' <> 'true' THEN
    RAISE EXCEPTION 'A feasible team-first and tight-spread batch was not selected';
  END IF;
END $balanced$;
DO $setup$
DECLARE n integer;
BEGIN
  FOR n IN 1..160 LOOP
    INSERT INTO items VALUES (md5('pool-item-' || n)::uuid, md5('tenant')::uuid,
      md5('festival')::uuid, 'Pool item ' || n, NULL, 'pool-' || n, ARRAY['GN']);
    INSERT INTO registrations VALUES (md5('pool-reg-' || n)::uuid,
      md5('pool-item-' || n)::uuid, NULL, md5('A')::uuid, 'approved');
    INSERT INTO results VALUES (md5('pool-result-' || n)::uuid,
      md5('pool-item-' || n)::uuid, md5('pool-reg-' || n)::uuid,
      md5('festival')::uuid, 1, 4, 'C', true, 'published', false, now());
  END LOOP;
END $setup$;
DO $check$
DECLARE planned jsonb;
BEGIN
  planned := smart_announcer_team_strategy_v2(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid,
    10, 'auto', 'team');
  IF (planned->>'candidate_count')::integer < 160
    OR jsonb_array_length(planned->'items') <> 10
    OR (planned->>'lookahead_steps')::integer NOT BETWEEN 0 AND 60
    OR ((planned->>'lookahead_steps')::integer < 60 AND planned->>'lookahead_limited_by_time' <> 'true') THEN
    RAISE EXCEPTION 'Full pool or 10-result batch was truncated: %', planned;
  END IF;
  IF planned->'available_modes'->>'auto' <> 'true' THEN
    RAISE EXCEPTION 'Auto fallback is missing';
  END IF;
END $check$;
DO $send_ten$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(md5('pool-item-' || n)::uuid ORDER BY n) INTO ids
  FROM generate_series(1,10) AS n;
  PERFORM smart_announcer_send_batch_v2(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid,
    ids, 10, 'auto', 'team', false);
  IF NOT EXISTS (SELECT 1 FROM smart_announcer_batches WHERE cardinality(item_ids) = 10) THEN
    RAISE EXCEPTION 'Ten-result batch did not reach the send path';
  END IF;
END $send_ten$;
DO $capped$
DECLARE planned jsonb; ids uuid[];
BEGIN
  DELETE FROM festival_leaderboard_settings WHERE festival_id = md5('festival')::uuid;
  INSERT INTO festival_leaderboard_settings VALUES (md5('festival')::uuid, 'LIMITED', 1);
  planned := smart_announcer_team_strategy_v2(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid, 5, 'auto', 'team');
  IF jsonb_array_length(planned->'items') <> 5 OR planned->>'selection_note' NOT LIKE '%limit has been reached%' THEN
    RAISE EXCEPTION 'Leaderboard cap incorrectly blocked announcer recommendations';
  END IF;
  SELECT array_agg((value->>'item_id')::uuid ORDER BY n) INTO ids
  FROM jsonb_array_elements(planned->'items') WITH ORDINALITY AS s(value,n);
  planned := smart_announcer_team_strategy_v2(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid, 5, 'auto', 'team', ids);
  IF jsonb_array_length(planned->'items') <> 5 THEN
    RAISE EXCEPTION 'Manual preview failed after leaderboard cap';
  END IF;
END $capped$;
ROLLBACK;
