-- Keep legacy public results behavior active in parallel by default
-- (limit_public_results = false). When an admin enables limit_public_results
-- alongside ranking_mode = 'LIMITED', all public result feeds, profiles,
-- public media/result posters, Team Leader results, and public AI views follow
-- the exact same first-N competition items included on the public leaderboard.

BEGIN;

ALTER TABLE public.festival_leaderboard_settings
  ADD COLUMN IF NOT EXISTS limit_public_results boolean NOT NULL DEFAULT false;

-- Speed up first-N published item selection used by both leaderboard and result limits.
CREATE INDEX IF NOT EXISTS idx_results_festival_public_item_published_at
  ON public.results (festival_id, item_id, published_at)
  WHERE published IS TRUE AND public_visible IS TRUE;

-- Return the exact set of item_ids currently included in the festival's capped
-- public leaderboard (matching get_public_leaderboard_unmasked / _category_trophy_standings).
CREATE OR REPLACE FUNCTION public.get_public_leaderboard_included_item_ids(
  p_festival_id uuid
)
RETURNS TABLE(item_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT r.item_id
  FROM public.results AS r
  WHERE p_festival_id IS NOT NULL
    AND r.festival_id = p_festival_id
    AND r.published IS TRUE
    AND COALESCE(r.result_status, 'draft') IN ('published', 'ready')
    AND COALESCE(r.public_visible, false) IS TRUE
    AND r.item_id IS NOT NULL
  GROUP BY r.item_id
  ORDER BY MIN(r.published_at) ASC, r.item_id ASC
  LIMIT COALESCE((
    SELECT CASE
      WHEN COALESCE(s.ranking_mode, 'ALL') = 'LIMITED'
        AND s.item_limit IS NOT NULL
        AND s.item_limit > 0
      THEN s.item_limit
      ELSE 2147483647
    END
    FROM public.festival_leaderboard_settings AS s
    WHERE s.festival_id = p_festival_id
    LIMIT 1
  ), 2147483647);
$$;

ALTER FUNCTION public.get_public_leaderboard_included_item_ids(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_leaderboard_included_item_ids(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard_included_item_ids(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.is_public_result_item_allowed(
  p_festival_id uuid,
  p_item_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_festival_id IS NULL THEN true
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.festival_leaderboard_settings AS s
      WHERE s.festival_id = p_festival_id
        AND COALESCE(s.limit_public_results, false) IS TRUE
        AND COALESCE(s.ranking_mode, 'ALL') = 'LIMITED'
        AND s.item_limit IS NOT NULL
        AND s.item_limit > 0
    ) THEN true
    WHEN p_item_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.get_public_leaderboard_included_item_ids(p_festival_id) AS allowed
      WHERE allowed.item_id = p_item_id
    )
  END;
$$;

ALTER FUNCTION public.is_public_result_item_allowed(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_public_result_item_allowed(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_public_result_item_allowed(uuid, uuid)
  TO service_role;

-- Expose ranking_mode, item_limit, and limit_public_results alongside existing fields.
DROP FUNCTION IF EXISTS public.get_public_leaderboard_settings(uuid, uuid);
CREATE FUNCTION public.get_public_leaderboard_settings(
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_festival_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  festival_id uuid,
  festival_level text,
  is_public_visible boolean,
  show_individual_rankings boolean,
  show_competition_points_grades boolean,
  team_point_status text,
  public_festival_name text,
  theme_config jsonb,
  ranking_mode text,
  item_limit integer,
  limit_public_results boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_festival_id uuid;
BEGIN
  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_festival_id
    FROM festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC, start_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    fc.id AS festival_id,
    fc.level AS festival_level,
    COALESCE(settings.is_public_visible, false) AS is_public_visible,
    COALESCE(settings.show_individual_rankings, true) AS show_individual_rankings,
    COALESCE(settings.show_competition_points_grades, true) AS show_competition_points_grades,
    settings.team_point_status AS team_point_status,
    COALESCE(
      NULLIF(trim(settings.public_festival_name), ''),
      NULLIF(trim(fc.custom_name), ''),
      'Festival'
    ) AS public_festival_name,
    settings.theme_config AS theme_config,
    COALESCE(settings.ranking_mode, 'ALL') AS ranking_mode,
    settings.item_limit AS item_limit,
    COALESCE(settings.limit_public_results, false) AS limit_public_results
  FROM festival_calendar fc
  LEFT JOIN festival_leaderboard_settings settings
    ON settings.festival_id = fc.id
  WHERE fc.id = v_festival_id
    AND (p_tenant_id IS NULL OR fc.tenant_id = p_tenant_id)
    AND COALESCE(settings.is_public_visible, false) IS TRUE;
END;
$$;

ALTER FUNCTION public.get_public_leaderboard_settings(uuid, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard_settings(uuid, uuid)
  TO anon, authenticated, service_role;

-- Update public published results RPC (also used by participant_results & Team Leader results)
-- while preserving 20261024063824 + 20261117024449 visibility & tenant module gates.
CREATE OR REPLACE FUNCTION public.get_public_published_results(
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_festival_id uuid DEFAULT NULL::uuid,
  p_include_participant_details boolean DEFAULT true
)
RETURNS TABLE(
  result_id uuid,
  registration_id uuid,
  item_id uuid,
  item_name text,
  item_name_ml text,
  is_group boolean,
  item_category_codes text[],
  organisation_id uuid,
  organisation_name text,
  organisation_type text,
  participant_id uuid,
  participant_name text,
  participant_profile_slug text,
  chest_number text,
  participant_category_code text,
  rank integer,
  grade text,
  points_awarded integer,
  published_at timestamp with time zone,
  festival_level text,
  public_result_no integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_festival_id uuid;
  v_festival_tenant_id uuid;
  v_festival_level text;
  v_is_public_visible boolean := false;
  v_caller_is_admin boolean := false;
  v_show_competition_points_grades boolean := true;
  v_limit_public_results boolean := false;
  v_ranking_mode text := 'ALL';
  v_item_limit integer := NULL;
  v_enforce_result_limit boolean := false;
BEGIN
  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_festival_id
    FROM festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC, start_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  SELECT tenant_id, level
  INTO v_festival_tenant_id, v_festival_level
  FROM festival_calendar
  WHERE id = v_festival_id;

  IF NOT public.tenant_module_section_enabled(v_festival_tenant_id, 'public_page', 'results') THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(is_public_visible, false),
    COALESCE(show_competition_points_grades, true),
    COALESCE(limit_public_results, false),
    COALESCE(ranking_mode, 'ALL'),
    item_limit
  INTO
    v_is_public_visible,
    v_show_competition_points_grades,
    v_limit_public_results,
    v_ranking_mode,
    v_item_limit
  FROM festival_leaderboard_settings
  WHERE festival_id = v_festival_id
  LIMIT 1;

  v_enforce_result_limit := (
    COALESCE(v_limit_public_results, false) IS TRUE
    AND COALESCE(v_ranking_mode, 'ALL') = 'LIMITED'
    AND v_item_limit IS NOT NULL
    AND v_item_limit > 0
  );

  SELECT (p_tenant_id IS NOT NULL OR p_festival_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  -- Admin can still bypass the GLOBAL visibility toggle to preview the page
  IF (v_is_public_visible IS NOT TRUE) AND (NOT v_caller_is_admin) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH limited_items AS (
    SELECT li.item_id
    FROM public.get_public_leaderboard_included_item_ids(v_festival_id) AS li
    WHERE v_enforce_result_limit IS TRUE
  ),
  published_results AS (
    SELECT DISTINCT ON (COALESCE(res.registration_id, res.id), res.item_id)
      res.id,
      res.registration_id,
      res.item_id,
      res.rank,
      res.grade,
      COALESCE(res.points_awarded, 0) AS points_awarded,
      res.published_at,
      res.festival_id,
      res.public_result_no
    FROM results res
    LEFT JOIN registrations reg ON reg.id = res.registration_id
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND COALESCE(res.result_status, 'draft') = 'published'
      AND COALESCE(res.public_visible, false) IS TRUE
      AND reg.status IS DISTINCT FROM 'rejected'
      AND (
        NOT v_enforce_result_limit
        OR (res.item_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM limited_items li WHERE li.item_id = res.item_id
        ))
      )
    ORDER BY COALESCE(res.registration_id, res.id), res.item_id,
             res.published_at DESC NULLS LAST, res.id DESC
  )
  SELECT
    res.id AS result_id,
    res.registration_id,
    res.item_id,
    COALESCE(itm.item_name_en, '') AS item_name,
    COALESCE(itm.item_name_ml, '') AS item_name_ml,
    COALESCE(itm.participation_type = 'group', false) AS is_group,
    COALESCE(itm.category_codes, ARRAY[]::text[]) AS item_category_codes,
    org.id AS organisation_id,
    COALESCE(org.name, 'Unassigned') AS organisation_name,
    org.org_type AS organisation_type,
    CASE WHEN p_include_participant_details THEN participant.id ELSE NULL END AS participant_id,
    CASE WHEN NOT p_include_participant_details THEN '' WHEN participant.id IS NOT NULL THEN COALESCE(participant.name, '') WHEN reg.entry_kind = 'general_team' THEN group_entry_private.display_name(reg) ELSE '' END AS participant_name,
    CASE WHEN p_include_participant_details AND COALESCE(participant.public_profile_enabled, true) THEN participant.profile_slug ELSE NULL END AS participant_profile_slug,
    CASE WHEN NOT p_include_participant_details THEN '' WHEN participant.id IS NOT NULL THEN COALESCE(participant.chest_number, '') WHEN reg.entry_kind = 'general_team' THEN COALESCE(group_entry_private.chest_number(reg), '') ELSE '' END AS chest_number,
    CASE WHEN p_include_participant_details AND participant.id IS NOT NULL THEN participant.category_code WHEN p_include_participant_details AND reg.entry_kind = 'general_team' THEN group_entry_private.category_code(reg) ELSE NULL END AS participant_category_code,
    res.rank,
    CASE WHEN v_show_competition_points_grades THEN res.grade ELSE NULL END,
    CASE WHEN v_show_competition_points_grades THEN res.points_awarded ELSE NULL END,
    res.published_at,
    v_festival_level AS festival_level,
    res.public_result_no
  FROM published_results res
  LEFT JOIN public.result_team_awards award ON award.result_id = res.id
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN items itm ON itm.id = res.item_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(award.organisation_id, reg.organisation_id, participant.organisation_id)
  WHERE org.id IS NOT NULL
    AND (participant.id IS NOT NULL OR (reg.entry_kind = 'general_team' AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.registration_id = reg.id)))
    AND (
      org.tenant_id = v_festival_tenant_id
      OR org.parent_id IN (
        SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
      )
      OR org.tenant_id IN (
        SELECT DISTINCT o2.tenant_id
        FROM organisations o2
        WHERE o2.parent_id IN (
          SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
        )
      )
    )
  ORDER BY res.published_at DESC NULLS LAST, res.item_id, res.rank NULLS LAST;
END;
$$;

ALTER FUNCTION public.get_public_published_results(uuid, uuid, boolean) OWNER TO postgres;

-- Gate Candidate Profile published_results while preserving 20261024063824 + 20261117024449 logic.
CREATE OR REPLACE FUNCTION public.get_public_candidate_profile(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_participant record;
  v_result jsonb;
BEGIN
  SELECT
    p.id,
    p.tenant_id,
    p.profile_slug,
    p.name,
    p.photo_url,
    p.category_code,
    p.profile_bio,
    p.public_profile_enabled,
    p.show_organisation_public,
    org.name AS organisation_name,
    org.org_type AS organisation_type
  INTO v_participant
  FROM participants p
  LEFT JOIN organisations org ON org.id = p.organisation_id
  WHERE p.profile_slug = p_slug
    AND COALESCE(p.public_profile_enabled, true) IS TRUE
  LIMIT 1;

  IF v_participant.id IS NULL
     OR NOT public.tenant_module_section_enabled(v_participant.tenant_id, 'public_page', 'results')
     OR NOT public.tenant_module_section_enabled(v_participant.tenant_id, 'public_page', 'participant_results') THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_participant.id,
      'slug', v_participant.profile_slug,
      'name', v_participant.name,
      'photo_url', v_participant.photo_url,
      'category_code', v_participant.category_code,
      'bio', COALESCE(v_participant.profile_bio, ''),
      'organisation_name', CASE WHEN COALESCE(v_participant.show_organisation_public, true) THEN v_participant.organisation_name ELSE NULL END,
      'organisation_type', CASE WHEN COALESCE(v_participant.show_organisation_public, true) THEN v_participant.organisation_type ELSE NULL END
    ),
    'participated_items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'registration_id', reg.id,
          'entry_kind', reg.entry_kind,
          'entry_chest_number', group_entry_private.chest_number(reg),
          'item_id', itm.id,
          'item_name', COALESCE(itm.item_name_en, ''),
          'item_name_ml', COALESCE(itm.item_name_ml, ''),
          'category_codes', COALESCE(itm.category_codes, ARRAY[]::text[]),
          'participation_type', COALESCE(itm.participation_type, 'individual'),
          'status', COALESCE(reg.status, 'registered')
        )
        ORDER BY COALESCE(itm.item_name_ml, itm.item_name_en, '')
      )
      FROM registrations reg
      LEFT JOIN items itm ON itm.id = reg.item_id
      WHERE (reg.participant_id = v_participant.id OR (
          reg.entry_kind='general_team' AND reg.participant_id IS NULL
          AND EXISTS(SELECT 1 FROM public.group_members gm
            JOIN public.participants member ON member.id=gm.participant_id
            WHERE gm.registration_id=reg.id AND gm.participant_id=v_participant.id
              AND member.festival_id=reg.festival_id)))
        AND reg.status IS DISTINCT FROM 'rejected'
    ), '[]'::jsonb),
    'published_results', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'result_id', res.id,
          'item_id', itm.id,
          'item_name', COALESCE(itm.item_name_en, ''),
          'item_name_ml', COALESCE(itm.item_name_ml, ''),
          'rank', res.rank,
          'grade', CASE WHEN COALESCE((SELECT s.show_competition_points_grades FROM public.festival_leaderboard_settings s WHERE s.festival_id=res.festival_id), true) THEN res.grade ELSE NULL END,
          'points_awarded', CASE WHEN COALESCE((SELECT s.show_competition_points_grades FROM public.festival_leaderboard_settings s WHERE s.festival_id=res.festival_id), true) THEN COALESCE(res.points_awarded, 0) ELSE NULL END,
          'published_at', res.published_at
        )
        ORDER BY res.rank NULLS LAST, res.published_at DESC NULLS LAST
      )
      FROM results res
      LEFT JOIN registrations reg ON reg.id = res.registration_id
      LEFT JOIN items itm ON itm.id = res.item_id
      WHERE (reg.participant_id = v_participant.id OR (reg.entry_kind = 'general_team' AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.registration_id = reg.id AND gm.participant_id = v_participant.id)))
        AND res.published IS TRUE
        AND COALESCE(res.result_status, 'draft') = 'published'
        AND COALESCE(res.public_visible, false) IS TRUE
        AND reg.status IS DISTINCT FROM 'rejected'
        AND public.is_public_result_item_allowed(res.festival_id, COALESCE(res.item_id, itm.id))
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_public_candidate_profile(text) OWNER TO postgres;

