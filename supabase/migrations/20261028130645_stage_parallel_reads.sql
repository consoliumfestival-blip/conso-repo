-- Additive Stage read paths. Existing read/write RPCs remain untouched.
-- These functions are intentionally available to every tenant, but always
-- derive tenant scope from the authenticated admin or the venue PIN.

CREATE OR REPLACE FUNCTION public.stage_management_schedule_summary_v2(p_festival_id uuid)
RETURNS TABLE(schedule_id uuid, active_count integer, verified_count integer,
              coded_count integer, rejected_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  IF p_festival_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.festival_calendar f
    WHERE f.id = p_festival_id AND f.tenant_id = v_tenant_id AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The requested festival is not active for this tenant.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH visible AS MATERIALIZED (
    SELECT vo.id, vo.tenant_id FROM public.get_visible_organisations(v_tenant_id) vo
  ), eligible AS (
    SELECT s.id AS sid, r.status, r.is_verified, r.code_letter
    FROM public.schedules s
    JOIN public.registrations r ON r.item_id = s.item_id AND r.festival_id = s.festival_id
    LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = p_festival_id
    WHERE s.tenant_id = v_tenant_id AND s.festival_id = p_festival_id
      AND (r.entry_kind = 'general_team' OR p.id IS NOT NULL)
      AND (r.organisation_id IN (SELECT vo.id FROM visible vo)
        OR r.tenant_id IN (SELECT vo.tenant_id FROM visible vo)
        OR p.organisation_id IN (SELECT vo.id FROM visible vo))
  )
  SELECT s.id,
    count(e.sid) FILTER (WHERE e.status IS DISTINCT FROM 'rejected')::integer,
    count(e.sid) FILTER (WHERE e.status IS DISTINCT FROM 'rejected' AND e.is_verified IS TRUE)::integer,
    count(e.sid) FILTER (WHERE e.status IS DISTINCT FROM 'rejected' AND e.is_verified IS TRUE AND e.code_letter IS NOT NULL)::integer,
    count(e.sid) FILTER (WHERE e.status = 'rejected')::integer
  FROM public.schedules s LEFT JOIN eligible e ON e.sid = s.id
  WHERE s.tenant_id = v_tenant_id AND s.festival_id = p_festival_id
  GROUP BY s.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_venue_portal_summary_v2(p_venue_id uuid, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_pin_error text;
  v_schedules jsonb;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('error', v_pin_error); END IF;
  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stage not found.' USING ERRCODE = 'P0002'; END IF;

  WITH visible AS MATERIALIZED (
    SELECT vo.id, vo.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) vo
  ), scoped AS MATERIALIZED (
    SELECT s.id, s.tenant_id, s.festival_id, s.item_id, s.venue_id,
      s.start_time, s.end_time, s.status,
      COALESCE(s.is_shuffle_locked, false) AS is_shuffle_locked, s.shuffle_locked_at,
      i.item_code, i.item_name_en, i.item_name_ml, i.category_codes,
      v_venue.name AS venue_name,
      (SELECT count(*) > 1 FROM public.schedules same_item
       WHERE same_item.tenant_id = s.tenant_id AND same_item.festival_id = s.festival_id
         AND same_item.item_id = s.item_id) AS registration_scope_ambiguous
    FROM public.schedules s
    JOIN public.items i ON i.id = s.item_id AND i.tenant_id = v_venue.tenant_id
      AND i.festival_id = v_venue.festival_id
    WHERE s.venue_id = p_venue_id AND s.tenant_id = v_venue.tenant_id
      AND s.festival_id = v_venue.festival_id
  ), eligible AS (
    SELECT s.id AS sid, r.status, r.is_verified, r.code_letter
    FROM scoped s
    JOIN public.registrations r ON r.item_id = s.item_id AND r.festival_id = s.festival_id
    LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = v_venue.festival_id
    WHERE NOT s.registration_scope_ambiguous
      AND (r.entry_kind = 'general_team' OR p.id IS NOT NULL)
      AND (r.organisation_id IN (SELECT vo.id FROM visible vo)
        OR r.tenant_id IN (SELECT vo.tenant_id FROM visible vo)
        OR p.organisation_id IN (SELECT vo.id FROM visible vo))
  ), counts AS (
    SELECT e.sid,
      count(*) FILTER (WHERE e.status IS DISTINCT FROM 'rejected')::integer AS active_count,
      count(*) FILTER (WHERE e.status IS DISTINCT FROM 'rejected' AND e.is_verified IS TRUE)::integer AS verified_count,
      count(*) FILTER (WHERE e.status IS DISTINCT FROM 'rejected' AND e.is_verified IS TRUE AND NULLIF(e.code_letter, '') IS NOT NULL)::integer AS coded_count,
      count(*) FILTER (WHERE e.status = 'rejected')::integer AS rejected_count
    FROM eligible e GROUP BY e.sid
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) || pg_catalog.jsonb_build_object(
    'registration_summary', pg_catalog.jsonb_build_object(
      'active_count', COALESCE(c.active_count, 0), 'verified_count', COALESCE(c.verified_count, 0),
      'coded_count', COALESCE(c.coded_count, 0), 'rejected_count', COALESCE(c.rejected_count, 0)
    )) ORDER BY s.start_time NULLS LAST, s.id), '[]'::jsonb)
  INTO v_schedules FROM scoped s LEFT JOIN counts c ON c.sid = s.id;

  RETURN pg_catalog.jsonb_build_object(
    'venue', pg_catalog.jsonb_build_object('id', v_venue.id, 'name', v_venue.name, 'location', v_venue.location),
    'schedules', v_schedules
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_venue_portal_schedule_detail_v2(p_venue_id uuid, p_pin text, p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_pin_error text;
  v_registrations jsonb := '[]'::jsonb;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('error', v_pin_error); END IF;
  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stage not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT s.* INTO v_schedule FROM public.schedules s
  JOIN public.items i ON i.id = s.item_id AND i.tenant_id = v_venue.tenant_id
    AND i.festival_id = v_venue.festival_id
  WHERE s.id = p_schedule_id AND s.venue_id = v_venue.id
    AND s.tenant_id = v_venue.tenant_id AND s.festival_id = v_venue.festival_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;

  -- The legacy portal shows no registrations for an item with multiple schedules.
  IF (SELECT count(*) FROM public.schedules s WHERE s.tenant_id = v_schedule.tenant_id
      AND s.festival_id = v_schedule.festival_id AND s.item_id = v_schedule.item_id) = 1 THEN
    WITH visible AS MATERIALIZED (
      SELECT vo.id, vo.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) vo
    )
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', r.id, 'schedule_id', v_schedule.id, 'item_id', r.item_id,
      'participant_id', r.participant_id, 'organisation_id', COALESCE(r.organisation_id, p.organisation_id),
      'status', r.status, 'is_verified', r.is_verified,
      'code_letter', r.code_letter, 'code_letter_fixed', r.code_letter_fixed,
      'participant_name', CASE WHEN r.entry_kind = 'general_team' THEN group_entry_private.display_name(r) ELSE p.name END,
      'participant_chest_number', COALESCE(group_entry_private.chest_number(r), p.chest_number),
      'participant_category_code', CASE WHEN r.entry_kind = 'general_team' THEN group_entry_private.category_code(r) ELSE p.category_code END,
      'organisation_name', o.name, 'organisation_type', o.org_type, 'entry_kind', r.entry_kind,
      'members', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', gp.name, 'chest_number', gp.chest_number) ORDER BY gp.chest_number NULLS LAST, gp.name)
        FROM public.group_members gm JOIN public.participants gp ON gp.id = gm.participant_id
        WHERE gm.registration_id = r.id), '[]'::jsonb)
    ) ORDER BY COALESCE(group_entry_private.chest_number(r), p.chest_number) NULLS LAST, p.name, r.id), '[]'::jsonb)
    INTO v_registrations
    FROM public.registrations r
    LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = v_venue.festival_id
    LEFT JOIN public.organisations o ON o.id = COALESCE(r.organisation_id, p.organisation_id)
    WHERE r.festival_id = v_schedule.festival_id AND r.item_id = v_schedule.item_id
      AND (r.entry_kind = 'general_team' OR p.id IS NOT NULL)
      AND (r.organisation_id IN (SELECT vo.id FROM visible vo)
        OR r.tenant_id IN (SELECT vo.tenant_id FROM visible vo)
        OR p.organisation_id IN (SELECT vo.id FROM visible vo));
  END IF;

  RETURN pg_catalog.jsonb_build_object('registrations', v_registrations);
END;
$function$;

REVOKE ALL ON FUNCTION public.stage_management_schedule_summary_v2(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_management_schedule_summary_v2(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.stage_venue_portal_summary_v2(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_summary_v2(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stage_venue_portal_schedule_detail_v2(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_schedule_detail_v2(uuid, text, uuid) TO anon, authenticated, service_role;
