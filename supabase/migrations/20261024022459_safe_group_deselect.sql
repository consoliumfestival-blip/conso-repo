-- A single member can leave a still-valid group. Deleting the whole entry is
-- a separate action because it affects every remaining teammate.
CREATE OR REPLACE FUNCTION public.safe_remove_group_member(
  p_registration_id uuid, p_participant_id uuid,
  p_expected_member_ids uuid[], p_replacement_leader_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor public.profiles;
  v_context record;
  v_entry public.registrations;
  v_item public.items;
  v_festival_tenant_id uuid;
  v_organisation_tenant_id uuid;
  v_members uuid[];
  v_expected uuid[];
  v_remaining uuid[];
  v_new_leader uuid;
  v_names jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE
    AND (v_actor.role IS NULL OR v_actor.role NOT IN ('admin', 'team_leader'))) THEN
    RAISE EXCEPTION 'Administrator or Team Leader access is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_entry FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  IF v_entry.entry_kind IS DISTINCT FROM 'general_team' THEN
    RAISE EXCEPTION 'Select a group entry.' USING ERRCODE = '22023';
  END IF;
  SELECT festival.tenant_id, organisation.tenant_id
    INTO v_festival_tenant_id, v_organisation_tenant_id
  FROM public.festival_calendar AS festival
  JOIN public.organisations AS organisation ON organisation.id = v_entry.organisation_id
  WHERE festival.id = v_entry.festival_id;
  IF v_festival_tenant_id IS NULL OR v_organisation_tenant_id IS NULL
    OR v_entry.tenant_id IS DISTINCT FROM v_festival_tenant_id THEN
    RAISE EXCEPTION 'This group entry is outside its festival tenant.' USING ERRCODE = '42501';
  END IF;
  IF v_actor.role = 'team_leader' AND v_actor.is_superadmin IS NOT TRUE THEN
    SELECT * INTO v_context FROM public.get_team_leader_context();
    IF NOT FOUND OR v_context.parent_tenant_id IS DISTINCT FROM v_festival_tenant_id
      OR v_context.festival_id IS DISTINCT FROM v_entry.festival_id
      OR v_context.organisation_id IS DISTINCT FROM v_entry.organisation_id THEN
      RAISE EXCEPTION 'This group is outside your current team assignment.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor.is_superadmin IS NOT TRUE AND (
    v_actor.tenant_id IS DISTINCT FROM v_festival_tenant_id
    OR NOT EXISTS (SELECT 1 FROM public.get_visible_organisations(v_festival_tenant_id) AS visible
      WHERE visible.id = v_entry.organisation_id AND visible.tenant_id = v_organisation_tenant_id)
  ) THEN
    RAISE EXCEPTION 'Administrator access to this festival and team is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_item FROM public.items AS item WHERE item.id = v_entry.item_id
    AND item.festival_id = v_entry.festival_id AND item.tenant_id = v_festival_tenant_id;
  IF NOT FOUND OR v_item.participation_type IS DISTINCT FROM 'group' THEN
    RAISE EXCEPTION 'Group competition not found.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'group:' || v_entry.festival_id::text || ':' || v_entry.item_id::text || ':' || v_entry.organisation_id::text, 0));
  SELECT COALESCE(pg_catalog.array_agg(member.participant_id ORDER BY member.participant_id), ARRAY[]::uuid[])
    INTO v_members FROM public.group_members AS member WHERE member.registration_id = v_entry.id;
  PERFORM participant.id FROM public.participants AS participant
    WHERE participant.id = ANY(v_members) ORDER BY participant.id FOR UPDATE;
  SELECT COALESCE(pg_catalog.array_agg(ids.id ORDER BY ids.id), ARRAY[]::uuid[])
    INTO v_expected FROM pg_catalog.unnest(p_expected_member_ids) AS ids(id);
  IF p_expected_member_ids IS NULL OR v_members IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'This roster changed. Reload before saving.' USING ERRCODE = '40001';
  END IF;
  IF p_participant_id IS NULL OR NOT (p_participant_id = ANY(v_members)) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(ids.id ORDER BY ids.id), ARRAY[]::uuid[])
    INTO v_remaining FROM pg_catalog.unnest(v_members) AS ids(id) WHERE ids.id <> p_participant_id;
  IF pg_catalog.cardinality(v_remaining) < GREATEST(1, COALESCE(v_item.group_min_members, 1)) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'blocked', 'message',
      'Removing this member would leave too few students. Remove the whole group entry instead.');
  END IF;
  v_new_leader := v_entry.group_leader_participant_id;
  IF v_new_leader IS NOT DISTINCT FROM p_participant_id THEN
    IF p_replacement_leader_id IS NULL OR NOT (p_replacement_leader_id = ANY(v_remaining)) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'blocked',
        'message', 'Select a remaining member as the replacement group leader.');
    END IF;
    v_new_leader := p_replacement_leader_id;
  ELSIF p_replacement_leader_id IS NOT NULL
    AND p_replacement_leader_id IS DISTINCT FROM v_new_leader THEN
    RAISE EXCEPTION 'A leader change is only required when removing the current leader.' USING ERRCODE = '22023';
  END IF;

  IF v_entry.is_verified IS TRUE OR v_entry.is_locked IS TRUE OR v_entry.code_letter_fixed IS TRUE
    OR v_entry.code_letter IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.group_members WHERE registration_id = v_entry.id AND is_locked IS TRUE)
    OR EXISTS (SELECT 1 FROM public.mark_entries WHERE registration_id = v_entry.id)
    OR EXISTS (SELECT 1 FROM public.results WHERE registration_id = v_entry.id)
    OR EXISTS (SELECT 1 FROM public.attendance AS attendance
      JOIN public.schedules AS schedule ON schedule.id = attendance.schedule_id
      WHERE attendance.participant_id = ANY(v_members)
        AND schedule.festival_id = v_entry.festival_id AND schedule.item_id = v_entry.item_id)
    OR EXISTS (SELECT 1 FROM public.certificates AS certificate
      WHERE certificate.participant_id = ANY(v_members) AND certificate.item_id = v_entry.item_id) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'blocked',
      'message', 'This group has check-in, marks, results or other competition history. Its roster must be preserved.');
  END IF;

  BEGIN
    INSERT INTO group_entry_private.member_edit_authorizations(transaction_id, registration_id, actor_id)
    VALUES (pg_catalog.txid_current(), v_entry.id, auth.uid());
    DELETE FROM public.group_members WHERE registration_id = v_entry.id AND participant_id = p_participant_id;
    SELECT pg_catalog.jsonb_agg(participant.name ORDER BY member.member_order NULLS LAST, member.participant_id)
      INTO v_names FROM public.group_members AS member
      JOIN public.participants AS participant ON participant.id = member.participant_id
      WHERE member.registration_id = v_entry.id;
    UPDATE public.registrations SET group_leader_participant_id = v_new_leader,
      raw_group_members = v_names WHERE id = v_entry.id;
    DELETE FROM group_entry_private.member_edit_authorizations
      WHERE transaction_id = pg_catalog.txid_current() AND registration_id = v_entry.id;

    DELETE FROM public.team_leader_program_completions AS completion
    WHERE completion.tenant_id = v_festival_tenant_id
      AND completion.festival_id = v_entry.festival_id
      AND completion.organisation_id = v_entry.organisation_id
      AND completion.item_id = v_entry.item_id
      AND p_participant_id = ANY(completion.assigned_participant_ids);
    DELETE FROM public.audit_logs AS audit
    WHERE audit.tenant_id IN (v_festival_tenant_id, v_organisation_tenant_id)
      AND audit.table_name = 'registrations' AND audit.record_id = v_entry.id;
  EXCEPTION WHEN foreign_key_violation THEN
    RETURN pg_catalog.jsonb_build_object('status', 'blocked',
      'message', 'Linked competition history prevents this roster change. Nothing was removed.');
  END;
  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, new_value)
  VALUES (v_festival_tenant_id, auth.uid(), 'GROUP_MEMBER_UNASSIGN', 'registrations',
    pg_catalog.jsonb_build_object('status', 'removed'));
  RETURN pg_catalog.jsonb_build_object('status', 'removed');
