-- Public Student Portal candidate lookup. Search is constrained to a tenant's
-- festival and descendant organisations, and returns only enabled profile data.
CREATE OR REPLACE FUNCTION public.search_public_candidate_profiles(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_query text,
  p_cursor jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_settings jsonb;
  v_root_organisation_id uuid;
  v_festival_id uuid;
  v_query text;
  v_cursor_name text;
  v_cursor_id uuid;
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant is required.' USING ERRCODE = '22023';
  END IF;

  v_query := lower(btrim(COALESCE(p_query, '')));
  IF v_query = '' OR char_length(v_query) > 100 THEN
    RAISE EXCEPTION 'Search text must contain 1 to 100 characters.' USING ERRCODE = '22023';
  END IF;

  v_settings := public.get_public_tenant_feature_settings(p_tenant_id);
  IF COALESCE((v_settings->>'public_page')::boolean, false) IS NOT TRUE
     OR COALESCE((v_settings #>> '{sections,results}')::boolean, false) IS NOT TRUE
     OR COALESCE((v_settings #>> '{sections,participant_results}')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Public candidate profiles are unavailable.' USING ERRCODE = '42501';
  END IF;

  SELECT tenant.organisation_id
  INTO v_root_organisation_id
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
    AND tenant.access_disabled IS NOT TRUE;

  IF v_root_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Public candidate profiles are unavailable.' USING ERRCODE = '42501';
  END IF;

  IF p_festival_id IS NULL THEN
    v_festival_id := public.get_public_active_festival_id(p_tenant_id);
  ELSE
    SELECT festival.id
    INTO v_festival_id
    FROM public.festival_calendar AS festival
    WHERE festival.id = p_festival_id
      AND festival.tenant_id = p_tenant_id;
  END IF;

  IF v_festival_id IS NULL THEN
    RAISE EXCEPTION 'Festival is unavailable for this tenant.' USING ERRCODE = '42501';
  END IF;

  IF p_cursor IS NOT NULL THEN
    IF jsonb_typeof(p_cursor) IS DISTINCT FROM 'object'
       OR NULLIF(p_cursor->>'name', '') IS NULL
       OR NULLIF(p_cursor->>'id', '') IS NULL THEN
      RAISE EXCEPTION 'Invalid candidate search cursor.' USING ERRCODE = '22023';
    END IF;

    v_cursor_name := p_cursor->>'name';
    BEGIN
      v_cursor_id := (p_cursor->>'id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid candidate search cursor.' USING ERRCODE = '22023';
    END;
  END IF;

  WITH RECURSIVE descendant_organisations(id, path) AS (
    SELECT organisation.id, ARRAY[organisation.id]::uuid[]
    FROM public.organisations AS organisation
    WHERE organisation.parent_id = v_root_organisation_id
      AND organisation.archived_at IS NULL

    UNION ALL

    SELECT child.id, parent.path || child.id
    FROM public.organisations AS child
    JOIN descendant_organisations AS parent ON child.parent_id = parent.id
    WHERE child.archived_at IS NULL
      AND child.id <> v_root_organisation_id
      AND NOT child.id = ANY(parent.path)
  ), matching_candidates AS (
    SELECT
      participant.id,
      participant.profile_slug AS slug,
      participant.name,
      lower(participant.name) AS sort_name,
      participant.chest_number,
      participant.category_code
    FROM public.participants AS participant
    WHERE participant.tenant_id = p_tenant_id
      AND participant.festival_id = v_festival_id
      AND participant.organisation_id IN (SELECT descendant.id FROM descendant_organisations AS descendant)
      AND participant.profile_slug IS NOT NULL
      AND COALESCE(participant.public_profile_enabled, true) IS TRUE
      AND (
        strpos(lower(COALESCE(participant.name, '')), v_query) > 0
        OR strpos(lower(COALESCE(participant.chest_number, '')), v_query) > 0
      )
      AND (
        v_cursor_id IS NULL
        OR lower(participant.name) > v_cursor_name
        OR (lower(participant.name) = v_cursor_name AND participant.id > v_cursor_id)
      )
  ), ranked_candidates AS (
    SELECT
      candidate.*,
      row_number() OVER (ORDER BY candidate.sort_name, candidate.id) AS row_number
    FROM matching_candidates AS candidate
    ORDER BY candidate.sort_name, candidate.id
    LIMIT 51
  ), page_candidates AS (
    SELECT * FROM ranked_candidates WHERE row_number <= 50
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'slug', page.slug,
          'name', page.name,
          'chest_number', page.chest_number,
          'category_code', page.category_code
        ) ORDER BY page.row_number
      ),
      '[]'::jsonb
    ),
    (SELECT count(*) > 50 FROM ranked_candidates),
    CASE WHEN (SELECT count(*) > 50 FROM ranked_candidates) THEN (
      SELECT jsonb_build_object('name', page.sort_name, 'id', page.id)
      FROM page_candidates AS page
      ORDER BY page.row_number DESC
      LIMIT 1
    ) ELSE NULL END
  INTO v_items, v_has_more, v_next_cursor
  FROM page_candidates AS page;

  RETURN jsonb_build_object(
    'festival_id', v_festival_id,
    'items', COALESCE(v_items, '[]'::jsonb),
    'has_more', COALESCE(v_has_more, false),
    'next_cursor', v_next_cursor
  );
END;
$function$;

ALTER FUNCTION public.search_public_candidate_profiles(uuid, uuid, text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.search_public_candidate_profiles(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_candidate_profiles(uuid, uuid, text, jsonb) TO anon, authenticated, service_role;