-- Gate Unit Profile results while preserving 20261024063824 + 20261117024449 logic.
CREATE OR REPLACE FUNCTION public.get_public_unit_profile(p_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org record;
  v_result jsonb;
BEGIN
  SELECT
    id, name, parent_id, tenant_id
  INTO v_org
  FROM organisations
  WHERE id = p_unit_id
  LIMIT 1;

  IF v_org.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.tenant_module_enabled(COALESCE(v_org.tenant_id, (SELECT parent_org.tenant_id FROM public.organisations parent_org WHERE parent_org.id = v_org.parent_id)), 'public_page')
     OR NOT public.tenant_module_enabled(COALESCE(v_org.tenant_id, (SELECT parent_org.tenant_id FROM public.organisations parent_org WHERE parent_org.id = v_org.parent_id)), 'public_leaderboard')
     OR NOT public.tenant_module_section_enabled(COALESCE(v_org.tenant_id, (SELECT parent_org.tenant_id FROM public.organisations parent_org WHERE parent_org.id = v_org.parent_id)), 'public_page', 'results') THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'parent_id', v_org.parent_id,
    'show_competition_points_grades', COALESCE((SELECT s.show_competition_points_grades FROM public.festival_leaderboard_settings s JOIN public.festival_calendar f ON f.id=s.festival_id WHERE f.is_active IS TRUE AND f.tenant_id IN (v_org.tenant_id, (SELECT parent_org.tenant_id FROM public.organisations parent_org WHERE parent_org.id=v_org.parent_id)) ORDER BY f.festival_year DESC, f.start_date DESC NULLS LAST LIMIT 1), true),
    'participants', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'chest_number', p.chest_number,
          'category_code', p.category_code,
          'profile_slug', p.profile_slug,
          'status', p.status,
          'photo_url', p.photo_url,
          'registrations', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', r.id,
                'status', r.status,
                'item_id', r.item_id,
                'item', jsonb_build_object(
                  'name', i.item_name_en,
                  'name_ml', i.item_name_ml
                ),
                'results', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'rank', res.rank,
                      'grade', CASE WHEN COALESCE((SELECT s.show_competition_points_grades FROM public.festival_leaderboard_settings s WHERE s.festival_id=res.festival_id), true) THEN res.grade ELSE NULL END,
                      'points_awarded', CASE WHEN COALESCE((SELECT s.show_competition_points_grades FROM public.festival_leaderboard_settings s WHERE s.festival_id=res.festival_id), true) THEN res.points_awarded ELSE NULL END
                    )
                  )
                  FROM results res
                  WHERE res.registration_id = r.id
                    AND res.published IS TRUE
                    AND COALESCE(res.result_status, 'published') = 'published'
                    AND COALESCE(res.public_visible, false) IS TRUE
                    AND public.is_public_result_item_allowed(res.festival_id, COALESCE(res.item_id, r.item_id))
                ), '[]'::jsonb)
              )
            )
            FROM registrations r
            LEFT JOIN items i ON i.id = r.item_id
            WHERE (r.participant_id = p.id OR (r.entry_kind = 'general_team' AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.registration_id = r.id AND gm.participant_id = p.id)))
          ), '[]'::jsonb)
        )
      )
      FROM participants p
      WHERE p.organisation_id = v_org.id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_public_unit_profile(uuid) OWNER TO postgres;

