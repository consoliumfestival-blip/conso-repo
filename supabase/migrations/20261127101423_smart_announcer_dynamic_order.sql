-- Dynamic, Admin-selected-team ordering. This changes recommendation/queue eligibility
-- only; public result visibility and all result marks remain owned by Item Results.
BEGIN;

CREATE FUNCTION public.smart_announcer_teams(p_tenant_id uuid, p_festival_id uuid)
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  RETURN QUERY
  SELECT DISTINCT o.id, o.name
  FROM public.organisations o
  WHERE (o.tenant_id = p_tenant_id OR EXISTS (
    SELECT 1 FROM public.organisations parent
    WHERE parent.id = o.parent_id AND parent.tenant_id = p_tenant_id
  ))
  AND (
    EXISTS (SELECT 1 FROM public.festival_teams ft
      WHERE ft.festival_id = p_festival_id AND ft.organisation_id = o.id)
    OR EXISTS (
      SELECT 1 FROM public.results r
      LEFT JOIN public.registrations reg ON reg.id = r.registration_id
      LEFT JOIN public.participants participant ON participant.id = reg.participant_id
      LEFT JOIN public.result_team_awards award ON award.result_id = r.id
      WHERE r.festival_id = p_festival_id AND r.published IS TRUE
        AND r.result_status = 'published' AND reg.status IS DISTINCT FROM 'rejected'
        AND coalesce(award.organisation_id, reg.organisation_id, participant.organisation_id) = o.id
    )
  )
  ORDER BY o.name, o.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.smart_announcer_team_candidates(
  p_tenant_id uuid, p_festival_id uuid, p_team_id uuid
) RETURNS TABLE(id uuid, name text, item_code text, category_codes text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.organisations o
    WHERE o.id = p_team_id AND (o.tenant_id = p_tenant_id OR EXISTS (
      SELECT 1 FROM public.organisations parent
      WHERE parent.id = o.parent_id AND parent.tenant_id = p_tenant_id
    ))
  ) THEN
    RAISE EXCEPTION 'Team is outside the festival tenant' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.id,
    coalesce(nullif(i.item_name_ml, ''), nullif(i.item_name_en, ''), i.item_code),
    i.item_code, coalesce(i.category_codes, ARRAY[]::text[])
  FROM public.items i
  WHERE i.tenant_id = p_tenant_id AND i.festival_id = p_festival_id
    AND EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.item_id = i.id AND r.festival_id = p_festival_id
        AND r.published IS TRUE AND r.result_status = 'published'
    )
    -- Publishing an item is item-wide in Item Results. Exclude partial-public items.
    AND NOT EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.item_id = i.id AND r.festival_id = p_festival_id
        AND r.published IS TRUE AND r.result_status = 'published'
        AND coalesce(r.public_visible, false)
    )
    -- Sent or announced results are history; they must never be recommended again.
    AND NOT EXISTS (
      SELECT 1 FROM public.smart_announcer_queue q
      WHERE q.tenant_id = p_tenant_id AND q.festival_id = p_festival_id AND q.item_id = i.id
    )
  ORDER BY i.item_code NULLS LAST, i.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.smart_announcer_team_strategy(
  p_tenant_id uuid, p_festival_id uuid, p_team_id uuid,
  p_item_ids uuid[] DEFAULT NULL
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
  v_effects jsonb := '[]'::jsonb;
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
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
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
    THEN greatest(0, v_item_limit - v_public_item_count) ELSE 10 END;

  IF p_item_ids IS NOT NULL THEN
    IF cardinality(p_item_ids) NOT BETWEEN 1 AND 5
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
  v_horizon := CASE WHEN p_item_ids IS NOT NULL THEN cardinality(v_candidates)
    ELSE least(10, cardinality(v_candidates), v_open_slots) END;
  v_batch_size := least(5, v_horizon);

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
    v_effects := v_effects || jsonb_build_array(jsonb_build_object('item_id', v_candidate, 'teams', v_effect_teams));
  END LOOP;

  v_states := ARRAY[jsonb_build_object(
    'path', to_jsonb(ARRAY[]::uuid[]), 'remaining', to_jsonb(v_candidates),
    'first_count', 0, 'first_step', 99, 'worst_rank', 0,
    'max_spread', 0, 'sum_spread', 0, 'max_adjacent_gap', 0,
    'rank_changes', 0, 'last_standings', v_standings, 'items', '[]'::jsonb
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
        v_remaining := ARRAY[v_candidate];
      END IF;

      FOREACH v_candidate IN ARRAY v_remaining LOOP
        WITH baseline AS (
          SELECT * FROM jsonb_to_recordset(v_standings) AS b(
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
          FROM jsonb_array_elements(v_effects) effect
          JOIN jsonb_array_elements_text(to_jsonb(v_path || v_candidate)) WITH ORDINALITY selected(item_id, position)
            ON effect->>'item_id' = selected.item_id AND selected.position <= v_open_slots
          CROSS JOIN LATERAL jsonb_array_elements(effect->'teams') team
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
        FROM jsonb_array_elements(coalesce((
          SELECT effect->'teams' FROM jsonb_array_elements(v_effects) effect
          WHERE effect->>'item_id' = v_candidate::text LIMIT 1
        ), '[]'::jsonb)) team;
        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_snapshot) current_team
          LEFT JOIN jsonb_array_elements(v_previous) previous_team
            ON previous_team->>'organisation_id' = current_team->>'organisation_id'
          WHERE previous_team IS NULL
            OR current_team->>'total_points' IS DISTINCT FROM previous_team->>'total_points'
            OR current_team->>'first_place_count' IS DISTINCT FROM previous_team->>'first_place_count'
            OR current_team->>'second_place_count' IS DISTINCT FROM previous_team->>'second_place_count'
            OR current_team->>'third_place_count' IS DISTINCT FROM previous_team->>'third_place_count'
            OR current_team->>'grade_a_count' IS DISTINCT FROM previous_team->>'grade_a_count'
            OR current_team->>'projected_rank' IS DISTINCT FROM previous_team->>'projected_rank'
        ) THEN
          IF p_item_ids IS NOT NULL THEN
            RAISE EXCEPTION 'Selection no longer changes the standings; refresh recommendations' USING ERRCODE = '22023';
          END IF;
          CONTINUE;
        END IF;
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
          'first_step', CASE WHEN coalesce(v_rank, 9223372036854775807) = 1
            THEN least((v_state->>'first_step')::integer, v_depth) ELSE (v_state->>'first_step')::integer END,
          'worst_rank', greatest((v_state->>'worst_rank')::bigint, coalesce(v_rank, 9223372036854775807)),
          'max_spread', greatest((v_state->>'max_spread')::bigint, coalesce(v_spread, 0)),
          'sum_spread', (v_state->>'sum_spread')::bigint + coalesce(v_spread, 0),
          'rank_changes', (v_state->>'rank_changes')::integer + v_rank_changes,
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
    SELECT array_agg(selected.value ORDER BY
      (selected.value->>'first_step')::integer ASC,
      (selected.value->>'first_count')::integer DESC,
      (selected.value->>'worst_rank')::bigint ASC,
      (selected.value->>'max_spread')::bigint ASC,
      (selected.value->>'sum_spread')::bigint ASC,
      (selected.value->>'max_adjacent_gap')::bigint ASC,
      (selected.value->>'rank_changes')::integer DESC,
      selected.value->>'path' ASC)
    INTO v_states
    FROM (SELECT u.value FROM unnest(v_next_states) AS u(value) ORDER BY
      (u.value->>'first_step')::integer ASC,
      (u.value->>'first_count')::integer DESC,
      (u.value->>'worst_rank')::bigint ASC,
      (u.value->>'max_spread')::bigint ASC,
      (u.value->>'sum_spread')::bigint ASC,
      (u.value->>'max_adjacent_gap')::bigint ASC,
      (u.value->>'rank_changes')::integer DESC,
      u.value->>'path' ASC LIMIT v_width) selected;
  END LOOP;

  SELECT u.value INTO v_best FROM unnest(v_states) AS u(value) ORDER BY
    (u.value->>'first_step')::integer ASC, (u.value->>'first_count')::integer DESC,
    (u.value->>'worst_rank')::bigint ASC, (u.value->>'max_spread')::bigint ASC,
    (u.value->>'sum_spread')::bigint ASC, (u.value->>'max_adjacent_gap')::bigint ASC,
    (u.value->>'rank_changes')::integer DESC, u.value->>'path' ASC LIMIT 1;
  SELECT coalesce(jsonb_agg(step.value ORDER BY step.ordinality), '[]'::jsonb)
  INTO v_output
  FROM jsonb_array_elements(coalesce(v_best->'items', '[]'::jsonb)) WITH ORDINALITY step(value, ordinality)
  WHERE step.ordinality <= 5;
  SELECT count(*) FILTER (WHERE step.ordinality > v_batch_size)::integer,
    count(*) FILTER (WHERE step.ordinality > v_batch_size AND (step.value->>'target_is_first')::boolean)::integer,
    coalesce(max((step.value->>'spread')::bigint) FILTER (WHERE step.ordinality > v_batch_size), 0)
  INTO v_future_steps, v_future_first_count, v_future_max_spread
  FROM jsonb_array_elements(coalesce(v_best->'items', '[]'::jsonb)) WITH ORDINALITY step(value, ordinality);
  RETURN jsonb_build_object(
    'items', v_output, 'candidate_count', v_candidate_count,
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
    'selection_note', CASE WHEN p_item_ids IS NULL THEN 'The next batch is optimized with up to five additional eligible results as a sustainability lookahead; recalculated after each batch.'
      ELSE 'Manual order; projected standings recalculated for this order.' END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.smart_announcer_team_candidates(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smart_announcer_team_candidates(uuid,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.smart_announcer_teams(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smart_announcer_teams(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.smart_announcer_team_strategy(uuid,uuid,uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smart_announcer_team_strategy(uuid,uuid,uuid,uuid[]) TO authenticated;

COMMIT;
