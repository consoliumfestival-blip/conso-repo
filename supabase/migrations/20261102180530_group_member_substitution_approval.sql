-- Extend the existing approval queue to group roster members. Individual RPCs
-- retain their signatures and behavior; the review dispatcher below routes by kind.
BEGIN;

ALTER TABLE team_substitution_private.requests
  ADD COLUMN entry_kind text NOT NULL DEFAULT 'participant'
    CONSTRAINT team_substitution_request_entry_kind_check
    CHECK (entry_kind IN ('participant', 'general_team')),
  ADD COLUMN group_member_id uuid,
  ADD COLUMN old_was_group_leader boolean,
  ADD CONSTRAINT team_substitution_group_identity_check
    CHECK ((entry_kind = 'participant' AND group_member_id IS NULL AND old_was_group_leader IS NULL)
      OR (entry_kind = 'general_team' AND group_member_id IS NOT NULL AND old_was_group_leader IS NOT NULL));

-- Both request and approval take the registration lock before this check.
CREATE OR REPLACE FUNCTION team_substitution_private.group_block_reason(
  p_registration_id uuid, p_old_participant_id uuid, p_new_participant_id uuid
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_entry public.registrations%ROWTYPE; v_members uuid[];
BEGIN
  SELECT * INTO v_entry FROM public.registrations WHERE id = p_registration_id;
  IF NOT FOUND OR v_entry.entry_kind IS DISTINCT FROM 'general_team'
     OR v_entry.status IN ('rejected', 'cancelled') THEN
    RETURN 'The group assignment is no longer active.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members
      WHERE registration_id = p_registration_id AND participant_id = p_old_participant_id)
     OR EXISTS (SELECT 1 FROM public.group_members
      WHERE registration_id = p_registration_id AND participant_id = p_new_participant_id) THEN
    RETURN 'The group roster changed or the replacement is already a member.';
  END IF;
  PERFORM schedule.id FROM public.schedules AS schedule
  WHERE schedule.festival_id = v_entry.festival_id AND schedule.item_id = v_entry.item_id
  ORDER BY schedule.id FOR UPDATE NOWAIT;
  IF EXISTS (SELECT 1 FROM public.schedules AS schedule
      WHERE schedule.festival_id = v_entry.festival_id AND schedule.item_id = v_entry.item_id
        AND (lower(coalesce(schedule.status, 'scheduled')) IN ('ongoing', 'in_progress', 'completed')
          OR schedule.substage_checkin_started_at IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.schedule_substage_submissions AS submitted
            WHERE submitted.schedule_id = schedule.id)))
     OR EXISTS (SELECT 1 FROM public.registrations AS checked
      WHERE checked.festival_id = v_entry.festival_id AND checked.item_id = v_entry.item_id
        AND checked.status IS DISTINCT FROM 'rejected'
        AND checked.status IS DISTINCT FROM 'cancelled'
        AND (checked.is_verified IS TRUE OR checked.is_locked IS TRUE
          OR checked.checkin_cancelled IS TRUE OR checked.code_letter IS NOT NULL
          OR checked.code_letter_fixed IS TRUE)) THEN
    RETURN 'Check-in or the competition workflow has already started.';
  END IF;
  SELECT coalesce(array_agg(member.participant_id), ARRAY[]::uuid[]) INTO v_members
  FROM public.group_members AS member WHERE member.registration_id = v_entry.id;
  IF v_entry.is_verified IS TRUE OR v_entry.is_locked IS TRUE
     OR v_entry.checkin_cancelled IS TRUE OR v_entry.code_letter IS NOT NULL
     OR v_entry.code_letter_fixed IS TRUE
     OR EXISTS (SELECT 1 FROM public.group_members AS member
       WHERE member.registration_id = v_entry.id AND member.is_locked IS TRUE)
     OR EXISTS (SELECT 1 FROM public.mark_entries WHERE registration_id = v_entry.id)
     OR EXISTS (SELECT 1 FROM public.results WHERE registration_id = v_entry.id)
     OR EXISTS (SELECT 1 FROM public.attendance AS attendance
       JOIN public.schedules AS schedule ON schedule.id = attendance.schedule_id
       WHERE attendance.participant_id = ANY(v_members || p_new_participant_id)
         AND schedule.festival_id = v_entry.festival_id AND schedule.item_id = v_entry.item_id)
     OR EXISTS (SELECT 1 FROM public.certificates AS certificate
       WHERE certificate.participant_id = ANY(v_members || p_new_participant_id)
         AND certificate.item_id = v_entry.item_id)
     OR EXISTS (SELECT 1 FROM public.registrations AS other
       WHERE other.festival_id = v_entry.festival_id AND other.item_id = v_entry.item_id
         AND other.organisation_id = v_entry.organisation_id AND other.id <> v_entry.id) THEN
    RETURN 'Group roster is locked by competition history or conflicting entries.';
  END IF;
  RETURN NULL;
