-- Optimize public candidate profile, public results pagination, and public AI views
-- introduced/updated in 20261128152000_public_result_publish_limit_control.sql without
-- altering any public/admin feature behavior or relaxing existing gates.

BEGIN;

-- 1. Covering partial indexes so first-N item resolution, deterministic 500-row
--    public result pagination, and candidate registration lookups stay fast under anon timeout.
CREATE INDEX IF NOT EXISTS idx_results_festival_public_status_item_published_at
  ON public.results (festival_id, item_id, published_at, id)
  WHERE published IS TRUE
    AND public_visible IS TRUE
    AND result_status IN ('published', 'ready')
    AND item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_results_festival_published_order
  ON public.results (festival_id, published_at DESC NULLS LAST, item_id, rank NULLS LAST, id DESC)
  WHERE published IS TRUE
    AND public_visible IS TRUE
    AND result_status = 'published';

CREATE INDEX IF NOT EXISTS idx_results_registration_id
  ON public.results (registration_id)
  WHERE registration_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_participant_id
  ON public.registrations (participant_id)
  WHERE participant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_group_members_participant_reg
  ON public.group_members (participant_id, registration_id);

-- 2. Resolve festival item limit into a scalar once in PL/pgSQL so PostgreSQL uses a
--    simple constant LIMIT plan instead of evaluating a nested scalar subquery.
CREATE OR REPLACE FUNCTION public.get_public_leaderboard_included_item_ids(
  p_festival_id uuid
)
RETURNS TABLE(item_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ranking_mode text := 'ALL';
  v_item_limit integer := NULL;
BEGIN
  IF p_festival_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(s.ranking_mode, 'ALL'),
    s.item_limit
  INTO
    v_ranking_mode,
    v_item_limit
  FROM public.festival_leaderboard_settings AS s
  WHERE s.festival_id = p_festival_id
  LIMIT 1;

  IF COALESCE(v_ranking_mode, 'ALL') = 'LIMITED'
     AND v_item_limit IS NOT NULL
     AND v_item_limit > 0 THEN
    RETURN QUERY
    SELECT r.item_id
    FROM public.results AS r
    WHERE r.festival_id = p_festival_id
      AND r.published IS TRUE
      AND COALESCE(r.result_status, 'draft') IN ('published', 'ready')
      AND COALESCE(r.public_visible, false) IS TRUE
      AND r.item_id IS NOT NULL
    GROUP BY r.item_id
    ORDER BY MIN(r.published_at) ASC, r.item_id ASC
    LIMIT v_item_limit;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT r.item_id
  FROM public.results AS r
  WHERE r.festival_id = p_festival_id
    AND r.published IS TRUE
    AND COALESCE(r.result_status, 'draft') IN ('published', 'ready')
    AND COALESCE(r.public_visible, false) IS TRUE
    AND r.item_id IS NOT NULL
  ORDER BY r.item_id ASC;
END;
$$;

ALTER FUNCTION public.get_public_leaderboard_included_item_ids(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_leaderboard_included_item_ids(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard_included_item_ids(uuid)
  TO service_role;

-- 3. Materialize allowed item_ids once per call and add res.id DESC as final tie-breaker
--    so 500-by-500 offset pagination across 5,000+ rows stays deterministic and well under timeout.
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
  v_limited_item_ids uuid[] := NULL;
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

  SELECT (p_tenant_id IS NOT NULL OR p_festival_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF (v_is_public_visible IS NOT TRUE) AND (NOT v_caller_is_admin) THEN
    RETURN;
  END IF;

  v_enforce_result_limit := (
    COALESCE(v_limit_public_results, false) IS TRUE
    AND COALESCE(v_ranking_mode, 'ALL') = 'LIMITED'
    AND v_item_limit IS NOT NULL
    AND v_item_limit > 0
  );

  IF v_enforce_result_limit THEN
    SELECT COALESCE(array_agg(li.item_id), ARRAY[]::uuid[])
    INTO v_limited_item_ids
    FROM public.get_public_leaderboard_included_item_ids(v_festival_id) AS li;
  END IF;

  RETURN QUERY
  WITH scoped_orgs AS MATERIALIZED (
    SELECT o.id
    FROM organisations o
    WHERE o.tenant_id = v_festival_tenant_id
       OR o.parent_id IN (SELECT p_org.id FROM organisations p_org WHERE p_org.tenant_id = v_festival_tenant_id)
       OR o.tenant_id IN (
         SELECT DISTINCT o2.tenant_id
         FROM organisations o2
         WHERE o2.parent_id IN (SELECT p_org2.id FROM organisations p_org2 WHERE p_org2.tenant_id = v_festival_tenant_id)
       )
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
        OR (res.item_id IS NOT NULL AND res.item_id = ANY(v_limited_item_ids))
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
    AND org.id IN (SELECT so.id FROM scoped_orgs so)
  ORDER BY res.published_at DESC NULLS LAST, res.item_id, res.rank NULLS LAST, res.id DESC;
END;
$$;

ALTER FUNCTION public.get_public_published_results(uuid, uuid, boolean) OWNER TO postgres;

-- 4. Rewrite get_public_candidate_profile so it looks up ONLY the target candidate's
--    indexed registrations first, fetches their few results first, and checks
--    get_public_leaderboard_included_item_ids at most once per distinct festival.
CREATE OR REPLACE FUNCTION public.get_public_candidate_profile(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_participant record;
  v_participated_items jsonb;
  v_published_results jsonb;
BEGIN
  SELECT
    p.id,
    p.tenant_id,
    p.festival_id,
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
  FROM public.participants p
  LEFT JOIN public.organisations org ON org.id = p.organisation_id
  WHERE p.profile_slug = p_slug
    AND COALESCE(p.public_profile_enabled, true) IS TRUE
  LIMIT 1;

  IF v_participant.id IS NULL
     OR NOT public.tenant_module_section_enabled(v_participant.tenant_id, 'public_page', 'results')
     OR NOT public.tenant_module_section_enabled(v_participant.tenant_id, 'public_page', 'participant_results') THEN
    RETURN NULL;
  END IF;

  WITH participated_regs AS (
    SELECT reg.id, reg.entry_kind, reg.item_id, reg.status, reg.festival_id, reg.organisation_id, reg.participant_id
    FROM public.registrations reg
    WHERE reg.participant_id = v_participant.id
      AND reg.status IS DISTINCT FROM 'rejected'
    UNION
    SELECT reg.id, reg.entry_kind, reg.item_id, reg.status, reg.festival_id, reg.organisation_id, reg.participant_id
    FROM public.group_members gm
    JOIN public.registrations reg ON reg.id = gm.registration_id
    WHERE gm.participant_id = v_participant.id
      AND reg.entry_kind = 'general_team'
      AND reg.participant_id IS NULL
      AND reg.status IS DISTINCT FROM 'rejected'
      AND (v_participant.festival_id IS NULL OR reg.festival_id = v_participant.festival_id)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'registration_id', reg.id,
        'entry_kind', reg.entry_kind,
        'entry_chest_number', group_entry_private.chest_number(full_reg),
        'item_id', itm.id,
        'item_name', COALESCE(itm.item_name_en, ''),
        'item_name_ml', COALESCE(itm.item_name_ml, ''),
        'category_codes', COALESCE(itm.category_codes, ARRAY[]::text[]),
        'participation_type', COALESCE(itm.participation_type, 'individual'),
        'status', COALESCE(reg.status, 'registered')
      )
      ORDER BY COALESCE(itm.item_name_ml, itm.item_name_en, '')
    ),
    '[]'::jsonb
  )
  INTO v_participated_items
  FROM participated_regs reg
  JOIN public.registrations full_reg ON full_reg.id = reg.id
  LEFT JOIN public.items itm ON itm.id = reg.item_id;

  WITH cand_result_regs AS MATERIALIZED (
    SELECT reg.id AS registration_id, reg.item_id AS reg_item_id
    FROM public.registrations reg
    WHERE reg.participant_id = v_participant.id
      AND reg.status IS DISTINCT FROM 'rejected'
    UNION
    SELECT reg.id AS registration_id, reg.item_id AS reg_item_id
    FROM public.group_members gm
    JOIN public.registrations reg ON reg.id = gm.registration_id
    WHERE gm.participant_id = v_participant.id
      AND reg.entry_kind = 'general_team'
      AND reg.status IS DISTINCT FROM 'rejected'
  ),
  raw_results AS MATERIALIZED (
    SELECT
      res.id AS result_id,
      res.festival_id,
      res.item_id AS res_item_id,
      itm.id AS itm_id,
      COALESCE(res.item_id, itm.id) AS eff_item_id,
      COALESCE(itm.item_name_en, '') AS item_name,
      COALESCE(itm.item_name_ml, '') AS item_name_ml,
      res.rank,
      res.grade,
      COALESCE(res.points_awarded, 0) AS points_awarded,
      res.published_at
    FROM cand_result_regs cr
    JOIN public.results res ON res.registration_id = cr.registration_id
    LEFT JOIN public.items itm ON itm.id = res.item_id
    WHERE res.published IS TRUE
      AND COALESCE(res.result_status, 'draft') = 'published'
      AND COALESCE(res.public_visible, false) IS TRUE
  ),
  festival_flags AS MATERIALIZED (
    SELECT
      f.festival_id,
      COALESCE(s.show_competition_points_grades, true) AS show_competition_points_grades,
      (
        COALESCE(s.limit_public_results, false) IS TRUE
        AND COALESCE(s.ranking_mode, 'ALL') = 'LIMITED'
        AND s.item_limit IS NOT NULL
        AND s.item_limit > 0
      ) AS enforce_limit
    FROM (SELECT DISTINCT r.festival_id FROM raw_results r WHERE r.festival_id IS NOT NULL) f
    LEFT JOIN public.festival_leaderboard_settings s ON s.festival_id = f.festival_id
  ),
  limited_items_by_festival AS MATERIALIZED (
    SELECT ff.festival_id, li.item_id
    FROM festival_flags ff
    CROSS JOIN LATERAL public.get_public_leaderboard_included_item_ids(ff.festival_id) AS li
    WHERE ff.enforce_limit IS TRUE
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'result_id', r.result_id,
        'item_id', r.itm_id,
        'item_name', r.item_name,
        'item_name_ml', r.item_name_ml,
        'rank', r.rank,
        'grade', CASE WHEN COALESCE(ff.show_competition_points_grades, true) THEN r.grade ELSE NULL END,
        'points_awarded', CASE WHEN COALESCE(ff.show_competition_points_grades, true) THEN r.points_awarded ELSE NULL END,
        'published_at', r.published_at
      )
      ORDER BY r.rank NULLS LAST, r.published_at DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_published_results
  FROM raw_results r
  LEFT JOIN festival_flags ff ON ff.festival_id = r.festival_id
  WHERE NOT COALESCE(ff.enforce_limit, false)
     OR (
       r.eff_item_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM limited_items_by_festival lfi
         WHERE lfi.festival_id = r.festival_id
           AND lfi.item_id = r.eff_item_id
       )
     );

  RETURN jsonb_build_object(
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
    'participated_items', COALESCE(v_participated_items, '[]'::jsonb),
    'published_results', COALESCE(v_published_results, '[]'::jsonb)
  );
END;
$$;

ALTER FUNCTION public.get_public_candidate_profile(text) OWNER TO postgres;

-- 5. Optimize get_public_unit_profile by precomputing festival limits once per call instead of
--    invoking is_public_result_item_allowed for every registration/result row in a unit.
CREATE OR REPLACE FUNCTION public.get_public_unit_profile(p_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org record;
  v_owner_tenant_id uuid;
  v_show_points boolean := true;
  v_result jsonb;
BEGIN
  SELECT id, name, parent_id, tenant_id
  INTO v_org
  FROM organisations
  WHERE id = p_unit_id
  LIMIT 1;

  IF v_org.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_owner_tenant_id := COALESCE(
    v_org.tenant_id,
    (SELECT parent_org.tenant_id FROM public.organisations parent_org WHERE parent_org.id = v_org.parent_id)
  );

  IF NOT public.tenant_module_enabled(v_owner_tenant_id, 'public_page')
     OR NOT public.tenant_module_enabled(v_owner_tenant_id, 'public_leaderboard')
     OR NOT public.tenant_module_section_enabled(v_owner_tenant_id, 'public_page', 'results') THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(s.show_competition_points_grades, true)
  INTO v_show_points
  FROM public.festival_leaderboard_settings s
  JOIN public.festival_calendar f ON f.id = s.festival_id
  WHERE f.is_active IS TRUE
    AND f.tenant_id = v_owner_tenant_id
  ORDER BY f.festival_year DESC, f.start_date DESC NULLS LAST
  LIMIT 1;

  WITH unit_participants AS MATERIALIZED (
    SELECT p.id, p.name, p.chest_number, p.category_code, p.profile_slug, p.status, p.photo_url
    FROM public.participants p
    WHERE p.organisation_id = v_org.id
  ),
  unit_registrations AS MATERIALIZED (
    SELECT DISTINCT ON (up.id, r.id)
      up.id AS unit_participant_id,
      r.id AS registration_id,
      r.status,
      r.item_id,
      r.festival_id
    FROM unit_participants up
    JOIN public.registrations r ON r.participant_id = up.id
    UNION
    SELECT DISTINCT ON (up.id, r.id)
      up.id AS unit_participant_id,
      r.id AS registration_id,
      r.status,
      r.item_id,
      r.festival_id
    FROM unit_participants up
    JOIN public.group_members gm ON gm.participant_id = up.id
    JOIN public.registrations r ON r.id = gm.registration_id AND r.entry_kind = 'general_team'
  ),
  unit_results_raw AS MATERIALIZED (
    SELECT
      res.id,
      res.registration_id,
      res.festival_id,
      res.item_id AS res_item_id,
      res.rank,
      res.grade,
      res.points_awarded
    FROM (SELECT DISTINCT ur.registration_id FROM unit_registrations ur) dist_regs
    JOIN public.results res ON res.registration_id = dist_regs.registration_id
    WHERE res.published IS TRUE
      AND COALESCE(res.result_status, 'published') = 'published'
      AND COALESCE(res.public_visible, false) IS TRUE
  ),
  unit_festival_flags AS MATERIALIZED (
    SELECT
      f.festival_id,
      COALESCE(s.show_competition_points_grades, true) AS show_competition_points_grades,
      (
        COALESCE(s.limit_public_results, false) IS TRUE
        AND COALESCE(s.ranking_mode, 'ALL') = 'LIMITED'
        AND s.item_limit IS NOT NULL
        AND s.item_limit > 0
      ) AS enforce_limit
    FROM (SELECT DISTINCT urr.festival_id FROM unit_results_raw urr WHERE urr.festival_id IS NOT NULL) f
    LEFT JOIN public.festival_leaderboard_settings s ON s.festival_id = f.festival_id
  ),
  unit_limited_items AS MATERIALIZED (
    SELECT uff.festival_id, li.item_id
    FROM unit_festival_flags uff
    CROSS JOIN LATERAL public.get_public_leaderboard_included_item_ids(uff.festival_id) AS li
    WHERE uff.enforce_limit IS TRUE
  ),
  unit_results_by_reg AS MATERIALIZED (
    SELECT
      ur.registration_id,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'rank', res.rank,
            'grade', CASE WHEN COALESCE(uff.show_competition_points_grades, true) THEN res.grade ELSE NULL END,
            'points_awarded', CASE WHEN COALESCE(uff.show_competition_points_grades, true) THEN res.points_awarded ELSE NULL END
          )
        ) FILTER (WHERE res.id IS NOT NULL),
        '[]'::jsonb
      ) AS results_json
    FROM (SELECT DISTINCT r0.registration_id, r0.item_id FROM unit_registrations r0) ur
    LEFT JOIN unit_results_raw res ON res.registration_id = ur.registration_id
    LEFT JOIN unit_festival_flags uff ON uff.festival_id = res.festival_id
    WHERE res.id IS NULL
       OR NOT COALESCE(uff.enforce_limit, false)
       OR (
         COALESCE(res.res_item_id, ur.item_id) IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM unit_limited_items uli
           WHERE uli.festival_id = res.festival_id
             AND uli.item_id = COALESCE(res.res_item_id, ur.item_id)
         )
       )
    GROUP BY ur.registration_id
  )
  SELECT jsonb_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'parent_id', v_org.parent_id,
    'show_competition_points_grades', COALESCE(v_show_points, true),
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
                'id', r.registration_id,
                'status', r.status,
                'item_id', r.item_id,
                'item', jsonb_build_object(
                  'name', i.item_name_en,
                  'name_ml', i.item_name_ml
                ),
                'results', COALESCE(rbr.results_json, '[]'::jsonb)
              )
            )
            FROM unit_registrations r
            LEFT JOIN items i ON i.id = r.item_id
            LEFT JOIN unit_results_by_reg rbr ON rbr.registration_id = r.registration_id
            WHERE r.unit_participant_id = p.id
          ), '[]'::jsonb)
        )
      )
      FROM unit_participants p
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_public_unit_profile(uuid) OWNER TO postgres;

