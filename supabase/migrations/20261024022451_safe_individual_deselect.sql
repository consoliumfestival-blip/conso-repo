-- Keep the existing Admin call contract while tightening Team Leader ownership
-- and removing identifying registration/completion snapshots on success.
CREATE OR REPLACE FUNCTION public.safe_unassign_registration(
  p_registration_id uuid, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_registration public.registrations;
  v_actor public.profiles;
  v_context record;
  v_festival_tenant_id uuid;
  v_organisation_tenant_id uuid;
  v_dependencies text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE
    AND (v_actor.role IS NULL OR v_actor.role NOT IN ('admin', 'admin_leader', 'team_leader'))) THEN
    RAISE EXCEPTION 'Only festival administrators or team leaders can unassign competition items.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_registration FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;
  IF v_registration.entry_kind IS DISTINCT FROM 'participant' OR v_registration.participant_id IS NULL THEN
    RAISE EXCEPTION 'Use the group roster action for group entries.' USING ERRCODE = '22023';
  END IF;
  SELECT festival.tenant_id, organisation.tenant_id
    INTO v_festival_tenant_id, v_organisation_tenant_id
  FROM public.festival_calendar AS festival
  JOIN public.organisations AS organisation ON organisation.id = v_registration.organisation_id
  WHERE festival.id = v_registration.festival_id;
  IF v_festival_tenant_id IS NULL OR v_organisation_tenant_id IS NULL
    OR v_registration.tenant_id IS NULL
    OR v_registration.tenant_id NOT IN (v_festival_tenant_id, v_organisation_tenant_id) THEN
    RAISE EXCEPTION 'The registration is outside its festival tenant.' USING ERRCODE = '42501';
  END IF;
  IF v_actor.role = 'team_leader' AND v_actor.is_superadmin IS NOT TRUE THEN
    SELECT * INTO v_context FROM public.get_team_leader_context();
    IF NOT FOUND OR v_context.parent_tenant_id IS DISTINCT FROM v_festival_tenant_id
      OR v_context.festival_id IS DISTINCT FROM v_registration.festival_id
      OR v_context.organisation_id IS DISTINCT FROM v_registration.organisation_id THEN
      RAISE EXCEPTION 'This registration is outside your current team assignment.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor.is_superadmin IS NOT TRUE AND (
    v_actor.tenant_id IS DISTINCT FROM v_festival_tenant_id
    OR NOT EXISTS (
      SELECT 1 FROM public.get_visible_organisations(v_festival_tenant_id) AS visible
      WHERE visible.id = v_registration.organisation_id
        AND visible.tenant_id = v_organisation_tenant_id
    )
  ) THEN
    RAISE EXCEPTION 'Administrator access to this festival and team is required.' USING ERRCODE = '42501';
  END IF;
  PERFORM participant.id FROM public.participants AS participant
  WHERE participant.id = v_registration.participant_id FOR UPDATE;

  IF v_registration.is_verified IS TRUE OR v_registration.is_locked IS TRUE
    OR v_registration.code_letter_fixed IS TRUE OR v_registration.code_letter IS NOT NULL THEN
    v_dependencies := pg_catalog.array_append(v_dependencies, 'check-in or code letters');
  END IF;
  IF EXISTS (SELECT 1 FROM public.mark_entries WHERE registration_id = v_registration.id) THEN
    v_dependencies := pg_catalog.array_append(v_dependencies, 'judge marks');
  END IF;
  IF EXISTS (SELECT 1 FROM public.results WHERE registration_id = v_registration.id) THEN
    v_dependencies := pg_catalog.array_append(v_dependencies, 'results or points');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.attendance AS attendance
    JOIN public.schedules AS schedule ON schedule.id = attendance.schedule_id
    WHERE attendance.participant_id = v_registration.participant_id
      AND schedule.festival_id = v_registration.festival_id
      AND schedule.item_id = v_registration.item_id
  ) THEN
    v_dependencies := pg_catalog.array_append(v_dependencies, 'attendance');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.certificates AS certificate
    WHERE certificate.participant_id = v_registration.participant_id
      AND certificate.item_id = v_registration.item_id
  ) THEN
    v_dependencies := pg_catalog.array_append(v_dependencies, 'certificates');
  END IF;
  IF pg_catalog.cardinality(v_dependencies) > 0 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'blocked', 'message',
      'Competition history must be preserved: ' || pg_catalog.array_to_string(v_dependencies, ', '));
  END IF;

  BEGIN
    DELETE FROM public.team_leader_program_completions AS completion
    WHERE completion.tenant_id = v_festival_tenant_id
      AND completion.festival_id = v_registration.festival_id
      AND completion.organisation_id = v_registration.organisation_id
      AND completion.item_id = v_registration.item_id
      AND v_registration.participant_id = ANY(completion.assigned_participant_ids);

    DELETE FROM public.audit_logs AS audit
    WHERE audit.tenant_id IN (v_festival_tenant_id, v_organisation_tenant_id)
      AND ((audit.table_name = 'registrations' AND audit.record_id = v_registration.id)
        OR (audit.old_value->>'participant_id' = v_registration.participant_id::text
          AND audit.old_value->>'item_id' = v_registration.item_id::text)
        OR (audit.new_value->>'participant_id' = v_registration.participant_id::text
          AND audit.new_value->>'item_id' = v_registration.item_id::text));

    DELETE FROM public.registrations WHERE id = v_registration.id;
  EXCEPTION WHEN foreign_key_violation THEN
    RETURN pg_catalog.jsonb_build_object('status', 'blocked',
      'message', 'Linked competition history prevents deselection. Nothing was removed.');
  END;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, old_value, new_value)
  VALUES (v_festival_tenant_id, auth.uid(), 'UNASSIGN_ITEM', 'registrations', NULL,
    pg_catalog.jsonb_build_object('status', 'removed', 'entry_kind', 'participant'));
  RETURN pg_catalog.jsonb_build_object('status', 'removed');
