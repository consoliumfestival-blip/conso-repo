-- One festival-level switch hides only per-competition grades and points.
-- Results, event ranks, and unit/team aggregate points continue following their existing visibility rules.
ALTER TABLE public.festival_leaderboard_settings
  ADD COLUMN IF NOT EXISTS show_competition_points_grades boolean NOT NULL DEFAULT true;

DROP FUNCTION IF EXISTS public.get_public_leaderboard_settings(uuid, uuid);
CREATE FUNCTION "public"."get_public_leaderboard_settings"("p_tenant_id" "uuid" DEFAULT NULL::"uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("festival_id" "uuid", "festival_level" "text", "is_public_visible" boolean, "show_individual_rankings" boolean, "show_competition_points_grades" boolean, "team_point_status" "text", "public_festival_name" "text", "theme_config" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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
    settings.theme_config AS theme_config
  FROM festival_calendar fc
  LEFT JOIN festival_leaderboard_settings settings
    ON settings.festival_id = fc.id
  WHERE fc.id = v_festival_id
    AND (p_tenant_id IS NULL OR fc.tenant_id = p_tenant_id)
    AND COALESCE(settings.is_public_visible, false) IS TRUE;
END;
$$;


ALTER FUNCTION "public"."get_public_leaderboard_settings"("p_tenant_id" "uuid", "p_festival_id" "uuid") OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard_settings(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION "public"."get_public_published_results"("p_tenant_id" "uuid" DEFAULT NULL::"uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid", "p_include_participant_details" boolean DEFAULT true) RETURNS TABLE("result_id" "uuid", "registration_id" "uuid", "item_id" "uuid", "item_name" "text", "item_name_ml" "text", "is_group" boolean, "item_category_codes" "text"[], "organisation_id" "uuid", "organisation_name" "text", "organisation_type" "text", "participant_id" "uuid", "participant_name" "text", "participant_profile_slug" "text", "chest_number" "text", "participant_category_code" "text", "rank" integer, "grade" "text", "points_awarded" integer, "published_at" timestamp with time zone, "festival_level" "text", "public_result_no" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_festival_id uuid;
  v_festival_tenant_id uuid;
  v_festival_level text;
  v_is_public_visible boolean := false;
  v_caller_is_admin boolean := false;
  v_show_competition_points_grades boolean := true;
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

  SELECT COALESCE(is_public_visible, false)
  INTO v_is_public_visible
  FROM festival_leaderboard_settings
  WHERE festival_id = v_festival_id
  LIMIT 1;

  SELECT COALESCE(show_competition_points_grades, true) INTO v_show_competition_points_grades
  FROM festival_leaderboard_settings WHERE festival_id = v_festival_id LIMIT 1;

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
  WITH published_results AS (
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


ALTER FUNCTION "public"."get_public_published_results"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_include_participant_details" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_public_candidate_profile(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_participant record;
  v_result jsonb;
BEGIN
  SELECT
    p.id,
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

  IF v_participant.id IS NULL THEN
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
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
ALTER FUNCTION "public"."get_public_candidate_profile"(p_slug text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_public_unit_profile"("p_unit_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org record;
  v_result jsonb;
BEGIN
  -- Fetch organisation details
  SELECT
    id, name, parent_id, tenant_id
  INTO v_org
  FROM organisations
  WHERE id = p_unit_id
  LIMIT 1;

  IF v_org.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build JSON
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
                    AND COALESCE(res.public_visible, false) IS TRUE
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


ALTER FUNCTION "public"."get_public_unit_profile"("p_unit_id" "uuid") OWNER TO "postgres";

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
  AND COALESCE(res.result_status, 'published') = 'published';

ALTER VIEW public.vw_public_results OWNER TO postgres;


-- Preserve the live leaderboard's award attribution and grace-mark behavior.
-- Mask only grade aggregates at the public RPC boundary while retaining team totals.
ALTER FUNCTION public.get_public_leaderboard(uuid, uuid)
  RENAME TO get_public_leaderboard_unmasked;
REVOKE ALL ON FUNCTION public.get_public_leaderboard_unmasked(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_public_leaderboard(
  p_tenant_id uuid DEFAULT NULL,
  p_festival_id uuid DEFAULT NULL
)
RETURNS TABLE(
  organisation_id uuid,
  organisation_name text,
  organisation_type text,
  parent_id uuid,
  total_points bigint,
  first_place_count bigint,
  second_place_count bigint,
  third_place_count bigint,
  grade_a_plus_count bigint,
  grade_a_count bigint,
  grade_b_count bigint,
  grade_c_count bigint,
  result_count bigint,
  latest_published_at timestamptz,
  grace_marks_awarded bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_festival_id uuid;
  v_show_competition_points_grades boolean := true;
BEGIN
  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_festival_id
    FROM public.festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC
    LIMIT 1;
  END IF;

  SELECT COALESCE(settings.show_competition_points_grades, true)
  INTO v_show_competition_points_grades
  FROM public.festival_leaderboard_settings AS settings
  WHERE settings.festival_id = v_festival_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    leaderboard.organisation_id,
    leaderboard.organisation_name,
    leaderboard.organisation_type,
    leaderboard.parent_id,
    leaderboard.total_points,
    leaderboard.first_place_count,
    leaderboard.second_place_count,
    leaderboard.third_place_count,
    CASE WHEN COALESCE(v_show_competition_points_grades, true) THEN leaderboard.grade_a_plus_count ELSE 0::bigint END,
    CASE WHEN COALESCE(v_show_competition_points_grades, true) THEN leaderboard.grade_a_count ELSE 0::bigint END,
    CASE WHEN COALESCE(v_show_competition_points_grades, true) THEN leaderboard.grade_b_count ELSE 0::bigint END,
    CASE WHEN COALESCE(v_show_competition_points_grades, true) THEN leaderboard.grade_c_count ELSE 0::bigint END,
    leaderboard.result_count,
    leaderboard.latest_published_at,
    leaderboard.grace_marks_awarded
  FROM public.get_public_leaderboard_unmasked(p_tenant_id, v_festival_id) AS leaderboard;
END;
$function$;

ALTER FUNCTION public.get_public_leaderboard(uuid, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(uuid, uuid)
  TO anon, authenticated, service_role;