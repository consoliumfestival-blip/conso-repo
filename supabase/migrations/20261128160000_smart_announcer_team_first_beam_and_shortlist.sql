-- Ensure "Team to prioritize" keeps target-team catch-up candidates in the
-- shortlist and beam at intermediate depths (before v_batch_size) instead of
-- pruning them in favor of spread-only candidates before the team can reach 1st.
BEGIN;
DO $migration$
DECLARE
  definition text;
  old_shortlist_order text;
  new_shortlist_order text;
  old_selected_order text;
  new_selected_order text;
  old_u_order text;
  new_u_order text;
  old_best_order text;
  new_best_order text;
BEGIN
  SELECT pg_get_functiondef('public.smart_announcer_team_strategy_v2(uuid,uuid,uuid,integer,text,text,uuid[])'::regprocedure)
    INTO definition;
  definition := replace(definition, chr(13), '');

  old_shortlist_order := $old$        ), chosen AS (
          SELECT * FROM scored ORDER BY
            CASE WHEN p_priority='spread' AND v_mode_cap IS NOT NULL THEN greatest(0,spread-v_mode_cap) ELSE 0 END,
            CASE WHEN target_points=leader_points THEN 0 ELSE 1 END,
            CASE WHEN v_mode_cap IS NOT NULL THEN greatest(0,spread-v_mode_cap) ELSE spread END,
            greatest(0,leader_points-coalesce(target_points,0)),spread,id
          LIMIT 12
        )$old$;

  new_shortlist_order := $new$        ), chosen AS (
          SELECT * FROM scored ORDER BY
            CASE WHEN p_priority='spread' AND v_mode_cap IS NOT NULL THEN greatest(0,spread-v_mode_cap) ELSE 0 END,
            CASE WHEN target_points=leader_points THEN 0 ELSE 1 END,
            CASE WHEN p_priority='team' THEN greatest(0,leader_points-coalesce(target_points,0)) ELSE 0 END,
            CASE WHEN v_mode_cap IS NOT NULL THEN greatest(0,spread-v_mode_cap) ELSE spread END,
            greatest(0,leader_points-coalesce(target_points,0)),spread,id
          LIMIT 12
        )$new$;

  old_shortlist_order := replace(old_shortlist_order, chr(13), '');
  new_shortlist_order := replace(new_shortlist_order, chr(13), '');
  IF position(old_shortlist_order IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected shortlist order definition; no changes applied';
  END IF;
  definition := replace(definition, old_shortlist_order, new_shortlist_order);

  old_selected_order := '      (selected.value->>''first_step'')::integer ASC,
      (selected.value->>''mode_violation'')::bigint ASC,';
  new_selected_order := '      (selected.value->>''first_step'')::integer ASC,
      CASE WHEN p_priority = ''team'' THEN (selected.value->>''team_rank'')::bigint ELSE 0 END ASC,
      CASE WHEN p_priority = ''team'' THEN (selected.value->>''leader_gap'')::bigint ELSE 0 END ASC,
      (selected.value->>''mode_violation'')::bigint ASC,';
  IF position(old_selected_order IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected selected order definition; no changes applied';
  END IF;
  definition := replace(definition, old_selected_order, new_selected_order);

  old_u_order := '      (u.value->>''first_step'')::integer ASC,
      (u.value->>''mode_violation'')::bigint ASC,';
  new_u_order := '      (u.value->>''first_step'')::integer ASC,
      CASE WHEN p_priority = ''team'' THEN (u.value->>''team_rank'')::bigint ELSE 0 END ASC,
      CASE WHEN p_priority = ''team'' THEN (u.value->>''leader_gap'')::bigint ELSE 0 END ASC,
      (u.value->>''mode_violation'')::bigint ASC,';
  IF position(old_u_order IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected beam order definition; no changes applied';
  END IF;
  definition := replace(definition, old_u_order, new_u_order);

  old_best_order := '    (u.value->>''first_step'')::integer ASC, (u.value->>''mode_violation'')::bigint ASC,';
  new_best_order := '    (u.value->>''first_step'')::integer ASC,
    CASE WHEN p_priority = ''team'' THEN (u.value->>''team_rank'')::bigint ELSE 0 END ASC,
    CASE WHEN p_priority = ''team'' THEN (u.value->>''leader_gap'')::bigint ELSE 0 END ASC,
    (u.value->>''mode_violation'')::bigint ASC,';
  IF position(old_best_order IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected best order definition; no changes applied';
  END IF;
  definition := replace(definition, old_best_order, new_best_order);

  EXECUTE definition;
END $migration$;
NOTIFY pgrst, 'reload schema';
COMMIT;
