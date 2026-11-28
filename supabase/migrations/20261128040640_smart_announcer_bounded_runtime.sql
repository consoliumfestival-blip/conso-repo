BEGIN;
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.smart_announcer_team_strategy_v2(uuid,uuid,uuid,integer,text,text,uuid[])'::regprocedure)
    INTO definition;
  IF position('v_open_slots, 70)' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected planner definition';
  END IF;
  definition := replace(definition, '  v_mode_cap integer;',
    '  v_started_at timestamptz := clock_timestamp();
  v_mode_cap integer;');
  definition := replace(definition, 'IF p_item_ids IS NOT NULL THEN v_width := 1; END IF;',
    'IF p_item_ids IS NOT NULL OR v_candidate_count > 40 THEN v_width := 1; END IF;');
  definition := replace(definition, '  FOR v_depth IN 1..v_horizon LOOP',
    '  FOR v_depth IN 1..v_horizon LOOP
    -- Always finish a complete sendable batch; optional lookahead must fit
    -- inside the API budget. Never interrupt enumeration within a depth.
    IF p_item_ids IS NULL AND v_depth > v_batch_size
      AND clock_timestamp() - v_started_at >= interval ''3 seconds'' THEN
      EXIT;
    END IF;');
  definition := replace(definition, '''search_width'', v_width,',
    '''search_width'', v_width,
    ''planning_elapsed_ms'', round(extract(epoch FROM clock_timestamp() - v_started_at) * 1000),
    ''lookahead_limited_by_time'', p_item_ids IS NULL AND jsonb_array_length(coalesce(v_best->''items'', ''[]''::jsonb)) < v_horizon,');
  definition := replace(definition,
    'Every eligible result is considered for the next batch; future search depth is bounded and the full remaining pool is reconsidered after each batch.',
    'Every eligible result is considered for the next batch. Up to 70 results are explored within the calculation time budget; remaining results are reconsidered after each batch.');
  EXECUTE definition;
END $migration$;
NOTIFY pgrst, 'reload schema';
COMMIT;