END;
$$;
ALTER FUNCTION public.safe_remove_group_member(uuid, uuid, uuid[], uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.safe_remove_group_member(uuid, uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_remove_group_member(uuid, uuid, uuid[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.safe_delete_group_entry(p_registration_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor public.profiles;
  v_context record;
  v_entry public.registrations;
  v_festival_tenant_id uuid;
  v_organisation_tenant_id uuid;
  v_members uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE
    AND (v_actor.role IS NULL OR v_actor.role NOT IN ('admin', 'team_leader'))) THEN
    RAISE EXCEPTION 'Administrator or Team Leader access is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_entry FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  IF v_entry.entry_kind IS DISTINCT FROM 'general_team'
    OR v_entry.is_group_registration IS NOT TRUE OR v_entry.participant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Select a group entry.' USING ERRCODE = '22023';
  END IF;
  SELECT festival.tenant_id, organisation.tenant_id
    INTO v_festival_tenant_id, v_organisation_tenant_id
  FROM public.festival_calendar AS festival
  JOIN public.organisations AS organisation ON organisation.id = v_entry.organisation_id
  WHERE festival.id = v_entry.festival_id;
  IF v_festival_tenant_id IS NULL OR v_organisation_tenant_id IS NULL
    OR v_entry.tenant_id IS DISTINCT FROM v_festival_tenant_id THEN
    RAISE EXCEPTION 'This group entry is outside its festival tenant.' USING ERRCODE = '42501';
  END IF;
  IF v_actor.role = 'team_leader' AND v_actor.is_superadmin IS NOT TRUE THEN
    SELECT * INTO v_context FROM public.get_team_leader_context();
    IF NOT FOUND OR v_context.parent_tenant_id IS DISTINCT FROM v_festival_tenant_id
      OR v_context.festival_id IS DISTINCT FROM v_entry.festival_id
      OR v_context.organisation_id IS DISTINCT FROM v_entry.organisation_id THEN
      RAISE EXCEPTION 'This group is outside your current team assignment.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor.is_superadmin IS NOT TRUE AND (
    v_actor.tenant_id IS DISTINCT FROM v_festival_tenant_id
    OR NOT EXISTS (SELECT 1 FROM public.get_visible_organisations(v_festival_tenant_id) AS visible
      WHERE visible.id = v_entry.organisation_id AND visible.tenant_id = v_organisation_tenant_id)
  ) THEN
    RAISE EXCEPTION 'Administrator access to this festival and team is required.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'group:' || v_entry.festival_id::text || ':' || v_entry.item_id::text || ':' || v_entry.organisation_id::text, 0));
  SELECT COALESCE(pg_catalog.array_agg(member.participant_id ORDER BY member.participant_id), ARRAY[]::uuid[])
    INTO v_members FROM public.group_members AS member WHERE member.registration_id = v_entry.id;
  PERFORM participant.id FROM public.participants AS participant
    WHERE participant.id = ANY(v_members) ORDER BY participant.id FOR UPDATE;
  IF v_entry.is_verified IS TRUE OR v_entry.is_locked IS TRUE OR v_entry.code_letter_fixed IS TRUE
    OR v_entry.code_letter IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.group_members WHERE registration_id = v_entry.id AND is_locked IS TRUE)
    OR EXISTS (SELECT 1 FROM public.mark_entries WHERE registration_id = v_entry.id)
    OR EXISTS (SELECT 1 FROM public.results WHERE registration_id = v_entry.id)
    OR EXISTS (SELECT 1 FROM public.attendance AS attendance
      JOIN public.schedules AS schedule ON schedule.id = attendance.schedule_id
      WHERE attendance.participant_id = ANY(v_members)
        AND schedule.festival_id = v_entry.festival_id AND schedule.item_id = v_entry.item_id)
    OR EXISTS (SELECT 1 FROM public.certificates AS certificate
      WHERE certificate.participant_id = ANY(v_members) AND certificate.item_id = v_entry.item_id) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'blocked',
      'message', 'This group has check-in, marks, results or other competition history. Its entry must be preserved.');
  END IF;
  BEGIN
    DELETE FROM public.team_leader_program_completions AS completion
    WHERE completion.tenant_id = v_festival_tenant_id
      AND completion.festival_id = v_entry.festival_id
      AND completion.organisation_id = v_entry.organisation_id
      AND completion.item_id = v_entry.item_id;
    DELETE FROM public.audit_logs AS audit
    WHERE audit.tenant_id IN (v_festival_tenant_id, v_organisation_tenant_id)
      AND audit.table_name = 'registrations' AND audit.record_id = v_entry.id;
    DELETE FROM public.group_members WHERE registration_id = v_entry.id;
    DELETE FROM public.registrations WHERE id = v_entry.id;
  EXCEPTION WHEN foreign_key_violation THEN
    RETURN pg_catalog.jsonb_build_object('status', 'blocked',
      'message', 'Linked competition history prevents deletion. Nothing was removed.');
  END;
  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, new_value)
  VALUES (v_festival_tenant_id, auth.uid(), 'GROUP_ENTRY_DELETE', 'registrations',
    pg_catalog.jsonb_build_object('status', 'removed'));
  RETURN pg_catalog.jsonb_build_object('status', 'removed');
