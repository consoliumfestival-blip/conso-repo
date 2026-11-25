-- Announcement simulation only; public standings and result records are not written.
BEGIN;
-- Extend the established points projection to an ordered list of simulated items.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.smart_announcer_project_leaderboard(uuid,uuid,uuid)'::regprocedure) INTO definition;
  IF position('r.item_id = p_item_id' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected announcer projection definition';
  END IF;
  definition := replace(definition,
    'smart_announcer_project_leaderboard(v_festival_tenant_id uuid, v_festival_id uuid, p_item_id uuid)',
    'smart_announcer_project_sequence(v_festival_tenant_id uuid, v_festival_id uuid, p_item_ids uuid[])');
  definition := replace(definition, 'r.item_id = p_item_id', 'r.item_id = ANY(p_item_ids)');
  definition := replace(definition, 'THEN statement_timestamp() ELSE r.published_at END',
    'AND NOT coalesce(r.public_visible, false) THEN statement_timestamp() + array_position(p_item_ids, r.item_id) * interval ''1 microsecond'' ELSE r.published_at END');
  EXECUTE definition;
END;
$migration$;
REVOKE ALL ON FUNCTION public.smart_announcer_project_sequence(uuid,uuid,uuid[]) FROM PUBLIC, anon, authenticated;

-- Preserve the candidate interface while replacing the first-place condition.
CREATE OR REPLACE FUNCTION public.smart_announcer_team_candidates(p_tenant_id uuid, p_festival_id uuid, p_team_id uuid)
RETURNS TABLE(id uuid, name text, item_code text, category_codes text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (coalesce(r.registration_id, r.id), r.item_id)
      r.id, r.item_id, r.registration_id, r.points_awarded, r.public_visible
    FROM public.results r
    LEFT JOIN public.registrations reg ON reg.id = r.registration_id
    WHERE r.festival_id = p_festival_id AND r.published IS TRUE
      AND r.result_status = 'published' AND reg.status IS DISTINCT FROM 'rejected'
    ORDER BY coalesce(r.registration_id, r.id), r.item_id, r.published_at DESC NULLS LAST, r.id DESC
  )
  SELECT i.id, coalesce(nullif(i.item_name_ml,''), nullif(i.item_name_en,''), i.item_code),
    i.item_code, coalesce(i.category_codes, ARRAY[]::text[])
  FROM latest r
  JOIN public.items i ON i.id=r.item_id AND i.festival_id=p_festival_id AND i.tenant_id=p_tenant_id
  LEFT JOIN public.result_team_awards a ON a.result_id=r.id
  LEFT JOIN public.registrations reg ON reg.id=r.registration_id
  LEFT JOIN public.participants p ON p.id=reg.participant_id
  JOIN public.organisations team ON team.id=coalesce(a.organisation_id,reg.organisation_id,p.organisation_id)
  WHERE team.id=p_team_id
    AND (team.tenant_id=p_tenant_id OR EXISTS(
      SELECT 1 FROM public.organisations parent WHERE parent.id=team.parent_id AND parent.tenant_id=p_tenant_id))
    AND NOT coalesce(r.public_visible,false)
    AND NOT EXISTS(SELECT 1 FROM public.smart_announcer_queue q
      WHERE q.tenant_id=p_tenant_id AND q.festival_id=p_festival_id AND q.item_id=i.id AND q.announced_at IS NOT NULL)
  GROUP BY i.id
  HAVING sum(coalesce(r.points_awarded,0)) > 0
  ORDER BY 2,1;
END;
$function$;

CREATE FUNCTION public.smart_announcer_team_strategy(
  p_tenant_id uuid, p_festival_id uuid, p_team_id uuid,
  p_item_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  baseline uuid[];
  chosen uuid[] := ARRAY[]::uuid[];
  remaining uuid[];
  candidate uuid;
  best uuid;
  snapshot jsonb;
  best_snapshot jsonb;
  metrics bigint[];
  best_metrics bigint[];
  team_rank bigint;
  team_points bigint;
  prior_points bigint;
  leader_points bigint;
  runner_points bigint;
  output jsonb := '[]'::jsonb;
  eligible_count integer;
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id,p_festival_id);
  IF NOT EXISTS(SELECT 1 FROM public.organisations o WHERE o.id=p_team_id
    AND (o.tenant_id=p_tenant_id OR EXISTS(SELECT 1 FROM public.organisations parent
      WHERE parent.id=o.parent_id AND parent.tenant_id=p_tenant_id))) THEN
    RAISE EXCEPTION 'Team is outside the festival tenant' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(array_agg(q.item_id ORDER BY q.announced_at,q.item_id),ARRAY[]::uuid[])
    INTO baseline FROM public.smart_announcer_queue q
    WHERE q.tenant_id=p_tenant_id AND q.festival_id=p_festival_id AND q.announced_at IS NOT NULL;
  SELECT coalesce(array_agg(c.id ORDER BY c.id),ARRAY[]::uuid[]) INTO remaining
    FROM public.smart_announcer_team_candidates(p_tenant_id,p_festival_id,p_team_id) c;
  eligible_count := cardinality(remaining);
  IF p_item_ids IS NOT NULL THEN
    IF cardinality(p_item_ids)>5 OR cardinality(p_item_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_item_ids) id)
      OR EXISTS(SELECT 1 FROM unnest(p_item_ids) id WHERE id IS NULL OR NOT(id=ANY(remaining))) THEN
      RAISE EXCEPTION 'Selection changed; refresh team results' USING ERRCODE='22023';
    END IF;
    remaining := p_item_ids;
  END IF;
  FOR step IN 1..least(5,cardinality(remaining)) LOOP
    best := NULL; best_metrics := NULL;
    SELECT coalesce(max(l.total_points),0) INTO prior_points
      FROM public.smart_announcer_project_sequence(p_tenant_id,p_festival_id,baseline||chosen) l
      WHERE l.organisation_id=p_team_id;
    FOREACH candidate IN ARRAY remaining LOOP
      WITH standings AS (
        SELECT l.*, rank() OVER(ORDER BY l.total_points DESC,l.first_place_count DESC,
          l.second_place_count DESC,l.third_place_count DESC,l.grade_a_count DESC) AS projected_rank
        FROM public.smart_announcer_project_sequence(p_tenant_id,p_festival_id,baseline||chosen||candidate) l
      )
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.projected_rank,s.organisation_id),
        max(s.projected_rank) FILTER(WHERE s.organisation_id=p_team_id),
        max(s.total_points) FILTER(WHERE s.organisation_id=p_team_id)
      INTO snapshot,team_rank,team_points FROM standings s;
      IF coalesce(team_points,0) <= prior_points THEN CONTINUE; END IF;
      SELECT (x->>'total_points')::bigint INTO leader_points FROM jsonb_array_elements(snapshot) x LIMIT 1;
      runner_points := (snapshot->1->>'total_points')::bigint;
      metrics := ARRAY[CASE WHEN team_rank=1 THEN 0 ELSE 1 END,
        coalesce(team_rank,9223372036854775807),
        CASE WHEN team_rank=1 THEN coalesce(leader_points-runner_points,0) ELSE leader_points-team_points END,
        -(team_points-prior_points)];
      IF p_item_ids IS NOT NULL THEN
        IF candidate <> remaining[1] THEN CONTINUE; END IF;
      END IF;
      IF best IS NULL OR metrics < best_metrics OR (metrics=best_metrics AND candidate<best) THEN
        best:=candidate; best_metrics:=metrics;
        best_snapshot:=jsonb_build_object('item_id',candidate,'team_rank',team_rank,
          'team_points',team_points,'leader_gap',coalesce(leader_points-runner_points,0),'standings',snapshot);
      END IF;
    END LOOP;
    IF best IS NULL THEN
      IF p_item_ids IS NOT NULL THEN RAISE EXCEPTION 'Selection no longer adds points; refresh team results' USING ERRCODE='22023'; END IF;
      EXIT;
    END IF;
    chosen:=array_append(chosen,best);
    remaining:=array_remove(remaining,best);
    output:=output||jsonb_build_array(best_snapshot);
  END LOOP;
  RETURN jsonb_build_object('items',output,'candidate_count',eligible_count);
END;
$function$;
REVOKE ALL ON FUNCTION public.smart_announcer_team_strategy(uuid,uuid,uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.smart_announcer_team_strategy(uuid,uuid,uuid,uuid[]) TO authenticated;
-- Keep existing write locks and eligibility validation, then validate the ordered simulation.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.smart_announcer_replace_team_queue(uuid,uuid,uuid,uuid[])'::regprocedure) INTO definition;
  IF position('PERFORM public.smart_announcer_save_queue' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected queue save function'; END IF;
  EXECUTE replace(definition,'PERFORM public.smart_announcer_save_queue',
    'PERFORM public.smart_announcer_team_strategy(p_tenant_id,p_festival_id,p_team_id,p_item_ids); PERFORM public.smart_announcer_save_queue');
END;
$migration$;
COMMIT;
