-- Group substitution approval always promotes the selected replacement to leader.
-- The existing Admin approval, tenant scope, locks, history checks, audit and
-- request lifecycle are preserved; this migration only tightens leader eligibility.
BEGIN;
CREATE OR REPLACE FUNCTION public.team_leader_request_group_substitution(
  p_registration_id uuid, p_old_participant_id uuid,
  p_new_participant_id uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_context record;
  v_entry public.registrations%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_org public.organisations%ROWTYPE;
  v_old public.participants%ROWTYPE;
  v_new public.participants%ROWTYPE;
  v_roster uuid[];
  v_request_id uuid;
  v_pending_id uuid;
  v_block text;
  v_member_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_actor.role IS DISTINCT FROM 'team_leader' THEN
    RAISE EXCEPTION 'Only a Team Leader can request this substitution.' USING ERRCODE = '42501';
  END IF;
  IF p_registration_id IS NULL OR p_old_participant_id IS NULL OR p_new_participant_id IS NULL
     OR p_old_participant_id = p_new_participant_id OR p_reason IS NULL
     OR length(btrim(p_reason)) = 0 OR length(p_reason) > 1000 THEN
    RAISE EXCEPTION 'Choose distinct group members and provide a reason (up to 1000 characters).' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_entry FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND OR v_entry.entry_kind IS DISTINCT FROM 'general_team'
     OR v_entry.festival_id IS DISTINCT FROM v_context.festival_id
     OR v_entry.organisation_id IS DISTINCT FROM v_context.organisation_id
     OR v_entry.tenant_id IS DISTINCT FROM v_context.parent_tenant_id THEN
    RAISE EXCEPTION 'This group assignment is outside your team.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_item FROM public.items WHERE id = v_entry.item_id
    AND festival_id = v_entry.festival_id AND tenant_id = v_context.parent_tenant_id
    AND participation_type = 'group' AND is_active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An active group program is required.' USING ERRCODE = '22023'; END IF;
  IF public.team_leader_program_assignment_is_locked(v_entry.festival_id, v_entry.item_id) THEN
    RAISE EXCEPTION 'Team Leader group assignment changes are locked.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_org FROM public.organisations WHERE id = v_entry.organisation_id;
  IF NOT FOUND OR v_org.tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) AS visible
    WHERE visible.id = v_org.id AND visible.tenant_id = v_org.tenant_id) THEN
    RAISE EXCEPTION 'The assigned team is outside the festival tenant scope.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'group:' || v_entry.festival_id::text || ':' || v_entry.item_id::text || ':' || v_entry.organisation_id::text, 0));
  v_block := team_substitution_private.group_block_reason(v_entry.id, p_old_participant_id, p_new_participant_id);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = '55000'; END IF;
  PERFORM participant.id FROM public.participants AS participant
    WHERE participant.id IN (p_old_participant_id, p_new_participant_id)
    ORDER BY participant.id FOR UPDATE;
  SELECT * INTO v_old FROM public.participants WHERE id = p_old_participant_id;
  SELECT * INTO v_new FROM public.participants WHERE id = p_new_participant_id;
  IF v_old.id IS NULL OR v_new.id IS NULL
     OR v_old.festival_id IS DISTINCT FROM v_entry.festival_id
     OR v_new.festival_id IS DISTINCT FROM v_entry.festival_id
     OR v_old.organisation_id IS DISTINCT FROM v_entry.organisation_id
     OR v_new.organisation_id IS DISTINCT FROM v_entry.organisation_id
     OR v_old.tenant_id IS NULL OR v_old.tenant_id NOT IN (v_context.parent_tenant_id, v_org.tenant_id)
     OR v_new.tenant_id IS NULL OR v_new.tenant_id NOT IN (v_context.parent_tenant_id, v_org.tenant_id) THEN
    RAISE EXCEPTION 'The replacement must belong to the same team and festival.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(v_new.chest_number), '') IS NULL THEN
    RAISE EXCEPTION 'A replacement group leader needs a chest number.' USING ERRCODE = '23514';
  END IF;
  SELECT array_agg(CASE WHEN member.participant_id = p_old_participant_id
    THEN p_new_participant_id ELSE member.participant_id END ORDER BY member.member_order NULLS LAST, member.id)
    INTO v_roster FROM public.group_members AS member WHERE member.registration_id = v_entry.id;
  PERFORM group_entry_private.validate_roster(v_entry.festival_id, v_entry.item_id, v_entry.organisation_id, v_roster);
  SELECT member.id INTO v_member_id FROM public.group_members AS member
    WHERE member.registration_id = v_entry.id AND member.participant_id = p_old_participant_id;
  BEGIN
    INSERT INTO team_substitution_private.requests (
      tenant_id, festival_id, organisation_id, item_id, registration_id,
      old_participant_id, old_participant_name, old_chest_number,
      new_participant_id, new_participant_name, new_chest_number,
      item_code, item_name, team_name, reason, requested_by, entry_kind,
      group_member_id, old_was_group_leader
    ) VALUES (
      v_context.parent_tenant_id, v_entry.festival_id, v_entry.organisation_id, v_entry.item_id, v_entry.id,
      v_old.id, v_old.name, v_old.chest_number, v_new.id, v_new.name, v_new.chest_number,
      v_item.item_code, coalesce(nullif(v_item.item_name_en, ''), nullif(v_item.item_name_ml, ''), v_item.item_code, 'Program'),
      coalesce(v_org.name, 'Team'), btrim(p_reason), auth.uid(), 'general_team',
      v_member_id, coalesce(v_entry.group_leader_participant_id = p_old_participant_id, false)
    ) RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT request.id INTO v_pending_id FROM team_substitution_private.requests AS request
    WHERE request.status = 'pending_approval' AND (request.registration_id = v_entry.id
      OR (request.item_id = v_entry.item_id AND request.new_participant_id = p_new_participant_id))
    LIMIT 1;
    RETURN jsonb_build_object('status', 'pending_exists', 'request_id', v_pending_id);
  END;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_context.parent_tenant_id, auth.uid(), 'TEAM_LEADER_GROUP_SUBSTITUTION_REQUESTED',
    'team_substitution_requests', v_request_id,
    jsonb_build_object('registration_id', v_entry.id, 'participant_id', v_old.id),
    jsonb_build_object('item_id', v_item.id, 'new_participant_id', v_new.id,
      'reason', btrim(p_reason), 'status', 'pending_approval', 'entry_kind', 'general_team'));
  RETURN jsonb_build_object('status', 'pending_approval', 'request_id', v_request_id);
