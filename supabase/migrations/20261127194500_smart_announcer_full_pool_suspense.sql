-- Full-pool suspense planning. Existing RPCs remain for compatibility.
BEGIN;
CREATE OR REPLACE FUNCTION public.smart_announcer_replace_team_queue(p_tenant_id uuid, p_festival_id uuid, p_team_id uuid, p_item_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  IF p_team_id IS NULL OR p_item_ids IS NULL OR pg_catalog.cardinality(p_item_ids) NOT BETWEEN 1 AND 10
     OR pg_catalog.cardinality(p_item_ids) <> (SELECT count(DISTINCT x) FROM pg_catalog.unnest(p_item_ids) x) THEN
    RAISE EXCEPTION 'Invalid selection' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_festival_id::text, 0));
  PERFORM i.id FROM public.items i WHERE i.id = ANY(p_item_ids) ORDER BY i.id FOR SHARE;
  PERFORM r.id FROM public.results r WHERE r.festival_id = p_festival_id AND r.item_id = ANY(p_item_ids) ORDER BY r.id FOR UPDATE;
  PERFORM a.result_id FROM public.result_team_awards a WHERE a.result_id IN
    (SELECT r.id FROM public.results r WHERE r.festival_id = p_festival_id AND r.item_id = ANY(p_item_ids))
    ORDER BY a.result_id FOR SHARE;
  PERFORM reg.id FROM public.registrations reg WHERE reg.id IN
    (SELECT r.registration_id FROM public.results r WHERE r.festival_id = p_festival_id AND r.item_id = ANY(p_item_ids))
    ORDER BY reg.id FOR SHARE;
  PERFORM p.id FROM public.participants p WHERE p.id IN
    (SELECT reg.participant_id FROM public.registrations reg JOIN public.results r ON r.registration_id = reg.id
      WHERE r.festival_id = p_festival_id AND r.item_id = ANY(p_item_ids))
    ORDER BY p.id FOR SHARE;
  IF (SELECT count(*) FROM public.smart_announcer_team_candidates(p_tenant_id, p_festival_id, p_team_id) c WHERE c.id = ANY(p_item_ids)) <> pg_catalog.cardinality(p_item_ids)
  THEN RAISE EXCEPTION 'Selected item is no longer eligible' USING ERRCODE = '22023'; END IF;
  PERFORM public.smart_announcer_save_queue(p_tenant_id, p_festival_id, p_item_ids);
END $$;

