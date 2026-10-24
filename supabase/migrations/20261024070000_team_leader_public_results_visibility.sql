-- Keep Team Leader scoring data aligned with the exact public results feed.
-- Schedule rows remain independent and continue to use schedules.status.
CREATE OR REPLACE FUNCTION public.get_team_leader_published_results()
 RETURNS TABLE(
   result_id uuid,
   item_code text,
   item_name text,
   participant_name text,
   rank integer,
   grade text,
   points_awarded integer,
   published_at timestamp with time zone
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT DISTINCT
    public_result.result_id,
    item.item_code,
    COALESCE(item.item_name_en, item.item_name_ml),
    public_result.participant_name,
    public_result.rank,
    public_result.grade,
    public_result.points_awarded,
    public_result.published_at
  FROM public.get_team_leader_context() AS context
  JOIN public.organisations AS organisation
    ON organisation.id = context.organisation_id
   AND organisation.tenant_id IS NOT NULL
  JOIN public.get_visible_organisations(context.parent_tenant_id) AS visible
    ON visible.id = organisation.id
   AND visible.tenant_id = organisation.tenant_id
  JOIN public.get_public_published_results(
    context.parent_tenant_id,
    context.festival_id,
    true
  ) AS public_result
    ON public_result.organisation_id = context.organisation_id
  JOIN public.items AS item
    ON item.id = public_result.item_id
   AND (item.tenant_id IS NULL OR item.tenant_id = context.parent_tenant_id)
  ORDER BY public_result.published_at DESC NULLS LAST, public_result.rank NULLS LAST;
$function$;

ALTER FUNCTION public.get_team_leader_published_results() OWNER TO postgres;

-- get_public_leaderboard() already applies the festival visibility toggle.
-- Do not turn its hidden/empty response into zero-point rows for Team Leaders.
CREATE OR REPLACE FUNCTION public.get_team_leader_standings()
 RETURNS TABLE(
   rank bigint,
   organisation_id uuid,
   team_name text,
   total_points bigint,
   is_own_team boolean
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH context AS (
    SELECT * FROM public.get_team_leader_context()
  ),
  publicly_visible AS (
    SELECT context.*
    FROM context
    WHERE EXISTS (
      SELECT 1
      FROM public.festival_leaderboard_settings AS settings
      WHERE settings.festival_id = context.festival_id
        AND settings.is_public_visible IS TRUE
    )
  ),
  official AS (
    SELECT leaderboard.*
    FROM publicly_visible AS context
    CROSS JOIN LATERAL public.get_public_leaderboard(
      context.parent_tenant_id,
      context.festival_id
    ) AS leaderboard
  ),
  teams AS (
    SELECT festival_team.organisation_id, organisation.name
    FROM publicly_visible AS context
    JOIN public.festival_teams AS festival_team
      ON festival_team.festival_id = context.festival_id
     AND festival_team.parent_tenant_id = context.parent_tenant_id
     AND festival_team.is_active IS TRUE
    JOIN public.organisations AS organisation
      ON organisation.id = festival_team.organisation_id
     AND organisation.tenant_id IS NOT NULL
    JOIN public.get_visible_organisations(context.parent_tenant_id) AS visible
      ON visible.id = organisation.id
     AND visible.tenant_id = organisation.tenant_id
  )
  SELECT
    DENSE_RANK() OVER (
      ORDER BY COALESCE(official.total_points, 0) DESC,
        COALESCE(official.first_place_count, 0) DESC,
        COALESCE(official.second_place_count, 0) DESC,
        teams.name ASC
    ),
    teams.organisation_id,
    teams.name,
    COALESCE(official.total_points, 0)::bigint,
    teams.organisation_id = (SELECT organisation_id FROM publicly_visible)
  FROM teams
  LEFT JOIN official ON official.organisation_id = teams.organisation_id
  ORDER BY 1, teams.name;
$function$;

ALTER FUNCTION public.get_team_leader_standings() OWNER TO postgres;