-- 6. Replace correlated row-by-row IN (SELECT ... LIMIT ...) subqueries in public AI views
--    with single-pass window ranking, remove the Cartesian join in vw_public_live_status,
--    and restore view owner mode + SELECT grants for anon/authenticated/service_role.
CREATE OR REPLACE VIEW public.vw_public_results AS
WITH ranked_items AS (
  SELECT
    ifp.festival_id,
    ifp.item_id,
    row_number() OVER (
      PARTITION BY ifp.festival_id
      ORDER BY ifp.first_published_at ASC, ifp.item_id ASC
    ) AS item_pos
  FROM (
    SELECT
      limited.festival_id,
      limited.item_id,
      min(limited.published_at) AS first_published_at
    FROM public.results AS limited
    WHERE limited.published IS TRUE
      AND COALESCE(limited.result_status, 'draft') IN ('published', 'ready')
      AND COALESCE(limited.public_visible, false) IS TRUE
      AND limited.item_id IS NOT NULL
    GROUP BY limited.festival_id, limited.item_id
  ) AS ifp
)
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
  CASE WHEN COALESCE(settings.show_competition_points_grades, true) THEN res.grade ELSE NULL END AS grade,
  CASE WHEN COALESCE(settings.show_competition_points_grades, true) THEN res.points_awarded ELSE NULL END AS points_awarded,
  res.published_at,
  res.festival_id