END;
$$;
ALTER FUNCTION public.team_leader_request_group_substitution(uuid, uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.team_leader_request_group_substitution(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_leader_request_group_substitution(uuid, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION team_substitution_private.review_group_substitution(
  p_request_id uuid, p_tenant_id uuid, p_admin_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_request team_substitution_private.requests%ROWTYPE;
  v_entry public.registrations%ROWTYPE;
  v_org public.organisations%ROWTYPE;
  v_old public.participants%ROWTYPE;
  v_new public.participants%ROWTYPE;
  v_roster uuid[];
  v_block text;
  v_names jsonb;
BEGIN
  SELECT * INTO v_request FROM team_substitution_private.requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.entry_kind IS DISTINCT FROM 'general_team'
     OR v_request.status IS DISTINCT FROM 'pending_approval'
     OR v_request.tenant_id IS DISTINCT FROM p_tenant_id
     OR team_substitution_private.assert_admin_festival(v_request.festival_id) IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'This request is outside your administrator scope.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_entry FROM public.registrations WHERE id = v_request.registration_id FOR UPDATE;
  IF NOT FOUND OR v_entry.entry_kind IS DISTINCT FROM 'general_team'
     OR v_entry.tenant_id IS DISTINCT FROM p_tenant_id
     OR v_entry.festival_id IS DISTINCT FROM v_request.festival_id
     OR v_entry.item_id IS DISTINCT FROM v_request.item_id
     OR v_entry.organisation_id IS DISTINCT FROM v_request.organisation_id THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, p_tenant_id, 'The original group assignment changed.');
  END IF;
  IF coalesce(v_entry.group_leader_participant_id = v_request.old_participant_id, false)
       IS DISTINCT FROM v_request.old_was_group_leader
     OR NOT EXISTS (SELECT 1 FROM public.group_members AS member
       WHERE member.id = v_request.group_member_id
         AND member.registration_id = v_entry.id
         AND member.participant_id = v_request.old_participant_id) THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, p_tenant_id, 'The group member or leader changed.');
  END IF;
  SELECT * INTO v_org FROM public.organisations WHERE id = v_entry.organisation_id;
  IF NOT FOUND OR v_org.tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(p_tenant_id) AS visible
    WHERE visible.id = v_org.id AND visible.tenant_id = v_org.tenant_id) THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, p_tenant_id, 'The team is no longer available in this tenant.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.items AS item WHERE item.id = v_entry.item_id
      AND item.festival_id = v_entry.festival_id AND item.tenant_id = p_tenant_id
      AND item.participation_type = 'group' AND item.is_active IS TRUE) THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, p_tenant_id, 'The group program is no longer active.');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'group:' || v_entry.festival_id::text || ':' || v_entry.item_id::text || ':' || v_entry.organisation_id::text, 0));
  v_block := team_substitution_private.group_block_reason(v_entry.id, v_request.old_participant_id, v_request.new_participant_id);
  IF v_block IS NOT NULL THEN RETURN team_substitution_private.close_stale_request(p_request_id, p_tenant_id, v_block); END IF;
  PERFORM participant.id FROM public.participants AS participant
    WHERE participant.id IN (v_request.old_participant_id, v_request.new_participant_id)
    ORDER BY participant.id FOR UPDATE;
  SELECT * INTO v_old FROM public.participants WHERE id = v_request.old_participant_id;
  SELECT * INTO v_new FROM public.participants WHERE id = v_request.new_participant_id;
  IF v_old.id IS NULL OR v_new.id IS NULL
     OR v_old.festival_id IS DISTINCT FROM v_entry.festival_id
     OR v_new.festival_id IS DISTINCT FROM v_entry.festival_id
     OR v_old.organisation_id IS DISTINCT FROM v_entry.organisation_id
     OR v_new.organisation_id IS DISTINCT FROM v_entry.organisation_id
     OR v_old.tenant_id IS NULL OR v_old.tenant_id NOT IN (p_tenant_id, v_org.tenant_id)
     OR v_new.tenant_id IS NULL OR v_new.tenant_id NOT IN (p_tenant_id, v_org.tenant_id)
     OR nullif(btrim(v_new.chest_number), '') IS NULL THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, p_tenant_id, 'The replacement is no longer eligible for this group.');
  END IF;
  SELECT array_agg(CASE WHEN member.participant_id = v_request.old_participant_id
    THEN v_request.new_participant_id ELSE member.participant_id END ORDER BY member.member_order NULLS LAST, member.id)
    INTO v_roster FROM public.group_members AS member WHERE member.registration_id = v_entry.id;
  BEGIN
    PERFORM group_entry_private.validate_roster(v_entry.festival_id, v_entry.item_id, v_entry.organisation_id, v_roster);
  EXCEPTION WHEN check_violation THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, p_tenant_id, 'The replacement is no longer eligible for this group.');
  END;
  -- Existing group guards require a transaction-scoped authorization to move
  -- the leader. The Admin approval remains the only public write path here.
  INSERT INTO group_entry_private.member_edit_authorizations(transaction_id, registration_id, actor_id)
    VALUES (pg_catalog.txid_current(), v_entry.id, auth.uid());
  BEGIN
    UPDATE public.group_members SET participant_id = v_request.new_participant_id
      WHERE id = v_request.group_member_id AND registration_id = v_entry.id
        AND participant_id = v_request.old_participant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Group member changed.' USING ERRCODE = '40001'; END IF;
    SELECT jsonb_agg(participant.name ORDER BY member.member_order NULLS LAST, member.id)
      INTO v_names FROM public.group_members AS member
      JOIN public.participants AS participant ON participant.id = member.participant_id
      WHERE member.registration_id = v_entry.id;
    UPDATE public.registrations SET
      group_leader_participant_id = v_request.new_participant_id,
      raw_group_members = v_names WHERE id = v_entry.id;
  EXCEPTION WHEN unique_violation OR check_violation THEN
    DELETE FROM group_entry_private.member_edit_authorizations
      WHERE transaction_id = pg_catalog.txid_current() AND registration_id = v_entry.id;
    RETURN jsonb_build_object('status', 'blocked', 'message', 'The group roster could not be safely updated. No substitution was applied.');
  END;
  DELETE FROM group_entry_private.member_edit_authorizations
    WHERE transaction_id = pg_catalog.txid_current() AND registration_id = v_entry.id;
  -- A completed program can accept an approved substitution. Its prior
  -- completion must be invalidated after the roster changes.
  DELETE FROM public.team_leader_program_completions AS completion
    WHERE completion.tenant_id = p_tenant_id
      AND completion.festival_id = v_entry.festival_id
      AND completion.organisation_id = v_entry.organisation_id
      AND completion.item_id = v_entry.item_id;
  UPDATE team_substitution_private.requests SET status = 'approved',
    decided_by = auth.uid(), decided_at = now(), admin_reason = nullif(btrim(p_admin_reason), '')
    WHERE id = p_request_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (p_tenant_id, auth.uid(), 'TEAM_LEADER_GROUP_SUBSTITUTION_APPROVED', 'registrations', v_entry.id,
    jsonb_build_object('request_id', p_request_id, 'participant_id', v_request.old_participant_id,
      'leader_participant_id', v_entry.group_leader_participant_id),
    jsonb_build_object('request_id', p_request_id, 'participant_id', v_request.new_participant_id,
      'leader_participant_id', v_request.new_participant_id, 'status', 'approved'));
  RETURN jsonb_build_object('status', 'approved', 'registration_id', v_entry.id);
END;
$$;
ALTER FUNCTION team_substitution_private.review_group_substitution(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION team_substitution_private.review_group_substitution(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

COMMIT;