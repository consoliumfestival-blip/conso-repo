BEGIN;
DO $migration$
DECLARE definition text; original text;
BEGIN
  SELECT pg_get_functiondef('public.smart_announcer_team_strategy_v2(uuid,uuid,uuid,integer,text,text,uuid[])'::regprocedure)
  INTO definition;
  original := definition;
  definition := replace(definition,
    'v_horizon := CASE WHEN p_item_ids IS NOT NULL THEN cardinality(v_candidates)',
    'IF v_open_slots = 0 AND p_item_ids IS NULL THEN
    -- No eligible item can affect the capped leaderboard. Keep deterministic
    -- queue order and avoid searching equivalent zero-delta permutations.
    v_candidates := v_candidates[1:p_batch_size];
  END IF;
  v_horizon := CASE WHEN p_item_ids IS NOT NULL OR v_open_slots = 0 THEN cardinality(v_candidates)');
  definition := replace(definition,
    '''selection_note'', CASE WHEN p_item_ids IS NULL THEN',
    '''selection_note'', CASE WHEN v_open_slots = 0 THEN ''The public leaderboard item limit has been reached. These results can still be announced, but they do not change the capped public standings. The remaining queue uses a stable order.'' WHEN p_item_ids IS NULL THEN');
  IF definition = original OR position('v_candidates := v_candidates[1:p_batch_size]' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected planner definition; no changes applied';
  END IF;
  EXECUTE definition;
END $migration$;
NOTIFY pgrst, 'reload schema';
COMMIT;