FROM public.results AS res
LEFT JOIN public.festival_leaderboard_settings AS settings ON settings.festival_id = res.festival_id
LEFT JOIN ranked_items AS ri ON ri.festival_id = res.festival_id AND ri.item_id = res.item_id
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
    COALESCE(settings.limit_public_results, false) IS NOT TRUE
    OR COALESCE(settings.ranking_mode, 'ALL') <> 'LIMITED'
    OR COALESCE(settings.item_limit, 0) <= 0
    OR ri.item_pos <= settings.item_limit
  );

ALTER VIEW public.vw_public_results OWNER TO postgres;
ALTER VIEW public.vw_public_results SET (security_invoker = false);

CREATE OR REPLACE VIEW public.vw_public_leaderboard AS
WITH ranked_items AS (
  SELECT
    ifp.festival_id,
    ifp.item_id,
    row_number() OVER (
      PARTITION BY ifp.festival_id
      ORDER BY ifp.first_published_at ASC, ifp.item_id ASC
    ) AS item_pos
  FROM (
    SELECT
      limited.festival_id,
      limited.item_id,
      min(limited.published_at) AS first_published_at
    FROM public.results AS limited
    WHERE limited.published IS TRUE
      AND COALESCE(limited.result_status, 'draft') IN ('published', 'ready')
      AND COALESCE(limited.public_visible, false) IS TRUE
      AND limited.item_id IS NOT NULL
    GROUP BY limited.festival_id, limited.item_id
  ) AS ifp
)
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
LEFT JOIN public.festival_leaderboard_settings settings ON settings.festival_id = res.festival_id
LEFT JOIN ranked_items ri ON ri.festival_id = res.festival_id AND ri.item_id = res.item_id
LEFT JOIN public.registrations reg ON reg.id = res.registration_id
LEFT JOIN public.participants participant ON participant.id = reg.participant_id
LEFT JOIN public.organisations org ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
WHERE res.published IS TRUE
  AND res.public_visible IS TRUE
  AND COALESCE(res.result_status, 'published'::text) = 'published'::text
  AND (
    COALESCE(settings.ranking_mode, 'ALL') <> 'LIMITED'
    OR COALESCE(settings.item_limit, 0) <= 0
    OR ri.item_pos <= settings.item_limit
  )