END;
$$;
ALTER FUNCTION team_substitution_private.group_block_reason(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION team_substitution_private.group_block_reason(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

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
  IF v_entry.group_leader_participant_id = p_old_participant_id
     AND nullif(btrim(v_new.chest_number), '') IS NULL THEN
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

CREATE OR REPLACE FUNCTION public.get_team_leader_group_substitution_requests(p_item_id uuid)
RETURNS TABLE (
  request_id uuid, registration_id uuid, old_participant_id uuid,
  old_participant_name text, old_chest_number text, new_participant_id uuid,
  new_participant_name text, new_chest_number text, reason text,
  status text, admin_reason text, requested_at timestamptz, decided_at timestamptz,
  old_is_leader boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT ON (request.registration_id)
    request.id, request.registration_id, request.old_participant_id,
    request.old_participant_name, request.old_chest_number,
    request.new_participant_id, request.new_participant_name, request.new_chest_number,
    request.reason, request.status, request.admin_reason, request.requested_at, request.decided_at,
    request.old_was_group_leader
  FROM public.get_team_leader_context() AS context
  JOIN team_substitution_private.requests AS request
    ON request.tenant_id = context.parent_tenant_id
   AND request.festival_id = context.festival_id
   AND request.organisation_id = context.organisation_id
   AND request.item_id = p_item_id AND request.entry_kind = 'general_team'
  JOIN public.items AS item ON item.id = request.item_id
    AND item.festival_id = context.festival_id
    AND item.tenant_id = context.parent_tenant_id AND item.participation_type = 'group'
  WHERE auth.uid() IS NOT NULL
  ORDER BY request.registration_id, request.requested_at DESC, request.id DESC;
$$;
ALTER FUNCTION public.get_team_leader_group_substitution_requests(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_team_leader_group_substitution_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_group_substitution_requests(uuid) TO authenticated;

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
     OR (v_entry.group_leader_participant_id = v_request.old_participant_id
       AND nullif(btrim(v_new.chest_number), '') IS NULL) THEN
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
      group_leader_participant_id = CASE WHEN v_entry.group_leader_participant_id = v_request.old_participant_id
        THEN v_request.new_participant_id ELSE v_entry.group_leader_participant_id END,
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
      'leader_participant_id', CASE WHEN v_entry.group_leader_participant_id = v_request.old_participant_id
        THEN v_request.new_participant_id ELSE v_entry.group_leader_participant_id END, 'status', 'approved'));
  RETURN jsonb_build_object('status', 'approved', 'registration_id', v_entry.id);
END;
$$;
ALTER FUNCTION team_substitution_private.review_group_substitution(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION team_substitution_private.review_group_substitution(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- The existing Admin queue reads this table and therefore includes group
-- requests. The existing review RPC is redefined below with one group branch.
CREATE OR REPLACE FUNCTION public.review_team_leader_substitution(
  p_request_id uuid,
  p_action text,
  p_admin_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_request team_substitution_private.requests%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_organisation public.organisations%ROWTYPE;
  v_old_participant public.participants%ROWTYPE;
  v_new_participant public.participants%ROWTYPE;
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.profiles AS profile WHERE profile.id = auth.uid();
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE AND v_actor.role IS DISTINCT FROM 'admin') THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Choose approve or reject.' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'reject' AND (p_admin_reason IS NULL OR length(btrim(p_admin_reason)) = 0 OR length(p_admin_reason) > 1000) THEN
    RAISE EXCEPTION 'A rejection reason is required (up to 1000 characters).' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_request FROM team_substitution_private.requests AS request
  WHERE request.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  v_tenant_id := team_substitution_private.assert_admin_festival(v_request.festival_id);
  IF v_request.tenant_id IS DISTINCT FROM v_tenant_id
     OR (v_actor.is_superadmin IS NOT TRUE AND v_actor.tenant_id IS DISTINCT FROM v_tenant_id
       AND NOT public.is_org_visible(v_request.organisation_id)) THEN
    RAISE EXCEPTION 'This request is outside your administrator scope.' USING ERRCODE = '42501';
  END IF;
  IF v_request.status IS DISTINCT FROM 'pending_approval' THEN
    RETURN jsonb_build_object('status', v_request.status);
  END IF;

  IF p_action = 'reject' THEN
    UPDATE team_substitution_private.requests AS request
    SET status = 'rejected', decided_by = auth.uid(), decided_at = now(),
        admin_reason = btrim(p_admin_reason)
    WHERE request.id = p_request_id;
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_tenant_id, auth.uid(), 'TEAM_LEADER_SUBSTITUTION_REJECTED',
      'team_substitution_requests', p_request_id,
      jsonb_build_object('status', 'pending_approval'),
      jsonb_build_object('status', 'rejected', 'admin_reason', btrim(p_admin_reason)));
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  IF v_request.entry_kind = 'general_team' THEN
    RETURN team_substitution_private.review_group_substitution(p_request_id, v_tenant_id, p_admin_reason);
  END IF;

  SELECT * INTO v_registration FROM public.registrations AS registration
  WHERE registration.id = v_request.registration_id FOR UPDATE;
  IF NOT FOUND OR v_registration.participant_id IS DISTINCT FROM v_request.old_participant_id
     OR v_registration.festival_id IS DISTINCT FROM v_request.festival_id
     OR v_registration.item_id IS DISTINCT FROM v_request.item_id
     OR v_registration.organisation_id IS DISTINCT FROM v_request.organisation_id
     OR v_registration.entry_kind IS DISTINCT FROM 'participant'
     OR v_registration.status IN ('rejected', 'cancelled') THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, v_tenant_id, 'The original assignment changed or is no longer active.');
  END IF;
  SELECT * INTO v_item FROM public.items AS item
  WHERE item.id = v_request.item_id
    AND item.festival_id = v_request.festival_id
    AND (item.tenant_id IS NULL OR item.tenant_id = v_tenant_id)
    AND lower(coalesce(item.participation_type, '')) = 'individual';
  IF NOT FOUND THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, v_tenant_id, 'The program is no longer an active individual program.');
  END IF;
  SELECT * INTO v_organisation FROM public.organisations AS organisation
  WHERE organisation.id = v_request.organisation_id;
  IF NOT FOUND OR v_organisation.tenant_id IS NULL
     OR (v_actor.is_superadmin IS NOT TRUE AND v_actor.tenant_id IS DISTINCT FROM v_tenant_id
       AND NOT public.is_org_visible(v_organisation.id)) THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, v_tenant_id, 'The team is no longer available in this tenant.');
  END IF;
  PERFORM schedule.id FROM public.schedules AS schedule
  WHERE schedule.festival_id = v_request.festival_id
    AND schedule.item_id = v_request.item_id
  ORDER BY schedule.id FOR UPDATE NOWAIT;
  IF EXISTS (
    SELECT 1 FROM public.schedules AS schedule
    WHERE schedule.festival_id = v_request.festival_id
      AND schedule.item_id = v_request.item_id
      AND (lower(coalesce(schedule.status, 'scheduled')) IN ('ongoing', 'in_progress', 'completed')
        OR schedule.substage_checkin_started_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.schedule_substage_submissions AS submitted
          WHERE submitted.schedule_id = schedule.id))
  ) OR EXISTS (
    SELECT 1 FROM public.registrations AS checked_registration
    WHERE checked_registration.festival_id = v_request.festival_id
      AND checked_registration.item_id = v_request.item_id
      AND (checked_registration.status IS DISTINCT FROM 'rejected' AND checked_registration.status IS DISTINCT FROM 'cancelled')
      AND (checked_registration.is_verified IS TRUE OR checked_registration.is_locked IS TRUE
        OR checked_registration.checkin_cancelled IS TRUE
        OR checked_registration.code_letter IS NOT NULL
        OR checked_registration.code_letter_fixed IS TRUE)
  ) THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, v_tenant_id, 'Check-in or the competition workflow has already started.');
  END IF;
  IF v_registration.is_verified IS TRUE OR v_registration.is_locked IS TRUE
     OR v_registration.checkin_cancelled IS TRUE OR v_registration.code_letter IS NOT NULL
     OR v_registration.code_letter_fixed IS TRUE
     OR EXISTS (SELECT 1 FROM public.mark_entries AS mark WHERE mark.registration_id = v_registration.id)
     OR EXISTS (SELECT 1 FROM public.results AS result WHERE result.registration_id = v_registration.id)
     OR EXISTS (
       SELECT 1 FROM public.attendance AS attendance
       JOIN public.schedules AS schedule ON schedule.id = attendance.schedule_id
       WHERE attendance.participant_id = v_request.old_participant_id
         AND schedule.festival_id = v_request.festival_id
         AND schedule.item_id = v_request.item_id
     )
     OR EXISTS (
       SELECT 1 FROM public.certificates AS certificate
       WHERE certificate.participant_id = v_request.old_participant_id
         AND certificate.item_id = v_request.item_id
     ) THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, v_tenant_id, 'Check-in or linked competition history prevents substitution. No assignment records were changed.');
  END IF;

  PERFORM participant.id FROM public.participants AS participant
  WHERE participant.id IN (v_request.old_participant_id, v_request.new_participant_id)
  ORDER BY participant.id FOR UPDATE;
  SELECT * INTO v_old_participant FROM public.participants AS participant
  WHERE participant.id = v_request.old_participant_id;
  IF NOT FOUND THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, v_tenant_id, 'The original participant record is unavailable.');
  END IF;
  SELECT * INTO v_new_participant FROM public.participants AS participant
  WHERE participant.id = v_request.new_participant_id;
  IF NOT FOUND OR v_old_participant.festival_id IS DISTINCT FROM v_request.festival_id
     OR v_old_participant.organisation_id IS DISTINCT FROM v_request.organisation_id
     OR v_old_participant.tenant_id IS NULL
     OR v_old_participant.tenant_id NOT IN (v_tenant_id, v_organisation.tenant_id)
     OR v_new_participant.festival_id IS DISTINCT FROM v_request.festival_id
     OR v_new_participant.organisation_id IS DISTINCT FROM v_request.organisation_id
     OR v_new_participant.tenant_id IS NULL
     OR NOT team_substitution_private.is_eligible_participant(
       v_tenant_id, v_request.festival_id, v_request.organisation_id,
       v_request.item_id, v_request.new_participant_id
     ) THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, v_tenant_id, 'The replacement is no longer eligible in this team and program.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.registrations AS assigned
    WHERE assigned.festival_id = v_request.festival_id
      AND assigned.item_id = v_request.item_id
      AND assigned.participant_id = v_request.new_participant_id
      AND (assigned.status IS DISTINCT FROM 'rejected' AND assigned.status IS DISTINCT FROM 'cancelled')
  ) THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, v_tenant_id, 'The replacement participant is already assigned to this program.');
  END IF;

  BEGIN
    UPDATE public.registrations AS registration
    SET participant_id = v_request.new_participant_id
    WHERE registration.id = v_registration.id;
  EXCEPTION WHEN unique_violation OR check_violation THEN
    RETURN jsonb_build_object('status', 'blocked', 'message', 'The assignment could not be safely updated. No substitution was applied.');
  END;
  UPDATE team_substitution_private.requests AS request
  SET status = 'approved', decided_by = auth.uid(), decided_at = now(),
      admin_reason = nullif(btrim(p_admin_reason), '')
  WHERE request.id = p_request_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_tenant_id, auth.uid(), 'TEAM_LEADER_SUBSTITUTION_APPROVED',
    'registrations', v_registration.id,
    jsonb_build_object('request_id', p_request_id, 'participant_id', v_request.old_participant_id),
    jsonb_build_object('request_id', p_request_id, 'participant_id', v_request.new_participant_id,
      'status', 'approved'));
  RETURN jsonb_build_object('status', 'approved', 'registration_id', v_registration.id);
END;
$$;

ALTER FUNCTION public.review_team_leader_substitution(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.review_team_leader_substitution(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_team_leader_substitution(uuid, text, text) TO authenticated;

COMMIT;
