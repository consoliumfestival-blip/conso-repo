-- Measure suspense across the top 3 podium teams (1st - 3rd) instead of
-- 1st - last team across the entire festival, and keep beam width >= 2 up to
-- 200 candidates so Very Small / Small / Medium limits remain achievable.
BEGIN;
DO $migration$
DECLARE
  definition text;
  old_spread text;
  new_spread text;
  old_shortlist text;
  new_shortlist text;
  old_width text;
  new_width text;
BEGIN
  SELECT pg_get_functiondef('public.smart_announcer_team_strategy_v2(uuid,uuid,uuid,integer,text,text,uuid[])'::regprocedure)
    INTO definition;
  definition := replace(definition, chr(13), '');

  old_spread := 'max(s.total_points) - min(s.total_points),';
  new_spread := 'coalesce(max(s.total_points) - coalesce(min(s.total_points) FILTER (WHERE s.projected_rank <= 3), min(s.total_points)), 0),';
  IF position(old_spread IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected planner spread definition; no changes applied';
  END IF;
  definition := replace(definition, old_spread, new_spread);

  old_shortlist := $old$        WITH scored AS (
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
        )$old$;

  new_shortlist := $new$        WITH scored AS (
          SELECT candidate.id,
            max(points.total) FILTER(WHERE points.team_id=p_team_id) AS target_points,
            max(points.total) AS leader_points,
            coalesce(max(points.total) - coalesce(min(points.total) FILTER(WHERE points.rn <= 3), min(points.total)), 0) AS spread
          FROM unnest(v_remaining) candidate(id)
          CROSS JOIN LATERAL (
            SELECT coalesce(b->>'organisation_id',d->>'organisation_id')::uuid AS team_id,
              coalesce((b->>'total_points')::bigint,0) + coalesce((d->>'total_points')::bigint,0) AS total,
              rank() OVER (ORDER BY coalesce((b->>'total_points')::bigint,0) + coalesce((d->>'total_points')::bigint,0) DESC) AS rn
            FROM jsonb_array_elements(v_previous) b
            FULL JOIN jsonb_array_elements(coalesce(v_effects->candidate.id::text,'[]'::jsonb)) d
              ON d->>'organisation_id'=b->>'organisation_id'
          ) points
          GROUP BY candidate.id
        )$new$;

  old_shortlist := replace(old_shortlist, chr(13), '');
  new_shortlist := replace(new_shortlist, chr(13), '');
  IF position(old_shortlist IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected shortlist spread definition; no changes applied';
  END IF;
  definition := replace(definition, old_shortlist, new_shortlist);

  old_width := 'IF p_item_ids IS NOT NULL OR v_candidate_count > 40 THEN v_width := 1; END IF;';
  new_width := 'IF p_item_ids IS NOT NULL OR v_candidate_count > 200 THEN v_width := 1; END IF;';
  IF position(old_width IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected width guard definition; no changes applied';
  END IF;
  definition := replace(definition, old_width, new_width);

  EXECUTE definition;
END $migration$;
NOTIFY pgrst, 'reload schema';
COMMIT;