-- Enforce the same public result item limit on public generated_assets (Poster Studio public outputs)
-- without affecting Admin Poster Studio (Admins can manage generated_assets policy).
CREATE OR REPLACE FUNCTION public.is_public_published_poster_result(
  p_event_id uuid,
  p_result_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.results r
    WHERE (
      (p_event_id IS NOT NULL AND r.item_id = p_event_id)
      OR (p_result_id IS NOT NULL AND r.id = p_result_id)
    )
      AND r.published IS TRUE
      AND COALESCE(r.result_status, 'draft') = 'published'
      AND r.public_visible IS TRUE
      AND public.is_public_result_item_allowed(r.festival_id, COALESCE(r.item_id, p_event_id))
  );
$$;

ALTER FUNCTION public.is_public_published_poster_result(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_public_published_poster_result(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_published_poster_result(uuid, uuid) TO anon, authenticated;

-- Align public AI / readonly views with the same rules using view-level table
-- subqueries (so view execution uses the view owner's relation privileges
-- without exposing internal helper functions to anon callers).
CREATE OR REPLACE VIEW public.vw_public_results AS
SELECT
  res.id AS result_id,
  res.registration_id,
  res.item_id,
  COALESCE(item.item_name_en, '') AS item_name,
  COALESCE(item.item_name_ml, '') AS item_name_ml,
  COALESCE(item.participation_type = 'group', false) AS is_group,
  COALESCE(item.category_codes, ARRAY[]::text[]) AS item_category_codes,
  organisation.id AS organisation_id,
  COALESCE(organisation.name, 'Unassigned') AS organisation_name,
  organisation.org_type AS organisation_type,
  CASE WHEN COALESCE(participant.is_terminated, false) THEN NULL::uuid ELSE participant.id END AS participant_id,
  CASE
    WHEN registration.entry_kind = 'general_team' THEN group_entry_private.display_name(registration)
    WHEN COALESCE(participant.is_terminated, false) THEN '[Terminated]'
    ELSE COALESCE(participant.name, '')
  END AS participant_name,
  CASE
    WHEN registration.entry_kind = 'general_team' THEN COALESCE(group_entry_private.chest_number(registration), '')
    WHEN COALESCE(participant.is_terminated, false) THEN ''
    ELSE COALESCE(participant.chest_number, '')
  END AS chest_number,
  CASE WHEN registration.entry_kind = 'general_team' THEN group_entry_private.category_code(registration) ELSE participant.category_code END AS participant_category_code,
  res.rank,
  CASE WHEN COALESCE((SELECT settings.show_competition_points_grades FROM public.festival_leaderboard_settings settings WHERE settings.festival_id = res.festival_id), true) THEN res.grade ELSE NULL END AS grade,
  CASE WHEN COALESCE((SELECT settings.show_competition_points_grades FROM public.festival_leaderboard_settings settings WHERE settings.festival_id = res.festival_id), true) THEN res.points_awarded ELSE NULL END AS points_awarded,
  res.published_at,
  res.festival_id
FROM public.results AS res
LEFT JOIN public.result_team_awards AS award ON award.result_id = res.id
LEFT JOIN public.registrations AS registration ON registration.id = res.registration_id
LEFT JOIN public.items AS item ON item.id = res.item_id
LEFT JOIN public.participants AS participant ON participant.id = registration.participant_id
LEFT JOIN public.organisations AS organisation
  ON organisation.id = COALESCE(award.organisation_id, registration.organisation_id, participant.organisation_id)
WHERE res.published IS TRUE
  AND res.public_visible IS TRUE
  AND COALESCE(res.result_status, 'published') = 'published'
  AND (
    NOT EXISTS (
      SELECT 1
      FROM public.festival_leaderboard_settings AS settings
      WHERE settings.festival_id = res.festival_id
        AND COALESCE(settings.limit_public_results, false) IS TRUE
        AND COALESCE(settings.ranking_mode, 'ALL') = 'LIMITED'
        AND settings.item_limit IS NOT NULL
        AND settings.item_limit > 0
    )
    OR res.item_id IN (
      SELECT limited.item_id
      FROM public.results AS limited
      WHERE limited.festival_id = res.festival_id
        AND limited.published IS TRUE
        AND COALESCE(limited.result_status, 'draft') IN ('published', 'ready')
        AND COALESCE(limited.public_visible, false) IS TRUE
        AND limited.item_id IS NOT NULL
      GROUP BY limited.item_id
      ORDER BY MIN(limited.published_at) ASC, limited.item_id ASC
      LIMIT (
        SELECT settings.item_limit
        FROM public.festival_leaderboard_settings AS settings
        WHERE settings.festival_id = res.festival_id
        LIMIT 1
      )
    )
  );

ALTER VIEW public.vw_public_results OWNER TO postgres;

CREATE OR REPLACE VIEW public.vw_public_leaderboard AS
SELECT
  org.id AS organisation_id,
  COALESCE(org.name, 'Unassigned'::text) AS organisation_name,
  org.org_type AS organisation_type,
  org.parent_id,
  COALESCE(sum(COALESCE(res.points_awarded, 0)), (0)::bigint) AS total_points,
  count(*) FILTER (WHERE res.rank = 1) AS first_place_count,
  count(*) FILTER (WHERE res.rank = 2) AS second_place_count,
  count(*) FILTER (WHERE res.rank = 3) AS third_place_count,
  count(*) FILTER (WHERE res.grade = 'A+'::text) AS grade_a_plus_count,
  count(*) FILTER (WHERE res.grade = 'A'::text) AS grade_a_count,
  count(*) FILTER (WHERE res.grade = 'B'::text) AS grade_b_count,
  count(*) FILTER (WHERE res.grade = 'C'::text) AS grade_c_count,
  count(*) AS result_count,
  max(res.published_at) AS latest_published_at,
  res.festival_id
FROM public.results res
JOIN public.festival_calendar festival ON festival.id = res.festival_id
LEFT JOIN public.registrations reg ON reg.id = res.registration_id
LEFT JOIN public.participants participant ON participant.id = reg.participant_id
LEFT JOIN public.organisations org ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
WHERE res.published IS TRUE
  AND res.public_visible IS TRUE
  AND COALESCE(res.result_status, 'published'::text) = 'published'::text
  AND (
    NOT EXISTS (
      SELECT 1
      FROM public.festival_leaderboard_settings AS settings
      WHERE settings.festival_id = res.festival_id
        AND COALESCE(settings.ranking_mode, 'ALL') = 'LIMITED'
        AND settings.item_limit IS NOT NULL
        AND settings.item_limit > 0
    )
    OR res.item_id IN (
      SELECT limited.item_id
      FROM public.results AS limited
      WHERE limited.festival_id = res.festival_id
        AND limited.published IS TRUE
        AND COALESCE(limited.result_status, 'draft') IN ('published', 'ready')
        AND COALESCE(limited.public_visible, false) IS TRUE
        AND limited.item_id IS NOT NULL
      GROUP BY limited.item_id
      ORDER BY MIN(limited.published_at) ASC, limited.item_id ASC
      LIMIT (
        SELECT settings.item_limit
        FROM public.festival_leaderboard_settings AS settings
        WHERE settings.festival_id = res.festival_id
        LIMIT 1
      )
    )
  )
GROUP BY org.id, org.name, org.org_type, org.parent_id, res.festival_id;

ALTER VIEW public.vw_public_leaderboard OWNER TO postgres;

CREATE OR REPLACE VIEW public.vw_public_live_status AS
SELECT
  festival.id AS festival_id,
  festival.custom_name AS festival_name,
  count(DISTINCT res.id) FILTER (
    WHERE res.published IS TRUE
      AND res.public_visible IS TRUE
      AND COALESCE(res.result_status, 'published'::text) = 'published'::text
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.festival_leaderboard_settings AS settings
          WHERE settings.festival_id = res.festival_id
            AND COALESCE(settings.limit_public_results, false) IS TRUE
            AND COALESCE(settings.ranking_mode, 'ALL') = 'LIMITED'
            AND settings.item_limit IS NOT NULL
            AND settings.item_limit > 0
        )
        OR res.item_id IN (
          SELECT limited.item_id
          FROM public.results AS limited
          WHERE limited.festival_id = res.festival_id
            AND limited.published IS TRUE
            AND COALESCE(limited.result_status, 'draft') IN ('published', 'ready')
            AND COALESCE(limited.public_visible, false) IS TRUE
            AND limited.item_id IS NOT NULL
          GROUP BY limited.item_id
          ORDER BY MIN(limited.published_at) ASC, limited.item_id ASC
          LIMIT (
            SELECT settings.item_limit
            FROM public.festival_leaderboard_settings AS settings
            WHERE settings.festival_id = res.festival_id
            LIMIT 1
          )
        )
      )
  ) AS published_results_count,
  count(DISTINCT sch.id) FILTER (WHERE sch.status = 'live'::text) AS live_stages_count,
  count(DISTINCT sch.venue_id) FILTER (WHERE sch.status = 'live'::text) AS active_venues_count,
  count(DISTINCT itm.id) AS total_items_count