GROUP BY org.id, org.name, org.org_type, org.parent_id, res.festival_id;

ALTER VIEW public.vw_public_leaderboard OWNER TO postgres;
ALTER VIEW public.vw_public_leaderboard SET (security_invoker = false);

CREATE OR REPLACE VIEW public.vw_public_live_status AS
WITH ranked_items AS (
  SELECT
    ifp.festival_id,
    ifp.item_id,
    row_number() OVER (
      PARTITION BY ifp.festival_id
      ORDER BY ifp.first_published_at ASC, ifp.item_id ASC
    ) AS item_pos
  FROM (
    SELECT
      limited.festival_id,
      limited.item_id,
      min(limited.published_at) AS first_published_at
    FROM public.results AS limited
    WHERE limited.published IS TRUE
      AND COALESCE(limited.result_status, 'draft') IN ('published', 'ready')
      AND COALESCE(limited.public_visible, false) IS TRUE
      AND limited.item_id IS NOT NULL
    GROUP BY limited.festival_id, limited.item_id
  ) AS ifp
),
result_counts AS (
  SELECT
    res.festival_id,
    count(DISTINCT res.id) AS published_results_count
  FROM public.results AS res
  LEFT JOIN public.festival_leaderboard_settings AS settings ON settings.festival_id = res.festival_id
  LEFT JOIN ranked_items AS ri ON ri.festival_id = res.festival_id AND ri.item_id = res.item_id
  WHERE res.published IS TRUE
    AND res.public_visible IS TRUE
    AND COALESCE(res.result_status, 'published'::text) = 'published'::text
    AND (
      COALESCE(settings.limit_public_results, false) IS NOT TRUE
      OR COALESCE(settings.ranking_mode, 'ALL') <> 'LIMITED'
      OR COALESCE(settings.item_limit, 0) <= 0
      OR ri.item_pos <= settings.item_limit
    )
  GROUP BY res.festival_id
),
schedule_counts AS (
  SELECT
    sch.festival_id,
    count(DISTINCT sch.id) FILTER (WHERE sch.status = 'live'::text) AS live_stages_count,
    count(DISTINCT sch.venue_id) FILTER (WHERE sch.status = 'live'::text) AS active_venues_count,
    count(DISTINCT itm.id) AS total_items_count
  FROM public.schedules AS sch
  LEFT JOIN public.items AS itm ON itm.id = sch.item_id
  GROUP BY sch.festival_id
)
SELECT
  festival.id AS festival_id,
  festival.custom_name AS festival_name,
  COALESCE(rc.published_results_count, 0::bigint) AS published_results_count,
  COALESCE(sc.live_stages_count, 0::bigint) AS live_stages_count,
  COALESCE(sc.active_venues_count, 0::bigint) AS active_venues_count,
  COALESCE(sc.total_items_count, 0::bigint) AS total_items_count