END;
$$;
ALTER FUNCTION public.safe_unassign_registration(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.safe_unassign_registration(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_unassign_registration(uuid, text) TO authenticated;

-- The item popup needs registration identities to submit a selected deselect.
CREATE OR REPLACE FUNCTION public.get_team_leader_program_individual_roster(p_item_id uuid)
RETURNS TABLE (
  registration_id uuid, participant_id uuid, participant_name text,
  participant_chest_number text, participant_category_code text, registration_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT registration.id, participant.id, participant.name,
         participant.chest_number, participant.category_code, registration.status
  FROM public.get_team_leader_context() AS context
  JOIN public.festival_calendar AS festival
    ON festival.id = context.festival_id AND festival.tenant_id = context.parent_tenant_id
  JOIN public.organisations AS organisation ON organisation.id = context.organisation_id
  JOIN public.get_visible_organisations(context.parent_tenant_id) AS visible
    ON visible.id = organisation.id AND visible.tenant_id = organisation.tenant_id
  JOIN public.items AS item ON item.id = p_item_id AND item.festival_id = context.festival_id
    AND (item.tenant_id IS NULL OR item.tenant_id = context.parent_tenant_id)
    AND item.participation_type = 'individual'
  JOIN public.registrations AS registration
    ON registration.item_id = item.id AND registration.festival_id = context.festival_id
    AND registration.organisation_id = context.organisation_id
    AND registration.tenant_id IN (context.parent_tenant_id, organisation.tenant_id)
    AND registration.entry_kind = 'participant'
  JOIN public.participants AS participant ON participant.id = registration.participant_id
    AND participant.festival_id = context.festival_id
    AND participant.organisation_id = context.organisation_id
    AND participant.tenant_id IN (context.parent_tenant_id, organisation.tenant_id)
  WHERE auth.uid() IS NOT NULL
    AND registration.status IS DISTINCT FROM 'rejected'
    AND registration.status IS DISTINCT FROM 'cancelled'
  ORDER BY participant.name, participant.chest_number, participant.id;
$$;
ALTER FUNCTION public.get_team_leader_program_individual_roster(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_team_leader_program_individual_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_program_individual_roster(uuid) TO authenticated;
