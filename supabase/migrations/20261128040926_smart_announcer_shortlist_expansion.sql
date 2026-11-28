BEGIN;
DO $migration$
DECLARE definition text; shortlist text;
BEGIN
  SELECT pg_get_functiondef('public.smart_announcer_team_strategy_v2(uuid,uuid,uuid,integer,text,text,uuid[])'::regprocedure) INTO definition;
  definition:=replace(definition,'  v_remaining uuid[];', '  v_remaining uuid[];
  v_expansion_candidates uuid[];');
  shortlist:=$shortlist$
      v_expansion_candidates := v_remaining;
      IF p_item_ids IS NULL AND cardinality(v_remaining) > 12 THEN
        -- Score ALL remaining results using their exact cached point deltas.
        -- Full rank/grade tie-break projection is only needed for the shortlist.
        WITH scored AS (
          SELECT candidate.id,
            max(points.total) FILTER(WHERE points.team_id=p_team_id) AS target_points,
            max(points.total) AS leader_points,
            max(points.total)-min(points.total) AS spread
          FROM unnest(v_remaining) candidate(id)
          CROSS JOIN LATERAL (
            SELECT coalesce(b->>'organisation_id',d->>'organisation_id')::uuid AS team_id,
              coalesce((b->>'total_points')::bigint,0) + coalesce((d->>'total_points')::bigint,0) AS total
            FROM jsonb_array_elements(v_previous) b
            FULL JOIN jsonb_array_elements(coalesce(v_effects->candidate.id::text,'[]'::jsonb)) d
              ON d->>'organisation_id'=b->>'organisation_id'
          ) points
          GROUP BY candidate.id
        ), chosen AS (
          SELECT * FROM scored ORDER BY
            CASE WHEN p_priority='spread' AND v_mode_cap IS NOT NULL THEN greatest(0,spread-v_mode_cap) ELSE 0 END,
            CASE WHEN target_points=leader_points THEN 0 ELSE 1 END,
            CASE WHEN v_mode_cap IS NOT NULL THEN greatest(0,spread-v_mode_cap) ELSE spread END,
            greatest(0,leader_points-coalesce(target_points,0)),spread,id
          LIMIT 12
        )
        SELECT array_agg(id ORDER BY id) INTO v_expansion_candidates FROM chosen;
      END IF;
      FOREACH v_candidate IN ARRAY v_expansion_candidates LOOP
  $shortlist$;
  IF position('FOREACH v_candidate IN ARRAY v_remaining LOOP' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected planner expansion';
  END IF;
  definition:=replace(definition,'FOREACH v_candidate IN ARRAY v_remaining LOOP',shortlist);
  EXECUTE definition;
END $migration$;
NOTIFY pgrst, 'reload schema';
COMMIT;
