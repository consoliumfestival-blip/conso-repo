-- Target leaderboard rules as verified against get_public_leaderboard_unmasked.
-- Keep the live public leaderboard untouched. The projection substitutes only
-- the values the existing item-wide Publish action would write for one item.
CREATE FUNCTION public.smart_announcer_project_leaderboard(v_festival_tenant_id uuid, v_festival_id uuid, p_item_id uuid)
RETURNS TABLE(organisation_id uuid, organisation_name text, organisation_type text, parent_id uuid, total_points bigint, first_place_count bigint, second_place_count bigint, third_place_count bigint, grade_a_plus_count bigint, grade_a_count bigint, grade_b_count bigint, grade_c_count bigint, result_count bigint, latest_published_at timestamp with time zone, grace_marks_awarded bigint)
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public AS $function$
DECLARE
  v_enable_grace_marks boolean;
  v_ranking_mode text;
  v_item_limit integer;
BEGIN
  SELECT ranking_mode, item_limit INTO v_ranking_mode, v_item_limit
  FROM festival_leaderboard_settings WHERE festival_id = v_festival_id LIMIT 1;
  SELECT enable_grace_marks INTO v_enable_grace_marks
  FROM points_config WHERE festival_id = v_festival_id ORDER BY config_version DESC LIMIT 1;

  RETURN QUERY
  WITH projected_results AS MATERIALIZED (
    SELECT r.id, r.item_id, r.registration_id, r.festival_id, r.points_awarded, r.rank, r.grade,
      r.published, r.result_status,
      CASE WHEN r.item_id = p_item_id AND r.published IS TRUE AND r.result_status = 'published'
        THEN statement_timestamp() ELSE r.published_at END AS published_at,
      (COALESCE(r.public_visible, false)
        OR COALESCE(r.item_id = p_item_id AND r.published IS TRUE AND r.result_status = 'published', false)) AS public_visible
    FROM results r WHERE r.festival_id = v_festival_id
  ), limited_items AS (
    SELECT item_id
    FROM projected_results
    WHERE festival_id = v_festival_id
      AND published IS TRUE
      AND COALESCE(result_status, 'draft') IN ('published', 'ready')
      AND COALESCE(public_visible, false) IS TRUE
    GROUP BY item_id
    ORDER BY MIN(published_at) ASC, item_id ASC
    LIMIT (CASE WHEN COALESCE(v_ranking_mode, 'ALL') = 'LIMITED' AND v_item_limit IS NOT NULL AND v_item_limit > 0 THEN v_item_limit ELSE 999999 END)
  ),
  deduped_results AS (
    SELECT DISTINCT ON (COALESCE(res.registration_id, res.id), res.item_id)
      res.id           AS result_id,
      res.points_awarded,
      res.rank,
      res.grade,
      res.published_at,
      res.registration_id,
      res.festival_id
    FROM projected_results res
    LEFT JOIN registrations reg ON reg.id = res.registration_id
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND COALESCE(res.result_status, 'draft') IN ('published', 'ready')
      AND COALESCE(res.public_visible, false) IS TRUE
      AND reg.status IS DISTINCT FROM 'rejected'
      AND res.item_id IN (SELECT item_id FROM limited_items)
    ORDER BY COALESCE(res.registration_id, res.id), res.item_id,
             res.published_at DESC NULLS LAST, res.id DESC
  )
  SELECT
    org.id                                                        AS organisation_id,
    COALESCE(org.name, 'Unassigned')                              AS organisation_name,
    org.org_type                                                  AS organisation_type,
    org.parent_id                                                 AS parent_id,
    COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0)::bigint +
      (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS total_points,
    COUNT(*) FILTER (WHERE res.rank = 1)::bigint                 AS first_place_count,
    COUNT(*) FILTER (WHERE res.rank = 2)::bigint                 AS second_place_count,
    COUNT(*) FILTER (WHERE res.rank = 3)::bigint                 AS third_place_count,
    COUNT(*) FILTER (WHERE res.grade = 'A+')::bigint             AS grade_a_plus_count,
    COUNT(*) FILTER (WHERE res.grade = 'A')::bigint              AS grade_a_count,
    COUNT(*) FILTER (WHERE res.grade = 'B')::bigint              AS grade_b_count,
    COUNT(*) FILTER (WHERE res.grade = 'C')::bigint              AS grade_c_count,
    COUNT(*)::bigint                                              AS result_count,
    MAX(res.published_at)                                         AS latest_published_at,
    (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS grace_marks_awarded
  FROM deduped_results res LEFT JOIN public.result_team_awards award ON award.result_id=res.result_id
  JOIN festival_calendar festival ON festival.id = res.festival_id
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(award.organisation_id, reg.organisation_id, participant.organisation_id)
  WHERE org.id IS NOT NULL
    AND (
      org.tenant_id = v_festival_tenant_id
      OR org.parent_id IN (
        SELECT owned_org.id FROM organisations owned_org WHERE owned_org.tenant_id = v_festival_tenant_id
      )
      OR org.tenant_id IN (
        SELECT DISTINCT o2.tenant_id
        FROM organisations o2
        WHERE o2.id = org.parent_id AND o2.tenant_id = v_festival_tenant_id
      )
    )
  GROUP BY org.id
  HAVING COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0) > 0 OR COUNT(*) > 0
  UNION ALL
  SELECT go.id,go.name,go.org_type,go.parent_id,gm.points::bigint,
    0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,NULL::timestamptz,gm.points::bigint
  FROM public.grace_marks gm JOIN public.organisations go ON go.id=gm.org_id
  WHERE v_enable_grace_marks AND gm.festival_id=v_festival_id AND gm.tenant_id=v_festival_tenant_id AND gm.submission_id IS NOT NULL
    AND (go.tenant_id=v_festival_tenant_id OR go.parent_id IN(SELECT id FROM public.organisations WHERE tenant_id=v_festival_tenant_id)
      OR go.tenant_id IN(SELECT o2.tenant_id FROM public.organisations o2 WHERE o2.id=go.parent_id AND o2.tenant_id=v_festival_tenant_id))
    AND NOT EXISTS(SELECT 1 FROM deduped_results dr LEFT JOIN public.result_team_awards ga ON ga.result_id=dr.result_id LEFT JOIN public.registrations gr ON gr.id=dr.registration_id
      LEFT JOIN public.participants gp ON gp.id=gr.participant_id WHERE COALESCE(ga.organisation_id,gr.organisation_id,gp.organisation_id)=go.id)

  ORDER BY total_points DESC, first_place_count DESC, second_place_count DESC, third_place_count DESC, grade_a_count DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.smart_announcer_project_leaderboard(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.smart_announcer_recommendations(p_tenant_id uuid, p_festival_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
DECLARE
  v_data jsonb;
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  WITH candidates AS MATERIALIZED (
    SELECT i.id
    FROM public.items i
    WHERE i.tenant_id = p_tenant_id AND i.festival_id = p_festival_id
      AND EXISTS (
        SELECT 1 FROM public.results r
        WHERE r.festival_id = p_festival_id AND r.item_id = i.id AND r.published IS TRUE
          AND r.result_status = 'published' AND r.public_visible IS DISTINCT FROM true
      )
  ),
  item_rows AS (
    SELECT DISTINCT ON (COALESCE(r.registration_id, r.id), r.item_id)
      r.item_id, COALESCE(a.organisation_id, reg.organisation_id, p.organisation_id) AS team_id, r.points_awarded
    FROM public.results r JOIN candidates c ON c.id = r.item_id
    LEFT JOIN public.registrations reg ON reg.id = r.registration_id
    LEFT JOIN public.participants p ON p.id = reg.participant_id
    LEFT JOIN public.result_team_awards a ON a.result_id = r.id
    WHERE r.festival_id = p_festival_id AND r.published IS TRUE AND r.result_status = 'published'
      AND reg.status IS DISTINCT FROM 'rejected'
    ORDER BY COALESCE(r.registration_id, r.id), r.item_id, r.id DESC
  ),
  teams AS MATERIALIZED (
    SELECT o.id, o.name
    FROM public.organisations o
    WHERE (o.tenant_id = p_tenant_id
      OR o.parent_id IN (SELECT parent.id FROM public.organisations parent WHERE parent.tenant_id = p_tenant_id))
      AND (EXISTS (SELECT 1 FROM public.festival_teams ft WHERE ft.festival_id = p_festival_id AND ft.organisation_id = o.id)
        OR EXISTS (SELECT 1 FROM item_rows ir WHERE ir.team_id = o.id))
  ),
  item_points AS (
    SELECT item_id, team_id, SUM(COALESCE(points_awarded, 0)) AS points
    FROM item_rows JOIN teams ON teams.id = item_rows.team_id
    GROUP BY item_id, team_id
  ),
  projections AS (
    SELECT c.id, p.standings
    FROM candidates c
    CROSS JOIN LATERAL (
      SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.projected_rank, r.organisation_id), '[]'::jsonb) AS standings
      FROM (
        SELECT l.organisation_id, l.total_points,
          rank() OVER (ORDER BY l.total_points DESC, l.first_place_count DESC,
            l.second_place_count DESC, l.third_place_count DESC, l.grade_a_count DESC) AS projected_rank
        FROM public.smart_announcer_project_leaderboard(p_tenant_id, p_festival_id, c.id) l
      ) r
    ) p
  )
  SELECT jsonb_build_object(
    'teams', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.name, t.id) FROM teams t), '[]'::jsonb),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'standings', c.standings,
      'points', COALESCE((SELECT jsonb_object_agg(p.team_id, p.points) FROM item_points p WHERE p.item_id = c.id), '{}'::jsonb)
    ) ORDER BY c.id) FROM projections c), '[]'::jsonb)
  ) INTO v_data;
  RETURN v_data;
