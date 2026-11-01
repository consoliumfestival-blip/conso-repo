BEGIN;

CREATE SCHEMA IF NOT EXISTS team_substitution_private;
REVOKE ALL ON SCHEMA team_substitution_private FROM PUBLIC, anon, authenticated;

CREATE TABLE team_substitution_private.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  festival_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  item_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  old_participant_id uuid NOT NULL,
  old_participant_name text NOT NULL,
  old_chest_number text,
  new_participant_id uuid NOT NULL,
  new_participant_name text NOT NULL,
  new_chest_number text,
  item_code text,
  item_name text NOT NULL,
  team_name text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0 AND length(reason) <= 1000),
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'stale')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  admin_reason text,
  CONSTRAINT team_substitution_different_participants
    CHECK (old_participant_id <> new_participant_id),
  CONSTRAINT team_substitution_decision_fields
    CHECK ((status = 'pending_approval' AND decided_by IS NULL AND decided_at IS NULL)
        OR (status <> 'pending_approval' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT team_substitution_rejection_reason
    CHECK (status <> 'rejected' OR length(btrim(coalesce(admin_reason, ''))) > 0)
);

ALTER TABLE team_substitution_private.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_substitution_private.requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE team_substitution_private.requests FROM PUBLIC, anon, authenticated;
CREATE INDEX team_substitution_requests_pending_festival_item
  ON team_substitution_private.requests (tenant_id, festival_id, item_id, requested_at)
  WHERE status = 'pending_approval';
CREATE UNIQUE INDEX team_substitution_one_pending_per_registration
  ON team_substitution_private.requests (registration_id)
  WHERE status = 'pending_approval';
CREATE UNIQUE INDEX team_substitution_one_pending_target_per_item
  ON team_substitution_private.requests (item_id, new_participant_id)
  WHERE status = 'pending_approval';

CREATE OR REPLACE FUNCTION team_substitution_private.guard_pending_substitution_registration_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles AS actor WHERE actor.id = auth.uid() AND actor.role = 'team_leader')
     AND EXISTS (
    SELECT 1 FROM team_substitution_private.requests AS request
    WHERE request.registration_id = OLD.id AND request.status = 'pending_approval'
  ) THEN
    RAISE EXCEPTION 'Resolve the pending substitution request before removing this assignment.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;
ALTER FUNCTION team_substitution_private.guard_pending_substitution_registration_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION team_substitution_private.guard_pending_substitution_registration_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_pending_team_substitution_registration_delete ON public.registrations;
CREATE TRIGGER guard_pending_team_substitution_registration_delete
  BEFORE DELETE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION team_substitution_private.guard_pending_substitution_registration_delete();