CREATE OR REPLACE FUNCTION public.smart_announcer_team_strategy_v2(
  p_tenant_id uuid, p_festival_id uuid, p_team_id uuid,
  p_batch_size integer DEFAULT 5, p_mode text DEFAULT 'auto',
  p_priority text DEFAULT 'team', p_item_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_baseline uuid[];
  v_candidates uuid[];
  v_candidate uuid;
  v_state jsonb;
  v_states jsonb[];
  v_next_states jsonb[];
  v_next_state jsonb;
  v_best jsonb;
  v_path uuid[];
  v_remaining uuid[];
  v_snapshot jsonb;
  v_standings jsonb;
  v_previous jsonb;
  v_rank bigint;
  v_top_tie_count integer;
  v_points bigint;
  v_leader bigint;
  v_spread bigint;
  v_max_gap bigint;
  v_rank_changes integer;
  v_depth integer;
  v_width integer;
  v_candidate_count integer;
  v_output jsonb;
  v_effects jsonb := '{}'::jsonb;
  v_effect_teams jsonb;
  v_point_deltas jsonb;
  v_settings_mode text;
  v_item_limit integer;
  v_public_item_count integer;
  v_open_slots integer;
  v_horizon integer;
  v_batch_size integer;
  v_future_steps integer := 0;
  v_future_first_count integer := 0;
  v_future_max_spread bigint := 0;
  v_mode_cap integer;
  v_batch_min_spread bigint;
  v_batch_target_min_spread bigint;
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  IF p_batch_size IS NULL OR p_mode IS NULL OR p_priority IS NULL
    OR p_batch_size NOT IN (5, 10) OR p_mode NOT IN ('very_small', 'small', 'medium', 'high', 'auto')
    OR p_priority NOT IN ('team', 'spread') THEN
    RAISE EXCEPTION 'Invalid batch size, suspense mode, or priority' USING ERRCODE = '22023';
  END IF;
  v_mode_cap := CASE p_mode WHEN 'very_small' THEN 5 WHEN 'small' THEN 10
    WHEN 'medium' THEN 25 WHEN 'high' THEN 50 ELSE NULL END;
  IF NOT EXISTS (
    SELECT 1 FROM public.organisations o
    WHERE o.id = p_team_id AND (o.tenant_id = p_tenant_id OR EXISTS (
      SELECT 1 FROM public.organisations parent
      WHERE parent.id = o.parent_id AND parent.tenant_id = p_tenant_id
    ))
  ) THEN
    RAISE EXCEPTION 'Team is outside the festival tenant' USING ERRCODE = '42501';
  END IF;

  -- The projection itself reads all current public results. Announcer status alone
  -- never adds points to the real standings, so queue history is not a baseline.
  v_baseline := ARRAY[]::uuid[];

  SELECT coalesce(array_agg(c.id ORDER BY c.id), ARRAY[]::uuid[])
    INTO v_candidates
  FROM public.smart_announcer_team_candidates(p_tenant_id, p_festival_id, p_team_id) c;
  v_candidate_count := cardinality(v_candidates);

  SELECT ranking_mode, item_limit INTO v_settings_mode, v_item_limit
  FROM public.festival_leaderboard_settings WHERE festival_id = p_festival_id LIMIT 1;
  SELECT count(DISTINCT r.item_id) INTO v_public_item_count
  FROM public.results r JOIN public.items i ON i.id = r.item_id
  WHERE r.festival_id = p_festival_id AND i.tenant_id = p_tenant_id
    AND r.published IS TRUE AND coalesce(r.result_status, 'draft') IN ('published', 'ready')
    AND coalesce(r.public_visible, false);
  v_open_slots := CASE WHEN coalesce(v_settings_mode, 'ALL') = 'LIMITED'
    AND v_item_limit IS NOT NULL AND v_item_limit > 0
    THEN greatest(0, v_item_limit - v_public_item_count) ELSE cardinality(v_candidates) END;

  IF p_item_ids IS NOT NULL THEN
    IF cardinality(p_item_ids) NOT BETWEEN 1 AND p_batch_size
      OR cardinality(p_item_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_item_ids) x)
      OR EXISTS (SELECT 1 FROM unnest(p_item_ids) x WHERE x IS NULL OR NOT (x = ANY(v_candidates))) THEN
      RAISE EXCEPTION 'Selection changed; refresh team results' USING ERRCODE = '22023';
    END IF;
    v_candidates := p_item_ids;
  END IF;

  -- Bound search cost by the candidate pool. Every candidate is considered at each
  -- beam step; a narrow beam keeps large festivals practical and deterministically
  -- degrades to greedy ordering for very large pools.
  v_width := CASE WHEN v_candidate_count <= 40 THEN 6
                  WHEN v_candidate_count <= 120 THEN 3
                  WHEN v_candidate_count <= 300 THEN 2 ELSE 1 END;
  IF p_item_ids IS NOT NULL THEN v_width := 1; END IF;
  -- Stop when the eligible pool or public leaderboard slots run out. Cap
  -- speculative depth at 100, then replan after each completed batch.
  v_horizon := CASE WHEN p_item_ids IS NOT NULL THEN cardinality(v_candidates)
    ELSE least(cardinality(v_candidates), v_open_slots, 100) END;
  v_batch_size := least(p_batch_size, v_horizon);

  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.projected_rank, s.organisation_id), '[]'::jsonb)
    INTO v_standings
  FROM (
    SELECT l.organisation_id, l.organisation_name, l.total_points,
      l.first_place_count, l.second_place_count, l.third_place_count,
      l.grade_a_plus_count, l.grade_a_count, l.grade_b_count, l.grade_c_count,
      l.result_count, rank() OVER (ORDER BY l.total_points DESC, l.first_place_count DESC,
        l.second_place_count DESC, l.third_place_count DESC, l.grade_a_count DESC) AS projected_rank
    FROM public.smart_announcer_project_sequence(p_tenant_id, p_festival_id, v_baseline) l
  ) s;

  -- Cache each eligible item's exact delta by comparing the existing canonical
  -- leaderboard projection with its one-item projection. Search states then add
  -- these small vectors instead of rescanning every result for every permutation.
  FOREACH v_candidate IN ARRAY v_candidates LOOP
    WITH baseline AS (
      SELECT * FROM jsonb_to_recordset(v_standings) AS b(
        organisation_id uuid, organisation_name text, total_points bigint,
        first_place_count bigint, second_place_count bigint, third_place_count bigint,
        grade_a_plus_count bigint, grade_a_count bigint, grade_b_count bigint,
        grade_c_count bigint, result_count bigint, projected_rank bigint
      )
    ), projected AS (
      SELECT l.organisation_id, l.organisation_name, l.total_points,
        l.first_place_count, l.second_place_count, l.third_place_count,
        l.grade_a_plus_count, l.grade_a_count, l.grade_b_count,
        l.grade_c_count, l.result_count
      FROM public.smart_announcer_project_sequence(p_tenant_id, p_festival_id, ARRAY[v_candidate]) l
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'organisation_id', coalesce(b.organisation_id, p.organisation_id),
      'organisation_name', coalesce(b.organisation_name, p.organisation_name),
      'total_points', coalesce(p.total_points, 0) - coalesce(b.total_points, 0),
      'first_place_count', coalesce(p.first_place_count, 0) - coalesce(b.first_place_count, 0),
      'second_place_count', coalesce(p.second_place_count, 0) - coalesce(b.second_place_count, 0),
      'third_place_count', coalesce(p.third_place_count, 0) - coalesce(b.third_place_count, 0),
      'grade_a_plus_count', coalesce(p.grade_a_plus_count, 0) - coalesce(b.grade_a_plus_count, 0),
      'grade_a_count', coalesce(p.grade_a_count, 0) - coalesce(b.grade_a_count, 0),
      'grade_b_count', coalesce(p.grade_b_count, 0) - coalesce(b.grade_b_count, 0),
      'grade_c_count', coalesce(p.grade_c_count, 0) - coalesce(b.grade_c_count, 0),
      'result_count', coalesce(p.result_count, 0) - coalesce(b.result_count, 0)
    )), '[]'::jsonb) INTO v_effect_teams
    FROM baseline b FULL JOIN projected p USING (organisation_id);
    v_effects := jsonb_set(v_effects, ARRAY[v_candidate::text], v_effect_teams, true);
  END LOOP;

  v_states := ARRAY[jsonb_build_object(
    'path', to_jsonb(ARRAY[]::uuid[]), 'remaining', to_jsonb(v_candidates),
    'first_count', 0, 'first_step', 2147483647, 'batch_target_first', false, 'worst_rank', 0,
    'max_spread', 0, 'sum_spread', 0, 'max_adjacent_gap', 0,
    'rank_changes', 0, 'mode_violation', 0, 'batch_mode_violation', 0, 'batch_spread', 0,
    'last_standings', v_standings, 'items', '[]'::jsonb
  )];

  FOR v_depth IN 1..v_horizon LOOP
    v_next_states := ARRAY[]::jsonb[];
    FOREACH v_state IN ARRAY v_states LOOP
      SELECT coalesce(array_agg(value::text::uuid), ARRAY[]::uuid[]) INTO v_path
      FROM jsonb_array_elements_text(v_state->'path');
      SELECT coalesce(array_agg(value::text::uuid), ARRAY[]::uuid[]) INTO v_remaining
      FROM jsonb_array_elements_text(v_state->'remaining');
      v_previous := v_state->'last_standings';

      IF p_item_ids IS NOT NULL THEN
        v_candidate := v_remaining[1];
      END IF;

      FOREACH v_candidate IN ARRAY v_remaining LOOP
        IF p_item_ids IS NOT NULL AND v_candidate <> v_remaining[1] THEN
          CONTINUE;
        END IF;
        WITH baseline AS (
          SELECT * FROM jsonb_to_recordset(v_previous) AS b(
            organisation_id uuid, organisation_name text, total_points bigint,
            first_place_count bigint, second_place_count bigint, third_place_count bigint,
            grade_a_plus_count bigint, grade_a_count bigint, grade_b_count bigint,
            grade_c_count bigint, result_count bigint, projected_rank bigint
          )
        ), delta AS (
          SELECT (team->>'organisation_id')::uuid AS organisation_id,
            max(team->>'organisation_name') AS organisation_name,
            sum((team->>'total_points')::bigint) AS total_points,
            sum((team->>'first_place_count')::bigint) AS first_place_count,
            sum((team->>'second_place_count')::bigint) AS second_place_count,
            sum((team->>'third_place_count')::bigint) AS third_place_count,
            sum((team->>'grade_a_plus_count')::bigint) AS grade_a_plus_count,
            sum((team->>'grade_a_count')::bigint) AS grade_a_count,
            sum((team->>'grade_b_count')::bigint) AS grade_b_count,
            sum((team->>'grade_c_count')::bigint) AS grade_c_count,
            sum((team->>'result_count')::bigint) AS result_count
          FROM jsonb_array_elements(CASE WHEN v_depth <= v_open_slots
            THEN coalesce(v_effects -> v_candidate::text, '[]'::jsonb)
            ELSE '[]'::jsonb END) team
          GROUP BY (team->>'organisation_id')::uuid
        ), combined AS (
          SELECT coalesce(b.organisation_id, d.organisation_id) AS organisation_id,
            coalesce(b.organisation_name, d.organisation_name) AS organisation_name,
            coalesce(b.total_points, 0) + coalesce(d.total_points, 0) AS total_points,
            coalesce(b.first_place_count, 0) + coalesce(d.first_place_count, 0) AS first_place_count,
            coalesce(b.second_place_count, 0) + coalesce(d.second_place_count, 0) AS second_place_count,
            coalesce(b.third_place_count, 0) + coalesce(d.third_place_count, 0) AS third_place_count,
            coalesce(b.grade_a_plus_count, 0) + coalesce(d.grade_a_plus_count, 0) AS grade_a_plus_count,
            coalesce(b.grade_a_count, 0) + coalesce(d.grade_a_count, 0) AS grade_a_count,
            coalesce(b.grade_b_count, 0) + coalesce(d.grade_b_count, 0) AS grade_b_count,
            coalesce(b.grade_c_count, 0) + coalesce(d.grade_c_count, 0) AS grade_c_count,
            coalesce(b.result_count, 0) + coalesce(d.result_count, 0) AS result_count
          FROM baseline b FULL JOIN delta d USING (organisation_id)
        ), ranked AS (
          SELECT c.*, rank() OVER (ORDER BY c.total_points DESC, c.first_place_count DESC,
            c.second_place_count DESC, c.third_place_count DESC, c.grade_a_count DESC) AS projected_rank,
            lead(c.total_points) OVER (ORDER BY c.total_points DESC, c.first_place_count DESC,
              c.second_place_count DESC, c.third_place_count DESC, c.grade_a_count DESC) AS next_points,
            (SELECT (x->>'projected_rank')::bigint FROM jsonb_array_elements(v_previous) x
              WHERE x->>'organisation_id' = c.organisation_id::text LIMIT 1) AS previous_rank
          FROM combined c
        )
        SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.projected_rank, s.organisation_id), '[]'::jsonb),
          max(s.projected_rank) FILTER (WHERE s.organisation_id = p_team_id),
          max(s.total_points) FILTER (WHERE s.organisation_id = p_team_id),
          max(s.total_points) - min(s.total_points),
          coalesce(max(s.total_points - s.next_points), 0),
          count(*) FILTER (WHERE s.organisation_id <> p_team_id AND s.previous_rank IS NOT NULL
            AND s.previous_rank <> s.projected_rank)::integer
        INTO v_snapshot, v_rank, v_points, v_spread, v_max_gap, v_rank_changes
        FROM ranked s;

        v_leader := coalesce((v_snapshot->0->>'total_points')::bigint, 0);
        v_max_gap := coalesce(v_max_gap, 0);
        v_rank_changes := coalesce(v_rank_changes, 0);
        SELECT count(*)::integer INTO v_top_tie_count
        FROM jsonb_array_elements(v_snapshot) team
        WHERE (team->>'projected_rank')::bigint = 1;
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'organisation_id', (team->>'organisation_id')::uuid,
          'points', (team->>'total_points')::bigint
        ) ORDER BY (team->>'organisation_id')::uuid), '[]'::jsonb)
        INTO v_point_deltas
        FROM jsonb_array_elements(coalesce(v_effects -> v_candidate::text, '[]'::jsonb)) team;
        -- An eligible zero-point result still needs to be announced. Its
        -- standings snapshot may equal the previous one; keep it in the order.
        v_next_state := jsonb_build_object(
          'item_id', v_candidate, 'team_rank', coalesce(v_rank, 9223372036854775807),
          'team_points', coalesce(v_points, 0), 'target_is_first', coalesce(v_rank, 9223372036854775807) = 1,
          'target_tied_first', coalesce(v_rank, 9223372036854775807) = 1 AND v_top_tie_count > 1,
          'leader_gap', greatest(0, v_leader - coalesce(v_points, 0)),
          'spread', coalesce(v_spread, 0), 'max_adjacent_gap', v_max_gap,
          'standings', v_snapshot, 'point_deltas', v_point_deltas,
          'path', to_jsonb(v_path || v_candidate),
          'remaining', to_jsonb(array_remove(v_remaining, v_candidate)),
          'first_count', (v_state->>'first_count')::integer + CASE WHEN v_rank = 1 THEN 1 ELSE 0 END,
          'batch_target_first', CASE WHEN v_depth = v_batch_size THEN v_rank = 1
            ELSE coalesce((v_state->>'batch_target_first')::boolean, false) END,
          'first_step', CASE WHEN coalesce(v_rank, 9223372036854775807) = 1
            THEN least((v_state->>'first_step')::integer, v_depth) ELSE (v_state->>'first_step')::integer END,
          'worst_rank', greatest((v_state->>'worst_rank')::bigint, coalesce(v_rank, 9223372036854775807)),
          'max_spread', greatest((v_state->>'max_spread')::bigint, coalesce(v_spread, 0)),
          'sum_spread', (v_state->>'sum_spread')::bigint + coalesce(v_spread, 0),
          'rank_changes', (v_state->>'rank_changes')::integer + v_rank_changes,
          'mode_violation', (v_state->>'mode_violation')::bigint +
            CASE WHEN v_mode_cap IS NOT NULL AND v_depth % p_batch_size = 0
              THEN greatest(0, coalesce(v_spread, 0) - v_mode_cap) ELSE 0 END,
          'batch_mode_violation', CASE WHEN v_depth = v_batch_size AND v_mode_cap IS NOT NULL
            THEN greatest(0, coalesce(v_spread, 0) - v_mode_cap)
            ELSE (v_state->>'batch_mode_violation')::bigint END,
          'batch_spread', CASE WHEN v_depth = v_batch_size THEN coalesce(v_spread, 0)
            ELSE (v_state->>'batch_spread')::bigint END,
          'last_standings', v_snapshot,
          'items', (v_state->'items') || jsonb_build_array(jsonb_build_object(
            'item_id', v_candidate, 'team_rank', coalesce(v_rank, 9223372036854775807),
            'team_points', coalesce(v_points, 0), 'target_is_first', coalesce(v_rank, 9223372036854775807) = 1,
            'target_tied_first', coalesce(v_rank, 9223372036854775807) = 1 AND v_top_tie_count > 1,
            'leader_gap', greatest(0, v_leader - coalesce(v_points, 0)),
            'spread', coalesce(v_spread, 0), 'max_adjacent_gap', v_max_gap,
            'standings', v_snapshot, 'point_deltas', v_point_deltas
          ))
        );
        v_next_states := array_append(v_next_states, v_next_state);
      END LOOP;
    END LOOP;

    IF cardinality(v_next_states) = 0 THEN EXIT; END IF;
    IF v_depth = v_batch_size THEN
      SELECT min((s.value->'items'->(v_batch_size - 1)->>'spread')::bigint),
        min((s.value->'items'->(v_batch_size - 1)->>'spread')::bigint)
          FILTER (WHERE (s.value->'items'->(v_batch_size - 1)->>'target_is_first')::boolean)
      INTO v_batch_min_spread, v_batch_target_min_spread
      FROM unnest(v_next_states) s(value);
    END IF;
    SELECT array_agg(selected.value ORDER BY
      CASE WHEN p_priority = 'spread' THEN (selected.value->>'batch_mode_violation')::bigint ELSE 0 END ASC,
      CASE WHEN (selected.value->>'batch_target_first')::boolean THEN 0 ELSE 1 END ASC,
      CASE WHEN p_mode = 'auto' THEN (selected.value->>'batch_spread')::bigint ELSE 0 END ASC,
      (selected.value->>'batch_mode_violation')::bigint ASC,
      (selected.value->>'first_step')::integer ASC,
      (selected.value->>'mode_violation')::bigint ASC,
      (selected.value->>'first_count')::integer DESC,
      (selected.value->>'worst_rank')::bigint ASC,
      (selected.value->>'max_spread')::bigint ASC,
      (selected.value->>'sum_spread')::bigint ASC,
      (selected.value->>'max_adjacent_gap')::bigint ASC,
      (selected.value->>'rank_changes')::integer DESC,
      selected.value->>'path' ASC)
    INTO v_states
    FROM (SELECT u.value FROM unnest(v_next_states) AS u(value) ORDER BY
      CASE WHEN p_priority = 'spread' THEN (u.value->>'batch_mode_violation')::bigint ELSE 0 END ASC,
      CASE WHEN (u.value->>'batch_target_first')::boolean THEN 0 ELSE 1 END ASC,
      CASE WHEN p_mode = 'auto' THEN (u.value->>'batch_spread')::bigint ELSE 0 END ASC,
      (u.value->>'batch_mode_violation')::bigint ASC,
      (u.value->>'first_step')::integer ASC,
      (u.value->>'mode_violation')::bigint ASC,
      (u.value->>'first_count')::integer DESC,
      (u.value->>'worst_rank')::bigint ASC,
      (u.value->>'max_spread')::bigint ASC,
      (u.value->>'sum_spread')::bigint ASC,
      (u.value->>'max_adjacent_gap')::bigint ASC,
      (u.value->>'rank_changes')::integer DESC,
      u.value->>'path' ASC LIMIT v_width) selected;
  END LOOP;

  SELECT u.value INTO v_best FROM unnest(v_states) AS u(value) ORDER BY
    CASE WHEN p_priority = 'spread' THEN (u.value->>'batch_mode_violation')::bigint ELSE 0 END ASC,
    CASE WHEN (u.value->>'batch_target_first')::boolean THEN 0 ELSE 1 END ASC,
    CASE WHEN p_mode = 'auto' THEN (u.value->>'batch_spread')::bigint ELSE 0 END ASC,
    (u.value->>'batch_mode_violation')::bigint ASC,
    (u.value->>'first_step')::integer ASC, (u.value->>'mode_violation')::bigint ASC,
    (u.value->>'first_count')::integer DESC,
    (u.value->>'worst_rank')::bigint ASC, (u.value->>'max_spread')::bigint ASC,
    (u.value->>'sum_spread')::bigint ASC, (u.value->>'max_adjacent_gap')::bigint ASC,
    (u.value->>'rank_changes')::integer DESC, u.value->>'path' ASC LIMIT 1;
  SELECT coalesce(jsonb_agg(step.value ORDER BY step.ordinality), '[]'::jsonb)
  INTO v_output
  FROM jsonb_array_elements(coalesce(v_best->'items', '[]'::jsonb)) WITH ORDINALITY step(value, ordinality)
  WHERE step.ordinality <= v_batch_size;
  SELECT count(*) FILTER (WHERE step.ordinality > v_batch_size)::integer,
    count(*) FILTER (WHERE step.ordinality > v_batch_size AND (step.value->>'target_is_first')::boolean)::integer,
    coalesce(max((step.value->>'spread')::bigint) FILTER (WHERE step.ordinality > v_batch_size), 0)
  INTO v_future_steps, v_future_first_count, v_future_max_spread
  FROM jsonb_array_elements(coalesce(v_best->'items', '[]'::jsonb)) WITH ORDINALITY step(value, ordinality);
  RETURN jsonb_build_object(
    'items', v_output, 'candidate_count', v_candidate_count,
    'batch_size', v_batch_size, 'mode', p_mode, 'priority', p_priority,
    'minimum_batch_spread', v_batch_min_spread,
    'minimum_team_first_spread', v_batch_target_min_spread,
    'batch_spread', coalesce((v_output->(v_batch_size - 1)->>'spread')::bigint, 0),
    'mode_met', v_mode_cap IS NULL OR coalesce((v_output->(v_batch_size - 1)->>'spread')::bigint, 0) <= v_mode_cap,
    'available_modes', jsonb_build_object(
      'very_small', v_batch_min_spread <= 5, 'small', v_batch_min_spread <= 10,
      'medium', v_batch_min_spread <= 25, 'high', v_batch_min_spread <= 50,
      'auto', true),
    'target_reaches_first', v_best IS NOT NULL AND (v_best->>'first_step')::integer <= v_batch_size,
    'target_first_step', CASE WHEN (v_best->>'first_step')::integer <= v_batch_size
      THEN (v_best->>'first_step')::integer ELSE NULL END,
    'target_is_first_at_batch_end', coalesce((v_output->(v_batch_size - 1)->>'target_is_first')::boolean, false),
    'target_tied_first_at_batch_end', coalesce((v_output->(v_batch_size - 1)->>'target_tied_first')::boolean, false),
    'lookahead_steps', v_future_steps,
    'lookahead_target_first_checkpoints', v_future_first_count,
    'lookahead_max_spread', v_future_max_spread,
    'lookahead_first_step', CASE WHEN v_best IS NOT NULL AND (v_best->>'first_step')::integer <= jsonb_array_length(coalesce(v_best->'items', '[]'::jsonb))
      THEN (v_best->>'first_step')::integer ELSE NULL END,
    'search_width', v_width,
    'selection_note', CASE WHEN p_item_ids IS NULL THEN 'Every eligible result is considered for the next batch; future search depth is bounded and the full remaining pool is reconsidered after each batch.'
      ELSE 'Manual order; projected standings recalculated for this order.' END
  );
