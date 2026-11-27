-- Disposable PostgreSQL only. Run before the strategy migration.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.festival_calendar(id uuid PRIMARY KEY,tenant_id uuid);
CREATE TABLE public.festival_leaderboard_settings(festival_id uuid,ranking_mode text,item_limit integer);
CREATE TABLE public.points_config(festival_id uuid,enable_grace_marks boolean,config_version integer);
CREATE TABLE public.items(id uuid PRIMARY KEY,tenant_id uuid,festival_id uuid,item_name_en text,item_name_ml text,item_code text,category_codes text[]);
CREATE TABLE public.organisations(id uuid PRIMARY KEY,tenant_id uuid,parent_id uuid,name text,org_type text);
CREATE TABLE public.festival_teams(festival_id uuid,organisation_id uuid);
CREATE TABLE public.participants(id uuid PRIMARY KEY,organisation_id uuid);
CREATE TABLE public.registrations(id uuid PRIMARY KEY,item_id uuid,participant_id uuid,organisation_id uuid,status text);
CREATE TABLE public.results(id uuid PRIMARY KEY,item_id uuid,registration_id uuid,festival_id uuid,points_awarded integer,rank integer,grade text,published boolean,result_status text,public_visible boolean,published_at timestamptz);
CREATE TABLE public.result_team_awards(result_id uuid,organisation_id uuid);
CREATE TABLE public.grace_marks(org_id uuid,festival_id uuid,tenant_id uuid,submission_id uuid,points integer);
CREATE TABLE public.smart_announcer_queue(tenant_id uuid,festival_id uuid,item_id uuid,announced_at timestamptz);
CREATE FUNCTION public.smart_announcer_assert_admin(uuid,uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF $1<>md5('tenant')::uuid THEN RAISE EXCEPTION 'Forbidden'; END IF; END $$;
CREATE FUNCTION public.smart_announcer_save_queue(uuid,uuid,uuid[]) RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
CREATE FUNCTION public.smart_announcer_replace_team_queue(p_tenant_id uuid,p_festival_id uuid,p_team_id uuid,p_item_ids uuid[]) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM public.smart_announcer_save_queue(p_tenant_id,p_festival_id,p_item_ids); END $$;
CREATE OR REPLACE FUNCTION public.smart_announcer_project_leaderboard(v_festival_tenant_id uuid, v_festival_id uuid, p_item_id uuid)
 RETURNS TABLE(organisation_id uuid, organisation_name text, organisation_type text, parent_id uuid, total_points bigint, first_place_count bigint, second_place_count bigint, third_place_count bigint, grade_a_plus_count bigint, grade_a_count bigint, grade_b_count bigint, grade_c_count bigint, result_count bigint, latest_published_at timestamp with time zone, grace_marks_awarded bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$
;