-- Mirrors the current Team Leader eligibility contract. The optional legacy
-- religious-category flag is read from the row JSON so this function does not
-- depend on a column absent from some target schemas.
CREATE OR REPLACE FUNCTION team_substitution_private.is_eligible_participant(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_organisation_id uuid,
  p_item_id uuid,
  p_participant_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.items AS item
    JOIN public.organisations AS organisation
      ON organisation.id = p_organisation_id
     AND organisation.tenant_id IS NOT NULL
    JOIN public.participants AS participant
      ON participant.id = p_participant_id
     AND participant.tenant_id IN (p_tenant_id, organisation.tenant_id)
     AND participant.festival_id = p_festival_id
     AND participant.organisation_id = p_organisation_id
    WHERE item.id = p_item_id
      AND item.festival_id = p_festival_id
      AND (item.tenant_id IS NULL OR item.tenant_id = p_tenant_id)
      AND lower(coalesce(item.participation_type, '')) = 'individual'
      AND item.is_active IS TRUE
      AND participant.status IS DISTINCT FROM 'rejected'
      AND (participant.plagiarism_ban_until IS NULL OR participant.plagiarism_ban_until <= current_date)
      AND (
        EXISTS (
          SELECT 1
          FROM unnest(coalesce(item.category_codes, ARRAY[]::text[])) AS category(code)
          WHERE upper(btrim(category.code)) IN (
            upper(btrim(coalesce(participant.category_code, ''))),
            CASE upper(btrim(coalesce(participant.category_code, '')))
              WHEN 'JUNIOR' THEN 'JR' WHEN 'JR' THEN 'JUNIOR'
              WHEN 'SENIOR' THEN 'SR' WHEN 'SR' THEN 'SENIOR'
              WHEN 'CAMPUS' THEN 'CA' WHEN 'CA' THEN 'CAMPUS'
              ELSE upper(btrim(coalesce(participant.category_code, '')))
            END
          )
        )
        OR (
          coalesce((to_jsonb(participant)->>'is_post_hs_religious')::boolean, false)
          AND EXISTS (
            SELECT 1 FROM unnest(coalesce(item.category_codes, ARRAY[]::text[])) AS category(code)
            WHERE upper(btrim(category.code)) IN ('JR', 'JUNIOR', 'SR', 'SENIOR')
          )
        )
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(item.category_codes, ARRAY[]::text[])) AS category(code)
          WHERE upper(btrim(category.code)) IN ('GN', 'GENERAL')
        )
      )
      AND NOT (
        coalesce((to_jsonb(participant)->>'is_post_hs_religious')::boolean, false)
        AND EXISTS (
          SELECT 1 FROM unnest(coalesce(item.category_codes, ARRAY[]::text[])) AS category(code)
          WHERE upper(btrim(category.code)) = 'HS'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.registrations AS other_registration
        WHERE other_registration.participant_id = participant.id
          AND other_registration.festival_id = p_festival_id
          AND other_registration.organisation_id IS DISTINCT FROM p_organisation_id
      )
      AND (
        coalesce(lower(btrim(item.gender)), 'both') IN ('', 'both')
        OR lower(btrim(item.gender)) = lower(btrim(coalesce(participant.gender, '')))
      )
  );