END;
$function$;
REVOKE ALL ON FUNCTION public.smart_announcer_recommendations(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smart_announcer_recommendations(uuid,uuid) TO authenticated;

-- Keep the established read endpoint available to existing authorised clients.
CREATE OR REPLACE FUNCTION public.get_admin_published_results(p_tenant_id uuid DEFAULT NULL::uuid, p_festival_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(result_id uuid, registration_id uuid, schedule_id uuid, item_id uuid, item_name text, item_name_ml text, is_group boolean, organisation_id uuid, organisation_name text, participant_id uuid, participant_name text, chest_number text, rank integer, grade text, points_awarded integer, total_score numeric, published boolean, result_status text, public_visible boolean, collection_method text, published_at timestamp with time zone, festival_id uuid, tenant_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_festival_id uuid;
  v_festival_tenant_id uuid;
  v_caller_is_admin boolean := false;
BEGIN
  SELECT (p_tenant_id IS NOT NULL OR p_festival_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RETURN;
  END IF;

  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT fc.id INTO v_festival_id
    FROM festival_calendar fc
    WHERE fc.is_active IS TRUE
      AND (p_tenant_id IS NULL OR fc.tenant_id = p_tenant_id)
    ORDER BY fc.festival_year DESC, fc.start_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  SELECT fc.tenant_id INTO v_festival_tenant_id
  FROM festival_calendar fc
  WHERE fc.id = v_festival_id;

  IF (p_tenant_id IS NOT NULL AND p_tenant_id IS DISTINCT FROM v_festival_tenant_id)
    OR v_festival_tenant_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.smart_announcer_assert_admin(v_festival_tenant_id, v_festival_id);

  RETURN QUERY
  SELECT
    res.id AS result_id,
    res.registration_id AS registration_id,
    sch.id AS schedule_id,
    res.item_id AS item_id,
    COALESCE(itm.item_name_en, '') AS item_name,
    COALESCE(itm.item_name_ml, '') AS item_name_ml,
    COALESCE(itm.participation_type = 'group', false) AS is_group,
    org.id AS organisation_id,
    COALESCE(org.name, 'Unassigned') AS organisation_name,
    participant.id AS participant_id,
    COALESCE(participant.name, '') AS participant_name,
    COALESCE(participant.chest_number, '') AS chest_number,
    res.rank AS rank,
    res.grade AS grade,
    COALESCE(res.points_awarded, 0) AS points_awarded,
    res.total_score AS total_score,
    COALESCE(res.published, false) AS published,
    COALESCE(res.result_status, 'draft') AS result_status,
    COALESCE(res.public_visible, false) AS public_visible,
    res.collection_method AS collection_method,
    res.published_at AS published_at,
    res.festival_id AS festival_id,
    res.tenant_id AS tenant_id
  FROM results res LEFT JOIN public.result_team_awards award ON award.result_id=res.id
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN LATERAL (
    SELECT schedules.id
    FROM schedules
    WHERE schedules.item_id = res.item_id
      AND schedules.tenant_id = COALESCE(res.tenant_id, v_festival_tenant_id)
    ORDER BY schedules.start_time DESC NULLS LAST, schedules.id DESC
    LIMIT 1
  ) sch ON TRUE
  LEFT JOIN items itm ON itm.id = res.item_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(award.organisation_id, reg.organisation_id, participant.organisation_id)
  WHERE res.festival_id = v_festival_id
    AND res.published IS TRUE
    AND COALESCE(res.result_status, 'draft') = 'published'
  ORDER BY
    res.published_at DESC NULLS LAST,
    COALESCE(itm.item_name_ml, itm.item_name_en, ''),
    res.rank NULLS LAST,
    res.id DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_admin_published_results(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_published_results(uuid, uuid) TO authenticated;
