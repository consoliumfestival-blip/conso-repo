-- Batch, read-only export rows for the authenticated Team Leader's own team.
-- Team Leaders do not have direct SELECT access to these underlying tables.
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.get_team_leader_participant_export_rows()
RETURNS TABLE (
  participant_id uuid,
  participant_name text,
  gender text,
  category_code text,
  chest_number text,
  participant_status text,
  organisation_id uuid,
  team_name text,
  item_id uuid,
  item_code text,
  item_name_en text,
  item_name_ml text,
  item_category_codes text[],
  participation_type text,
  entry_kind text,
  registration_id uuid,
  registration_status text,
  is_verified boolean
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
      SELECT 1
      FROM public.get_visible_organisations(v_context.parent_tenant_id) AS visible
      WHERE visible.id = organisation.id
        AND visible.tenant_id = organisation.tenant_id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The assigned team is outside the festival tenant scope.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH team_participants AS (
    SELECT participant.id, participant.name, participant.gender,
           participant.category_code, participant.chest_number,
           participant.status, participant.organisation_id
    FROM public.participants AS participant
    WHERE participant.festival_id = v_context.festival_id
      AND participant.organisation_id = v_context.organisation_id
      AND participant.tenant_id IN (v_context.parent_tenant_id, v_organisation_tenant_id)
  ), participant_entries AS (
    SELECT registration.id AS registration_id,
           registration.participant_id,
           registration.item_id,
           registration.entry_kind,
           registration.status AS registration_status,
           registration.is_verified
    FROM public.registrations AS registration
    WHERE registration.festival_id = v_context.festival_id
      AND registration.organisation_id = v_context.organisation_id
      AND registration.tenant_id IN (v_context.parent_tenant_id, v_organisation_tenant_id)
      AND registration.entry_kind = 'participant'
      AND registration.participant_id IS NOT NULL

    UNION ALL

    SELECT registration.id AS registration_id,
           member.participant_id,
           registration.item_id,
           registration.entry_kind,
           registration.status AS registration_status,
           registration.is_verified
    FROM public.registrations AS registration
    JOIN public.group_members AS member
      ON member.registration_id = registration.id
    WHERE registration.festival_id = v_context.festival_id
      AND registration.organisation_id = v_context.organisation_id
      AND registration.tenant_id IN (v_context.parent_tenant_id, v_organisation_tenant_id)
      AND registration.entry_kind = 'general_team'
  )
  SELECT participant.id,
         participant.name,
         participant.gender,
         participant.category_code,
         participant.chest_number,
         participant.status,
         participant.organisation_id,
         organisation.name,
         entry.item_id,
         item.item_code,
         item.item_name_en,
         item.item_name_ml,
         item.category_codes,
         item.participation_type,
         entry.entry_kind,
         entry.registration_id,
         entry.registration_status,
         entry.is_verified
  FROM team_participants AS participant
  JOIN public.organisations AS organisation
    ON organisation.id = participant.organisation_id
  LEFT JOIN participant_entries AS entry
    ON entry.participant_id = participant.id
  LEFT JOIN public.items AS item
    ON item.id = entry.item_id
   AND item.festival_id = v_context.festival_id
   AND (item.tenant_id IS NULL OR item.tenant_id = v_context.parent_tenant_id)
  ORDER BY participant.name, item.item_name_en NULLS LAST, item.item_code;
END;
$$;

ALTER FUNCTION private.get_team_leader_participant_export_rows() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.get_team_leader_participant_export_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_team_leader_participant_export_rows() TO authenticated;

-- PostgREST exposes only the public wrapper. Privileged table reads stay in
-- the non-exposed schema, while the internal function still enforces the
-- authenticated Team Leader's own festival/team assignment.
CREATE OR REPLACE FUNCTION public.get_team_leader_participant_export_rows()
RETURNS TABLE (
  participant_id uuid,
  participant_name text,
  gender text,
  category_code text,
  chest_number text,
  participant_status text,
  organisation_id uuid,
  team_name text,
  item_id uuid,
  item_code text,
  item_name_en text,
  item_name_ml text,
  item_category_codes text[],
  participation_type text,
  entry_kind text,
  registration_id uuid,
  registration_status text,
  is_verified boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.get_team_leader_participant_export_rows();
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_participant_export_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_participant_export_rows() TO authenticated;
