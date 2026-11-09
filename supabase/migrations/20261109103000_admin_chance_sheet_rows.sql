CREATE OR REPLACE FUNCTION public.admin_chance_sheet_rows(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_item_id uuid
)
RETURNS TABLE (
  chest_number text,
  participant_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_participation_type text;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF p_tenant_id IS NULL OR p_tenant_id IS DISTINCT FROM v_tenant_id THEN
    RAISE EXCEPTION 'The requested tenant is outside the current admin scope.'
      USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(coalesce(item.participation_type, 'individual')))
    INTO v_participation_type
  FROM public.items item
  JOIN public.festival_calendar festival
    ON festival.id = item.festival_id
   AND festival.tenant_id = p_tenant_id
  WHERE item.id = p_item_id
    AND item.festival_id = p_festival_id
    AND item.tenant_id = p_tenant_id
    AND festival.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested item is unavailable for the active festival.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN registration.entry_kind = 'general_team' THEN leader.chest_number
      ELSE participant.chest_number
    END::text,
    CASE
      WHEN registration.entry_kind = 'general_team' THEN coalesce(organisation.name, 'Unnamed group')
      ELSE coalesce(participant.name, 'Unnamed participant')
    END::text
  FROM public.registrations registration
  LEFT JOIN public.participants participant
    ON participant.id = registration.participant_id
   AND participant.festival_id = p_festival_id
   AND (
     participant.organisation_id IN (
       SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
     )
     OR participant.tenant_id IN (
       SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
     )
   )
  LEFT JOIN public.participants leader
    ON leader.id = registration.group_leader_participant_id
   AND leader.festival_id = p_festival_id
   AND leader.organisation_id = registration.organisation_id
   AND leader.organisation_id IN (
     SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
   )
  LEFT JOIN public.organisations organisation
    ON organisation.id = registration.organisation_id
  WHERE registration.festival_id = p_festival_id
    AND registration.item_id = p_item_id
    AND registration.status IS DISTINCT FROM 'rejected'
    AND registration.entry_kind = CASE
      WHEN v_participation_type = 'group' THEN 'general_team'
      ELSE 'participant'
    END
    AND (registration.entry_kind = 'general_team' OR participant.id IS NOT NULL)
    AND (
      registration.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR registration.tenant_id IN (
        SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR participant.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
    )
  ORDER BY registration.id;
END;
$function$;

ALTER FUNCTION public.admin_chance_sheet_rows(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_chance_sheet_rows(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_chance_sheet_rows(uuid, uuid, uuid) TO authenticated;