END;
$$;
ALTER FUNCTION public.safe_delete_group_entry(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.safe_delete_group_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_delete_group_entry(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.safe_delete_group_entry_if_unchanged(
  p_registration_id uuid, p_expected_member_ids uuid[]
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_entry public.registrations;
  v_actor public.profiles;
  v_context record;
  v_owner uuid;
  v_organisation_tenant uuid;
  v_current uuid[];
  v_expected uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE
    AND (v_actor.role IS NULL OR v_actor.role NOT IN ('admin', 'team_leader'))) THEN
    RAISE EXCEPTION 'Administrator or Team Leader access is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_entry FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  SELECT festival.tenant_id, organisation.tenant_id INTO v_owner, v_organisation_tenant
  FROM public.festival_calendar AS festival
  JOIN public.organisations AS organisation ON organisation.id = v_entry.organisation_id
  WHERE festival.id = v_entry.festival_id;
  IF v_owner IS NULL OR v_organisation_tenant IS NULL
    OR v_entry.tenant_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'This group entry is outside its festival tenant.' USING ERRCODE = '42501';
  END IF;
  IF v_actor.role = 'team_leader' AND v_actor.is_superadmin IS NOT TRUE THEN
    SELECT * INTO v_context FROM public.get_team_leader_context();
    IF NOT FOUND OR v_context.parent_tenant_id IS DISTINCT FROM v_owner
      OR v_context.festival_id IS DISTINCT FROM v_entry.festival_id
      OR v_context.organisation_id IS DISTINCT FROM v_entry.organisation_id THEN
      RAISE EXCEPTION 'This group is outside your current team assignment.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor.is_superadmin IS NOT TRUE AND (
    v_actor.tenant_id IS DISTINCT FROM v_owner
    OR NOT EXISTS (SELECT 1 FROM public.get_visible_organisations(v_owner) AS visible
      WHERE visible.id = v_entry.organisation_id AND visible.tenant_id = v_organisation_tenant)
  ) THEN
    RAISE EXCEPTION 'Administrator access to this festival and team is required.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(member.participant_id ORDER BY member.participant_id), ARRAY[]::uuid[])
    INTO v_current FROM public.group_members AS member WHERE member.registration_id = p_registration_id;
  SELECT COALESCE(pg_catalog.array_agg(ids.id ORDER BY ids.id), ARRAY[]::uuid[])
    INTO v_expected FROM pg_catalog.unnest(p_expected_member_ids) AS ids(id);
  IF p_expected_member_ids IS NULL OR v_current IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'This roster changed. Reload before deleting the group.' USING ERRCODE = '40001';
  END IF;
  RETURN public.safe_delete_group_entry(p_registration_id);
END;
$$;
ALTER FUNCTION public.safe_delete_group_entry_if_unchanged(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.safe_delete_group_entry_if_unchanged(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_delete_group_entry_if_unchanged(uuid, uuid[]) TO authenticated;
