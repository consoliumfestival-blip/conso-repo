-- Return the current competition registrations for one participant in the
-- authenticated Team Leader's assigned festival and organisation.
CREATE OR REPLACE FUNCTION public.get_team_leader_participant_programs(p_participant_id uuid)
RETURNS TABLE (
  item_id uuid,
  item_code text,
  item_name_en text,
  item_name_ml text,
  category_codes text[],
  participation_type text,
  entry_kind text,
  registration_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_context record;
  v_organisation_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;

  SELECT organisation.tenant_id INTO v_organisation_tenant_id
  FROM public.organisations AS organisation
  WHERE organisation.id = v_context.organisation_id
    AND organisation.tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) AS visible
      WHERE visible.id = organisation.id
        AND visible.tenant_id = organisation.tenant_id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The assigned team is outside the festival tenant scope.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.participants AS participant
    WHERE participant.id = p_participant_id
      AND participant.festival_id = v_context.festival_id
      AND participant.organisation_id = v_context.organisation_id
      AND participant.tenant_id IN (v_context.parent_tenant_id, v_organisation_tenant_id)
  ) THEN
    RAISE EXCEPTION 'This student is not available in your team.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT assigned.item_id, item.item_code, item.item_name_en, item.item_name_ml,
         item.category_codes, item.participation_type, assigned.entry_kind,
         assigned.registration_status
  FROM (
    SELECT registration.item_id, registration.entry_kind, registration.status AS registration_status
    FROM public.registrations AS registration
    WHERE registration.participant_id = p_participant_id
      AND registration.entry_kind = 'participant'
      AND registration.festival_id = v_context.festival_id
      AND registration.organisation_id = v_context.organisation_id
      AND registration.tenant_id IN (v_context.parent_tenant_id, v_organisation_tenant_id)
      AND registration.status IS DISTINCT FROM 'rejected'
      AND registration.status IS DISTINCT FROM 'cancelled'

    UNION ALL

    SELECT registration.item_id, registration.entry_kind, registration.status AS registration_status
    FROM public.group_members AS member
    JOIN public.registrations AS registration ON registration.id = member.registration_id
    WHERE member.participant_id = p_participant_id
      AND registration.entry_kind = 'general_team'
      AND registration.festival_id = v_context.festival_id
      AND registration.organisation_id = v_context.organisation_id
      AND registration.tenant_id IN (v_context.parent_tenant_id, v_organisation_tenant_id)
      AND registration.status IS DISTINCT FROM 'rejected'
      AND registration.status IS DISTINCT FROM 'cancelled'
  ) AS assigned
  JOIN public.items AS item ON item.id = assigned.item_id
    AND item.festival_id = v_context.festival_id
    AND (item.tenant_id IS NULL OR item.tenant_id = v_context.parent_tenant_id)
  ORDER BY item.item_name_en NULLS LAST, item.item_code, assigned.entry_kind;
END;
$$;

ALTER FUNCTION public.get_team_leader_participant_programs(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_team_leader_participant_programs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_participant_programs(uuid) TO authenticated;