FROM public.festival_calendar festival
LEFT JOIN result_counts rc ON rc.festival_id = festival.id
LEFT JOIN schedule_counts sc ON sc.festival_id = festival.id;

ALTER VIEW public.vw_public_live_status OWNER TO postgres;
ALTER VIEW public.vw_public_live_status SET (security_invoker = false);

CREATE OR REPLACE VIEW public.vw_public_participants AS
WITH ranked_items AS (
  SELECT
    ifp.festival_id,
    ifp.item_id,
    row_number() OVER (
      PARTITION BY ifp.festival_id
      ORDER BY ifp.first_published_at ASC, ifp.item_id ASC
    ) AS item_pos
  FROM (
    SELECT
      limited.festival_id,
      limited.item_id,
      min(limited.published_at) AS first_published_at
    FROM public.results AS limited
    WHERE limited.published IS TRUE
      AND COALESCE(limited.result_status, 'draft') IN ('published', 'ready')
      AND COALESCE(limited.public_visible, false) IS TRUE
      AND limited.item_id IS NOT NULL
    GROUP BY limited.festival_id, limited.item_id
  ) AS ifp
)
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
        COALESCE(settings.limit_public_results, false) IS NOT TRUE
        OR COALESCE(settings.ranking_mode, 'ALL') <> 'LIMITED'
        OR COALESCE(settings.item_limit, 0) <= 0
        OR ri.item_pos <= settings.item_limit
      )
    THEN res.rank
    ELSE NULL::integer
  END AS rank,
  CASE
    WHEN res.published IS TRUE
      AND res.public_visible IS TRUE
      AND COALESCE(res.result_status, 'published'::text) = 'published'::text
      AND (
        COALESCE(settings.limit_public_results, false) IS NOT TRUE
        OR COALESCE(settings.ranking_mode, 'ALL') <> 'LIMITED'
        OR COALESCE(settings.item_limit, 0) <= 0
        OR ri.item_pos <= settings.item_limit
      )
    THEN res.grade
    ELSE NULL::text
  END AS grade,
  CASE
    WHEN res.published IS TRUE
      AND res.public_visible IS TRUE
      AND COALESCE(res.result_status, 'published'::text) = 'published'::text
      AND (
        COALESCE(settings.limit_public_results, false) IS NOT TRUE
        OR COALESCE(settings.ranking_mode, 'ALL') <> 'LIMITED'
        OR COALESCE(settings.item_limit, 0) <= 0
        OR ri.item_pos <= settings.item_limit
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
LEFT JOIN public.festival_leaderboard_settings settings ON settings.festival_id = res.festival_id
LEFT JOIN ranked_items ri
  ON ri.festival_id = res.festival_id
 AND ri.item_id = COALESCE(res.item_id, reg.item_id)
WHERE p.status = 'approved'::text
  AND COALESCE(p.is_terminated, false) = false;

ALTER VIEW public.vw_public_participants OWNER TO postgres;
ALTER VIEW public.vw_public_participants SET (security_invoker = false);

GRANT SELECT ON
  public.vw_public_results,
  public.vw_public_leaderboard,
  public.vw_public_live_status,
  public.vw_public_participants
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