FROM public.festival_calendar festival
LEFT JOIN public.results res
  ON res.festival_id = festival.id
 AND res.published IS TRUE
 AND res.public_visible IS TRUE
LEFT JOIN public.schedules sch ON sch.festival_id = festival.id
LEFT JOIN public.items itm ON itm.id = sch.item_id
GROUP BY festival.id, festival.custom_name;

ALTER VIEW public.vw_public_live_status OWNER TO postgres;

CREATE OR REPLACE VIEW public.vw_public_participants AS
SELECT
  p.id AS participant_id,
  p.festival_id,
  p.name AS participant_name,
  p.chest_number,
  p.profile_slug,
  itm.item_code,
  itm.item_name_en AS item_name,
  itm.item_name_ml,
  CASE
    WHEN res.published IS TRUE
      AND res.public_visible IS TRUE
      AND COALESCE(res.result_status, 'published'::text) = 'published'::text
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.festival_leaderboard_settings AS settings
          WHERE settings.festival_id = res.festival_id
            AND COALESCE(settings.limit_public_results, false) IS TRUE
            AND COALESCE(settings.ranking_mode, 'ALL') = 'LIMITED'
            AND settings.item_limit IS NOT NULL
            AND settings.item_limit > 0
        )
        OR COALESCE(res.item_id, reg.item_id) IN (
          SELECT limited.item_id
          FROM public.results AS limited
          WHERE limited.festival_id = res.festival_id
            AND limited.published IS TRUE
            AND COALESCE(limited.result_status, 'draft') IN ('published', 'ready')
            AND COALESCE(limited.public_visible, false) IS TRUE
            AND limited.item_id IS NOT NULL
          GROUP BY limited.item_id
          ORDER BY MIN(limited.published_at) ASC, limited.item_id ASC
          LIMIT (
            SELECT settings.item_limit
            FROM public.festival_leaderboard_settings AS settings
            WHERE settings.festival_id = res.festival_id
            LIMIT 1
          )
        )
      )
    THEN res.rank
    ELSE NULL::integer
  END AS rank,
  CASE
    WHEN res.published IS TRUE
      AND res.public_visible IS TRUE
      AND COALESCE(res.result_status, 'published'::text) = 'published'::text
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.festival_leaderboard_settings AS settings
          WHERE settings.festival_id = res.festival_id
            AND COALESCE(settings.limit_public_results, false) IS TRUE
            AND COALESCE(settings.ranking_mode, 'ALL') = 'LIMITED'
            AND settings.item_limit IS NOT NULL
            AND settings.item_limit > 0
        )
        OR COALESCE(res.item_id, reg.item_id) IN (
          SELECT limited.item_id
          FROM public.results AS limited
          WHERE limited.festival_id = res.festival_id
            AND limited.published IS TRUE
            AND COALESCE(limited.result_status, 'draft') IN ('published', 'ready')
            AND COALESCE(limited.public_visible, false) IS TRUE
            AND limited.item_id IS NOT NULL
          GROUP BY limited.item_id
          ORDER BY MIN(limited.published_at) ASC, limited.item_id ASC
          LIMIT (
            SELECT settings.item_limit
            FROM public.festival_leaderboard_settings AS settings
            WHERE settings.festival_id = res.festival_id
            LIMIT 1
          )
        )
      )
    THEN res.grade
    ELSE NULL::text
  END AS grade,
  CASE
    WHEN res.published IS TRUE
      AND res.public_visible IS TRUE
      AND COALESCE(res.result_status, 'published'::text) = 'published'::text
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.festival_leaderboard_settings AS settings
          WHERE settings.festival_id = res.festival_id
            AND COALESCE(settings.limit_public_results, false) IS TRUE
            AND COALESCE(settings.ranking_mode, 'ALL') = 'LIMITED'
            AND settings.item_limit IS NOT NULL
            AND settings.item_limit > 0
        )
        OR COALESCE(res.item_id, reg.item_id) IN (
          SELECT limited.item_id
          FROM public.results AS limited
          WHERE limited.festival_id = res.festival_id
            AND limited.published IS TRUE
            AND COALESCE(limited.result_status, 'draft') IN ('published', 'ready')
            AND COALESCE(limited.public_visible, false) IS TRUE
            AND limited.item_id IS NOT NULL
          GROUP BY limited.item_id
          ORDER BY MIN(limited.published_at) ASC, limited.item_id ASC
          LIMIT (
            SELECT settings.item_limit
            FROM public.festival_leaderboard_settings AS settings
            WHERE settings.festival_id = res.festival_id
            LIMIT 1
          )
        )
      )
    THEN res.points_awarded
    ELSE 0
  END AS points_awarded
FROM public.participants p
LEFT JOIN public.registrations reg
  ON reg.participant_id = p.id
 AND reg.status IS DISTINCT FROM 'rejected'::text
LEFT JOIN public.items itm ON itm.id = reg.item_id
LEFT JOIN public.results res ON res.registration_id = reg.id
WHERE p.status = 'approved'::text
  AND COALESCE(p.is_terminated, false) = false;

ALTER VIEW public.vw_public_participants OWNER TO postgres;

NOTIFY pgrst, 'reload schema';

COMMIT;