END;
$function$;

CREATE FUNCTION public.smart_announcer_batch_preview_v2(
 p_tenant_id uuid,p_festival_id uuid,p_team_id uuid,p_batch_size integer,
 p_mode text,p_priority text,p_item_ids uuid[] DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; schedules jsonb;
BEGIN
 PERFORM public.smart_announcer_assert_admin(p_tenant_id,p_festival_id);
 result:=public.smart_announcer_team_strategy_v2(p_tenant_id,p_festival_id,p_team_id,p_batch_size,p_mode,p_priority,p_item_ids);
 SELECT coalesce(jsonb_agg(jsonb_build_object('item_id',s.item_id,'start_time',s.start_time,'venue',v.name) ORDER BY s.start_time),'[]'::jsonb)
 INTO schedules FROM public.schedules s LEFT JOIN public.venues v ON v.id=s.venue_id
 WHERE s.tenant_id=p_tenant_id AND s.festival_id=p_festival_id AND s.item_id IN(SELECT (x->>'item_id')::uuid FROM jsonb_array_elements(result->'items') x);
 RETURN result||jsonb_build_object('schedules',schedules);
END $$;

CREATE FUNCTION public.smart_announcer_send_batch_v2(
 p_tenant_id uuid,p_festival_id uuid,p_team_id uuid,p_item_ids uuid[],
 p_batch_size integer,p_mode text,p_priority text,
 p_confirm_cap_override boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE session uuid; preview jsonb; cap integer;
BEGIN
 PERFORM public.smart_announcer_assert_admin(p_tenant_id,p_festival_id);
 IF p_item_ids IS NULL OR cardinality(p_item_ids) NOT BETWEEN 1 AND p_batch_size THEN
   RAISE EXCEPTION 'Invalid batch selection' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text||':'||p_festival_id::text,0));
 SELECT id INTO session FROM public.smart_announcer_sessions WHERE tenant_id=p_tenant_id AND festival_id=p_festival_id AND closed_at IS NULL FOR UPDATE;
 IF session IS NULL THEN RAISE EXCEPTION 'Create an announcer session first'; END IF;
 IF EXISTS(SELECT 1 FROM public.smart_announcer_queue WHERE tenant_id=p_tenant_id AND festival_id=p_festival_id AND announced_at IS NULL) THEN RAISE EXCEPTION 'Finish the pending batch before sending the next batch'; END IF;
 preview:=public.smart_announcer_batch_preview_v2(p_tenant_id,p_festival_id,p_team_id,p_batch_size,p_mode,p_priority,p_item_ids);
 cap:=CASE p_mode WHEN 'very_small' THEN 5 WHEN 'small' THEN 10 WHEN 'medium' THEN 25 WHEN 'high' THEN 50 ELSE NULL END;
 IF cap IS NOT NULL AND (preview->>'batch_spread')::bigint > cap
   AND NOT (p_priority = 'team' AND p_confirm_cap_override IS TRUE) THEN
   RAISE EXCEPTION 'Selected suspense limit is not met; confirm team priority or choose another mode' USING ERRCODE='22023';
 END IF;
 preview := preview || jsonb_build_object('mode_override_confirmed',
   cap IS NOT NULL AND (preview->>'batch_spread')::bigint > cap AND p_confirm_cap_override IS TRUE);
 PERFORM public.smart_announcer_replace_team_queue(p_tenant_id,p_festival_id,p_team_id,p_item_ids);
 INSERT INTO public.smart_announcer_batches(session_id,team_id,item_ids,preview,created_by)
 VALUES(session,p_team_id,p_item_ids,preview,auth.uid());
END $$;

REVOKE ALL ON FUNCTION public.smart_announcer_team_strategy_v2(uuid,uuid,uuid,integer,text,text,uuid[]),
 public.smart_announcer_batch_preview_v2(uuid,uuid,uuid,integer,text,text,uuid[]),
 public.smart_announcer_send_batch_v2(uuid,uuid,uuid,uuid[],integer,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.smart_announcer_team_strategy_v2(uuid,uuid,uuid,integer,text,text,uuid[]),
 public.smart_announcer_batch_preview_v2(uuid,uuid,uuid,integer,text,text,uuid[]),
 public.smart_announcer_send_batch_v2(uuid,uuid,uuid,uuid[],integer,text,text,boolean) TO authenticated;

COMMIT;
