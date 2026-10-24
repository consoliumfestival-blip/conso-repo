-- Admin roster editing uses the same history protection as Team Leader
-- deselection. The old three-argument entry point delegates here too.
CREATE OR REPLACE FUNCTION public.update_group_team_roster(
  p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[],
  p_leader_participant_id uuid, p_expected_leader_participant_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor public.profiles;
  v_entry public.registrations;
  v_item public.items;
  v_festival_tenant_id uuid;
  v_organisation_tenant_id uuid;
  v_old uuid[];
  v_expected uuid[];
  v_new uuid[];
  v_names jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE AND v_actor.role IS DISTINCT FROM 'admin') THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_entry FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND OR v_entry.entry_kind IS DISTINCT FROM 'general_team' THEN
    RAISE EXCEPTION 'Group entry not found.' USING ERRCODE = 'P0002';
  END IF;
  SELECT festival.tenant_id, organisation.tenant_id
    INTO v_festival_tenant_id, v_organisation_tenant_id
  FROM public.festival_calendar AS festival
  JOIN public.organisations AS organisation ON organisation.id = v_entry.organisation_id
  WHERE festival.id = v_entry.festival_id;
  IF v_festival_tenant_id IS NULL OR v_organisation_tenant_id IS NULL
    OR v_entry.tenant_id IS DISTINCT FROM v_festival_tenant_id
    OR (v_actor.is_superadmin IS NOT TRUE AND (
      v_actor.tenant_id IS DISTINCT FROM v_festival_tenant_id
      OR NOT EXISTS (SELECT 1 FROM public.get_visible_organisations(v_festival_tenant_id) AS visible
        WHERE visible.id = v_entry.organisation_id AND visible.tenant_id = v_organisation_tenant_id))) THEN
    RAISE EXCEPTION 'Administrator access to this festival and team is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_item FROM public.items WHERE id = v_entry.item_id
    AND festival_id = v_entry.festival_id AND tenant_id = v_festival_tenant_id;
  IF NOT FOUND OR v_item.participation_type IS DISTINCT FROM 'group' THEN
    RAISE EXCEPTION 'Group competition not found.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'group:' || v_entry.festival_id::text || ':' || v_entry.item_id::text || ':' || v_entry.organisation_id::text, 0));
  SELECT COALESCE(pg_catalog.array_agg(member.participant_id ORDER BY member.participant_id), ARRAY[]::uuid[])
    INTO v_old FROM public.group_members AS member WHERE member.registration_id = v_entry.id;
  SELECT COALESCE(pg_catalog.array_agg(ids.id ORDER BY ids.id), ARRAY[]::uuid[])
    INTO v_expected FROM pg_catalog.unnest(p_expected_participant_ids) AS ids(id);
  IF p_expected_participant_ids IS NULL OR v_old IS DISTINCT FROM v_expected
    OR v_entry.group_leader_participant_id IS DISTINCT FROM p_expected_leader_participant_id THEN
    RAISE EXCEPTION 'This roster changed. Reload before saving.' USING ERRCODE = '40001';
  END IF;
  IF p_participant_ids IS NULL OR pg_catalog.cardinality(p_participant_ids) = 0
    OR pg_catalog.array_position(p_participant_ids, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT ids.id) FROM pg_catalog.unnest(p_participant_ids) AS ids(id))
      <> pg_catalog.cardinality(p_participant_ids) THEN
    RAISE EXCEPTION 'Select unique group members.' USING ERRCODE = '23514';
  END IF;
  IF pg_catalog.cardinality(p_participant_ids) < GREATEST(1, COALESCE(v_item.group_min_members, 1))
    OR (COALESCE(v_item.group_max_members, 0) > 0
      AND pg_catalog.cardinality(p_participant_ids) > v_item.group_max_members) THEN
    RAISE EXCEPTION 'The selected team size is outside this competition''s configured member range.' USING ERRCODE = '23514';
  END IF;
  IF p_leader_participant_id IS NULL OR NOT (p_leader_participant_id = ANY(p_participant_ids)) THEN
    RAISE EXCEPTION 'Choose a leader from the selected members.' USING ERRCODE = '23514';
  END IF;
  PERFORM group_entry_private.validate_roster(v_entry.festival_id, v_entry.item_id,
    v_entry.organisation_id, p_participant_ids);
  SELECT pg_catalog.array_agg(ids.id ORDER BY ids.id) INTO v_new
    FROM pg_catalog.unnest(p_participant_ids) AS ids(id);
  PERFORM participant.id FROM public.participants AS participant
    WHERE participant.id = ANY(v_old || v_new) ORDER BY participant.id FOR UPDATE;
  IF v_new IS NOT DISTINCT FROM v_old
    AND p_leader_participant_id IS NOT DISTINCT FROM v_entry.group_leader_participant_id THEN
    RETURN pg_catalog.jsonb_build_object('registration_id', v_entry.id, 'changed', false,
      'member_count', pg_catalog.cardinality(v_old),
      'leader_participant_id', v_entry.group_leader_participant_id,
      'entry_chest_number', (SELECT chest_number FROM public.participants WHERE id = v_entry.group_leader_participant_id));
  END IF;
  IF v_entry.is_verified IS TRUE OR v_entry.is_locked IS TRUE OR v_entry.code_letter_fixed IS TRUE
    OR v_entry.code_letter IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.group_members WHERE registration_id = v_entry.id AND is_locked IS TRUE)
    OR EXISTS (SELECT 1 FROM public.mark_entries WHERE registration_id = v_entry.id)
    OR EXISTS (SELECT 1 FROM public.results WHERE registration_id = v_entry.id)
    OR EXISTS (SELECT 1 FROM public.attendance AS attendance
      JOIN public.schedules AS schedule ON schedule.id = attendance.schedule_id
      WHERE attendance.participant_id = ANY(v_old || v_new)
        AND schedule.item_id = v_entry.item_id AND schedule.festival_id = v_entry.festival_id)
    OR EXISTS (SELECT 1 FROM public.certificates AS certificate
      WHERE certificate.participant_id = ANY(v_old || v_new) AND certificate.item_id = v_entry.item_id) THEN
    RAISE EXCEPTION 'Group roster is locked by competition history.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.registrations AS other
    WHERE other.festival_id = v_entry.festival_id AND other.item_id = v_entry.item_id
      AND other.organisation_id = v_entry.organisation_id AND other.id <> v_entry.id) THEN
    RAISE EXCEPTION 'This team has multiple historical entries. Review the conflict first.' USING ERRCODE = '23505';
  END IF;
  INSERT INTO group_entry_private.member_edit_authorizations(transaction_id, registration_id, actor_id)
  VALUES (pg_catalog.txid_current(), v_entry.id, auth.uid());
  DELETE FROM public.group_members WHERE registration_id = v_entry.id
    AND NOT (participant_id = ANY(p_participant_ids));
  INSERT INTO public.group_members(registration_id, participant_id, member_order)
  SELECT v_entry.id, ids.id, ids.position::integer
  FROM pg_catalog.unnest(p_participant_ids) WITH ORDINALITY AS ids(id, position)
  WHERE NOT EXISTS (SELECT 1 FROM public.group_members AS member
    WHERE member.registration_id = v_entry.id AND member.participant_id = ids.id);
  SELECT pg_catalog.jsonb_agg(participant.name ORDER BY ids.position)
    INTO v_names FROM pg_catalog.unnest(p_participant_ids) WITH ORDINALITY AS ids(id, position)
    JOIN public.participants AS participant ON participant.id = ids.id;
  UPDATE public.registrations SET group_leader_participant_id = p_leader_participant_id,
    raw_group_members = v_names WHERE id = v_entry.id;
  DELETE FROM group_entry_private.member_edit_authorizations
    WHERE transaction_id = pg_catalog.txid_current() AND registration_id = v_entry.id;
  DELETE FROM public.team_leader_program_completions AS completion
    WHERE completion.tenant_id = v_festival_tenant_id
      AND completion.festival_id = v_entry.festival_id
      AND completion.organisation_id = v_entry.organisation_id
      AND completion.item_id = v_entry.item_id;
  DELETE FROM public.audit_logs AS audit
    WHERE audit.tenant_id IN (v_festival_tenant_id, v_organisation_tenant_id)
      AND audit.table_name = 'registrations' AND audit.record_id = v_entry.id;
  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, new_value)
  VALUES (v_festival_tenant_id, auth.uid(), 'GROUP_ROSTER_EDIT', 'registrations',
    pg_catalog.jsonb_build_object('status', 'changed'));
  RETURN pg_catalog.jsonb_build_object('registration_id', v_entry.id, 'changed', true,
    'member_count', pg_catalog.cardinality(p_participant_ids),
    'leader_participant_id', p_leader_participant_id,
    'entry_chest_number', (SELECT chest_number FROM public.participants WHERE id = p_leader_participant_id));
END;
$$;
ALTER FUNCTION public.update_group_team_roster(uuid, uuid[], uuid[], uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_group_team_roster(uuid, uuid[], uuid[], uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_group_team_roster(uuid, uuid[], uuid[], uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_general_team_roster(
  p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_leader uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS actor
    WHERE actor.id = auth.uid()
      AND (actor.is_superadmin IS TRUE OR actor.role IN ('admin', 'admin_leader'))
  ) THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  SELECT group_leader_participant_id INTO v_leader FROM public.registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group entry not found.' USING ERRCODE = 'P0002';
  END IF;
  RETURN public.update_group_team_roster(p_registration_id, p_participant_ids,
    p_expected_participant_ids, v_leader, v_leader);
END;
$$;
ALTER FUNCTION public.update_general_team_roster(uuid, uuid[], uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_general_team_roster(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_general_team_roster(uuid, uuid[], uuid[]) TO authenticated;