$$;
ALTER FUNCTION team_substitution_private.is_eligible_participant(uuid, uuid, uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION team_substitution_private.is_eligible_participant(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION team_substitution_private.assert_admin_festival(p_festival_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.profiles AS profile WHERE profile.id = auth.uid();
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE AND v_actor.role IS DISTINCT FROM 'admin') THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  SELECT festival.tenant_id INTO v_tenant_id
  FROM public.festival_calendar AS festival WHERE festival.id = p_festival_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Festival not found.' USING ERRCODE = '22023';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE
     AND v_actor.tenant_id IS DISTINCT FROM v_tenant_id
     AND NOT EXISTS (
       SELECT 1 FROM public.get_visible_organisations(v_tenant_id) AS visible
       WHERE public.is_org_visible(visible.id)
     ) THEN
    RAISE EXCEPTION 'Administrator access to this festival is required.' USING ERRCODE = '42501';
  END IF;
  RETURN v_tenant_id;
END;
$$;
ALTER FUNCTION team_substitution_private.assert_admin_festival(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION team_substitution_private.assert_admin_festival(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION team_substitution_private.close_stale_request(
  p_request_id uuid,
  p_tenant_id uuid,
  p_message text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE team_substitution_private.requests AS request
  SET status = 'stale', decided_by = auth.uid(), decided_at = now(),
      admin_reason = 'Automatically closed: ' || p_message
  WHERE request.id = p_request_id AND request.status = 'pending_approval';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pending_approval', 'message', 'Request state changed. Refresh the queue.');
  END IF;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (p_tenant_id, auth.uid(), 'TEAM_LEADER_SUBSTITUTION_AUTO_CLOSED',
    'team_substitution_requests', p_request_id,
    jsonb_build_object('status', 'pending_approval'),
    jsonb_build_object('status', 'stale', 'reason', p_message));
  RETURN jsonb_build_object('status', 'stale', 'message', p_message);
END;
$$;
ALTER FUNCTION team_substitution_private.close_stale_request(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION team_substitution_private.close_stale_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.team_leader_request_individual_substitution(
  p_registration_id uuid,
  p_new_participant_id uuid,
  p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_context record;
  v_registration public.registrations%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_organisation public.organisations%ROWTYPE;
  v_old_participant public.participants%ROWTYPE;
  v_new_participant public.participants%ROWTYPE;
  v_request_id uuid;
  v_pending_request_id uuid;
  v_eligible boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.profiles AS profile WHERE profile.id = auth.uid();
  IF NOT FOUND OR v_actor.role IS DISTINCT FROM 'team_leader' THEN
    RAISE EXCEPTION 'Only a Team Leader can request this substitution.' USING ERRCODE = '42501';
  END IF;
  IF p_registration_id IS NULL OR p_new_participant_id IS NULL
     OR p_reason IS NULL OR length(btrim(p_reason)) = 0 OR length(p_reason) > 1000 THEN
    RAISE EXCEPTION 'Choose a replacement and provide a reason (up to 1000 characters).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_registration FROM public.registrations AS registration
  WHERE registration.id = p_registration_id FOR UPDATE;
  IF NOT FOUND OR v_registration.entry_kind IS DISTINCT FROM 'participant'
     OR v_registration.participant_id IS NULL
     OR v_registration.festival_id IS DISTINCT FROM v_context.festival_id
     OR v_registration.organisation_id IS DISTINCT FROM v_context.organisation_id THEN
    RAISE EXCEPTION 'This individual assignment is outside your team.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_item FROM public.items AS item
  WHERE item.id = v_registration.item_id
    AND item.festival_id = v_context.festival_id
    AND (item.tenant_id IS NULL OR item.tenant_id = v_context.parent_tenant_id)
    AND lower(coalesce(item.participation_type, '')) = 'individual';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Substitution requests are available only for individual programs.' USING ERRCODE = '22023';
  END IF;
  -- Serialize against schedule/check-in transitions. NOWAIT makes a concurrent
  -- stage operation win cleanly rather than leaving a check-in request waiting.
  PERFORM schedule.id FROM public.schedules AS schedule
  WHERE schedule.festival_id = v_registration.festival_id
    AND schedule.item_id = v_registration.item_id
  ORDER BY schedule.id FOR UPDATE NOWAIT;
  IF v_registration.status IN ('rejected', 'cancelled') THEN
    RAISE EXCEPTION 'This assignment is no longer active.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.team_leader_program_completions AS completion
    WHERE completion.festival_id = v_registration.festival_id
      AND completion.organisation_id = v_registration.organisation_id
      AND completion.item_id = v_registration.item_id
  ) THEN
    RAISE EXCEPTION 'This program has already been marked complete.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.schedules AS schedule
    WHERE schedule.festival_id = v_registration.festival_id
      AND schedule.item_id = v_registration.item_id
      AND (lower(coalesce(schedule.status, 'scheduled')) IN ('ongoing', 'in_progress', 'completed')
        OR schedule.substage_checkin_started_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.schedule_substage_submissions AS submitted
          WHERE submitted.schedule_id = schedule.id))
  ) OR EXISTS (
    SELECT 1 FROM public.registrations AS checked_registration
    WHERE checked_registration.festival_id = v_registration.festival_id
      AND checked_registration.item_id = v_registration.item_id
      AND (checked_registration.status IS DISTINCT FROM 'rejected' AND checked_registration.status IS DISTINCT FROM 'cancelled')
      AND (checked_registration.is_verified IS TRUE OR checked_registration.is_locked IS TRUE
        OR checked_registration.checkin_cancelled IS TRUE
        OR checked_registration.code_letter IS NOT NULL
        OR checked_registration.code_letter_fixed IS TRUE)
  ) THEN
    RAISE EXCEPTION 'Substitution requests close when check-in or the competition workflow has started.' USING ERRCODE = '55000';
  END IF;
  IF p_new_participant_id = v_registration.participant_id THEN
    RAISE EXCEPTION 'Choose a different participant.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_organisation FROM public.organisations AS organisation
  WHERE organisation.id = v_registration.organisation_id;
  IF NOT FOUND OR v_organisation.tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) AS visible
    WHERE visible.id = v_organisation.id AND visible.tenant_id = v_organisation.tenant_id
  ) THEN
    RAISE EXCEPTION 'The assigned team is outside the festival tenant scope.' USING ERRCODE = '42501';
  END IF;
  IF v_registration.tenant_id IS NULL
     OR v_registration.tenant_id NOT IN (v_context.parent_tenant_id, v_organisation.tenant_id) THEN
    RAISE EXCEPTION 'Assignment is outside the festival tenant.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_old_participant FROM public.participants AS participant
  WHERE participant.id = v_registration.participant_id FOR UPDATE;
  SELECT * INTO v_new_participant FROM public.participants AS participant
  WHERE participant.id = p_new_participant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The replacement participant is unavailable.' USING ERRCODE = '22023';
  END IF;
  IF v_old_participant.festival_id IS DISTINCT FROM v_registration.festival_id
     OR v_old_participant.organisation_id IS DISTINCT FROM v_registration.organisation_id
     OR v_old_participant.tenant_id IS NULL
     OR v_old_participant.tenant_id NOT IN (v_context.parent_tenant_id, v_organisation.tenant_id)
     OR v_new_participant.festival_id IS DISTINCT FROM v_registration.festival_id
     OR v_new_participant.organisation_id IS DISTINCT FROM v_registration.organisation_id
     OR v_new_participant.tenant_id IS NULL
     OR v_new_participant.tenant_id NOT IN (v_context.parent_tenant_id, v_organisation.tenant_id) THEN
    RAISE EXCEPTION 'The replacement must belong to the same team and festival.' USING ERRCODE = '42501';
  END IF;
  SELECT eligible.is_eligible INTO v_eligible
  FROM public.get_team_leader_programs(p_new_participant_id) AS eligible
  WHERE eligible.item_id = v_item.id AND eligible.entry_kind = 'participant';
  IF coalesce(v_eligible, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'The replacement participant is not eligible for this program.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.registrations AS assigned
    WHERE assigned.festival_id = v_registration.festival_id
      AND assigned.item_id = v_registration.item_id
      AND assigned.participant_id = p_new_participant_id
      AND (assigned.status IS DISTINCT FROM 'rejected' AND assigned.status IS DISTINCT FROM 'cancelled')
  ) THEN
    RAISE EXCEPTION 'The replacement participant is already assigned to this program.' USING ERRCODE = '23505';
  END IF;

  BEGIN
    INSERT INTO team_substitution_private.requests (
      tenant_id, festival_id, organisation_id, item_id, registration_id,
      old_participant_id, old_participant_name, old_chest_number,
      new_participant_id, new_participant_name, new_chest_number,
      item_code, item_name, team_name, reason, requested_by
    ) VALUES (
      v_context.parent_tenant_id, v_registration.festival_id, v_registration.organisation_id,
      v_registration.item_id, v_registration.id,
      v_old_participant.id, v_old_participant.name, v_old_participant.chest_number,
      v_new_participant.id, v_new_participant.name, v_new_participant.chest_number,
      v_item.item_code, coalesce(nullif(v_item.item_name_en, ''), nullif(v_item.item_name_ml, ''), v_item.item_code, 'Program'),
      coalesce(v_organisation.name, 'Team'), btrim(p_reason), auth.uid()
    ) RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT request.id INTO v_pending_request_id
    FROM team_substitution_private.requests AS request
    WHERE request.status = 'pending_approval'
      AND (request.registration_id = v_registration.id
        OR (request.item_id = v_registration.item_id AND request.new_participant_id = p_new_participant_id))
    LIMIT 1;
    RETURN jsonb_build_object('status', 'pending_exists', 'request_id', v_pending_request_id);
  END;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_context.parent_tenant_id, auth.uid(), 'TEAM_LEADER_SUBSTITUTION_REQUESTED',
    'team_substitution_requests', v_request_id,
    jsonb_build_object('registration_id', v_registration.id, 'participant_id', v_old_participant.id),
    jsonb_build_object('item_id', v_item.id, 'new_participant_id', v_new_participant.id,
      'reason', btrim(p_reason), 'status', 'pending_approval'));
  RETURN jsonb_build_object('status', 'pending_approval', 'request_id', v_request_id);
END;
$$;
ALTER FUNCTION public.team_leader_request_individual_substitution(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.team_leader_request_individual_substitution(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_leader_request_individual_substitution(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_team_leader_individual_substitution_requests(p_item_id uuid)
RETURNS TABLE (
  request_id uuid, registration_id uuid, old_participant_id uuid,
  old_participant_name text, old_chest_number text, new_participant_id uuid,
  new_participant_name text, new_chest_number text, reason text,
  status text, admin_reason text, requested_at timestamptz, decided_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT ON (request.registration_id)
         request.id, request.registration_id, request.old_participant_id,
         request.old_participant_name, request.old_chest_number,
         request.new_participant_id, request.new_participant_name,
         request.new_chest_number, request.reason, request.status,
         request.admin_reason, request.requested_at, request.decided_at
  FROM public.get_team_leader_context() AS context
  JOIN team_substitution_private.requests AS request
    ON request.tenant_id = context.parent_tenant_id
   AND request.festival_id = context.festival_id
   AND request.organisation_id = context.organisation_id
   AND request.item_id = p_item_id
  JOIN public.items AS item ON item.id = request.item_id
    AND item.festival_id = context.festival_id
    AND (item.tenant_id IS NULL OR item.tenant_id = context.parent_tenant_id)
    AND lower(coalesce(item.participation_type, '')) = 'individual'
  WHERE auth.uid() IS NOT NULL
  ORDER BY request.registration_id, request.requested_at DESC, request.id DESC;
$$;
ALTER FUNCTION public.get_team_leader_individual_substitution_requests(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_team_leader_individual_substitution_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_individual_substitution_requests(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_program_substitution_summary(p_festival_id uuid)
RETURNS TABLE (
  item_id uuid, item_code text, item_name text,
  request_count bigint, oldest_requested_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tenant_id uuid;
BEGIN
  v_tenant_id := team_substitution_private.assert_admin_festival(p_festival_id);
  RETURN QUERY
  SELECT request.item_id, request.item_code, request.item_name,
         count(*)::bigint,
         min(request.requested_at)
  FROM team_substitution_private.requests AS request
  WHERE request.tenant_id = v_tenant_id
    AND request.festival_id = p_festival_id
    AND request.status = 'pending_approval'
    AND (
      (SELECT profile.is_superadmin IS TRUE FROM public.profiles AS profile WHERE profile.id = auth.uid())
      OR (SELECT profile.tenant_id = v_tenant_id FROM public.profiles AS profile WHERE profile.id = auth.uid())
      OR public.is_org_visible(request.organisation_id)
    )
  GROUP BY request.item_id, request.item_code, request.item_name
  ORDER BY min(request.requested_at), request.item_name;
END;
$$;
ALTER FUNCTION public.get_admin_program_substitution_summary(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_admin_program_substitution_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_program_substitution_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_program_substitution_requests(
  p_festival_id uuid,
  p_item_id uuid
) RETURNS TABLE (
  request_id uuid, organisation_id uuid, team_name text, item_code text, item_name text,
  registration_id uuid, old_participant_id uuid, old_participant_name text,
  old_chest_number text, new_participant_id uuid, new_participant_name text,
  new_chest_number text, reason text, requested_at timestamptz, requested_by uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tenant_id uuid;
BEGIN
  v_tenant_id := team_substitution_private.assert_admin_festival(p_festival_id);
  RETURN QUERY
  SELECT request.id, request.organisation_id, request.team_name, request.item_code,
         request.item_name, request.registration_id, request.old_participant_id,
         request.old_participant_name, request.old_chest_number,
         request.new_participant_id, request.new_participant_name,
         request.new_chest_number, request.reason, request.requested_at, request.requested_by
  FROM team_substitution_private.requests AS request
  WHERE request.tenant_id = v_tenant_id
    AND request.festival_id = p_festival_id
    AND request.item_id = p_item_id
    AND request.status = 'pending_approval'
    AND (
      (SELECT profile.is_superadmin IS TRUE FROM public.profiles AS profile WHERE profile.id = auth.uid())
      OR (SELECT profile.tenant_id = v_tenant_id FROM public.profiles AS profile WHERE profile.id = auth.uid())
      OR public.is_org_visible(request.organisation_id)
    )
  ORDER BY request.requested_at, request.id;
END;
$$;
ALTER FUNCTION public.get_admin_program_substitution_requests(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_admin_program_substitution_requests(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_program_substitution_requests(uuid, uuid) TO authenticated;

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
    SELECT 1 FROM public.team_leader_program_completions AS completion
    WHERE completion.festival_id = v_request.festival_id
      AND completion.organisation_id = v_request.organisation_id
      AND completion.item_id = v_request.item_id
  ) THEN
    RETURN team_substitution_private.close_stale_request(p_request_id, v_tenant_id, 'The program has already been marked complete.');
  END IF;
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
