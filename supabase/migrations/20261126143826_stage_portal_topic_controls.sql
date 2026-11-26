BEGIN;
-- The existing venue URL is the stage capability. Every portal operation
-- validates that capability and scopes schedules to the same tenant/festival/venue.
CREATE OR REPLACE FUNCTION private.assert_stage_topic_portal(p_venue_id uuid, p_schedule_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_error text; v_venue public.venues%ROWTYPE;
BEGIN
  v_error := stage_portal_private.assert_pin(p_venue_id, '');
  IF v_error IS NOT NULL THEN RAISE EXCEPTION '%' , v_error USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_venue FROM public.venues WHERE id = p_venue_id;
  IF v_venue.id IS NULL THEN RAISE EXCEPTION 'Invalid stage link.' USING ERRCODE = '42501'; END IF;
  IF p_schedule_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.schedules s JOIN public.items i ON i.id = s.item_id
      AND i.tenant_id = v_venue.tenant_id AND i.festival_id = v_venue.festival_id
    WHERE s.id = p_schedule_id AND s.venue_id = p_venue_id
      AND s.tenant_id = v_venue.tenant_id AND s.festival_id = v_venue.festival_id
  ) THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.assert_stage_topic_portal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_stage_topic_portal(uuid, uuid) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.stage_portal_topic_display_state(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant uuid;
  v_venue public.venues%ROWTYPE;
  v_state private.stage_topic_display_states%ROWTYPE;
BEGIN
  PERFORM private.assert_stage_topic_portal(p_venue_id);
  SELECT tenant_id INTO v_actor_tenant FROM public.venues WHERE id = p_venue_id;
  SELECT * INTO v_venue FROM public.venues WHERE id = p_venue_id;
  IF v_venue.id IS NULL OR
    v_venue.tenant_id <> v_actor_tenant THEN
    RAISE EXCEPTION 'Stage is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  IF v_venue.tenant_id IS NULL OR v_venue.festival_id IS NULL THEN
    RAISE EXCEPTION 'Stage must belong to a tenant festival.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO private.stage_topic_display_states (venue_id, tenant_id, festival_id)
  VALUES (v_venue.id, v_venue.tenant_id, v_venue.festival_id)
  ON CONFLICT (venue_id) DO NOTHING;
  SELECT * INTO v_state FROM private.stage_topic_display_states
    WHERE venue_id = v_venue.id AND tenant_id = v_venue.tenant_id
      AND festival_id = v_venue.festival_id;
  IF v_state.venue_id IS NULL THEN
    RAISE EXCEPTION 'Stage ownership changed.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'venue_id', v_state.venue_id,
    'venue_name', v_venue.name,
    'display_token', v_state.display_token,
    'paused', v_state.paused,
    'version', v_state.version,
    'server_time', clock_timestamp(),
    'on_screen', (
      SELECT jsonb_build_object('item_name', q.item_name, 'code_letter', q.code_letter,
        'topic_text', q.topic_text, 'duration_seconds', q.duration_seconds,
        'published_at', q.published_at)
      FROM private.stage_topic_display_queue q
      WHERE q.id = v_state.published_queue_id AND q.venue_id = v_state.venue_id
        AND q.tenant_id = v_state.tenant_id AND q.festival_id = v_state.festival_id
    ),
    'ready', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', q.id, 'schedule_id', q.schedule_id,
        'registration_id', q.registration_id, 'item_name', q.item_name,
        'code_letter', q.code_letter, 'topic_text', q.topic_text,
        'duration_seconds', q.duration_seconds) ORDER BY q.sequence)
      FROM private.stage_topic_display_queue q
      JOIN public.schedules s ON s.id = q.schedule_id AND s.venue_id = q.venue_id
        AND s.tenant_id = q.tenant_id AND s.festival_id = q.festival_id
        AND s.topic_draw_enabled
      JOIN private.schedule_topic_draws d ON d.id = q.draw_id
        AND d.schedule_id = q.schedule_id AND d.registration_id = q.registration_id
        AND d.tenant_id = q.tenant_id AND d.is_current
      JOIN public.registrations r ON r.id = q.registration_id
        AND r.tenant_id = q.tenant_id AND r.festival_id = q.festival_id
        AND r.item_id = s.item_id AND r.status IS DISTINCT FROM 'rejected'
        AND btrim(r.code_letter) = q.code_letter
      WHERE q.venue_id = v_state.venue_id AND q.tenant_id = v_state.tenant_id
        AND q.festival_id = v_state.festival_id AND q.published_at IS NULL
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.stage_portal_topic_display_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_portal_topic_display_state(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stage_portal_topic_show_next(
  p_venue_id uuid, p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant uuid;
  v_venue public.venues%ROWTYPE;
  v_state private.stage_topic_display_states%ROWTYPE;
  v_next private.stage_topic_display_queue%ROWTYPE;
BEGIN
  PERFORM private.assert_stage_topic_portal(p_venue_id);
  SELECT tenant_id INTO v_actor_tenant FROM public.venues WHERE id = p_venue_id;
  SELECT * INTO v_venue FROM public.venues WHERE id = p_venue_id;
  IF v_venue.id IS NULL OR
    v_venue.tenant_id <> v_actor_tenant THEN
    RAISE EXCEPTION 'Stage is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_state FROM private.stage_topic_display_states
  WHERE venue_id = p_venue_id AND tenant_id = v_venue.tenant_id
    AND festival_id = v_venue.festival_id FOR UPDATE;
  IF v_state.venue_id IS NULL THEN
    RAISE EXCEPTION 'Open the stage display link first.' USING ERRCODE = '55000';
  END IF;
  IF v_state.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Stage display changed. Refresh before showing next.' USING ERRCODE = '40001';
  END IF;
  IF v_state.paused THEN
    RAISE EXCEPTION 'Resume the display before showing next.' USING ERRCODE = '55000';
  END IF;
  SELECT q.* INTO v_next FROM private.stage_topic_display_queue q
  JOIN public.schedules s ON s.id = q.schedule_id AND s.venue_id = q.venue_id
    AND s.tenant_id = q.tenant_id AND s.festival_id = q.festival_id
    AND s.topic_draw_enabled
  JOIN private.schedule_topic_draws d ON d.id = q.draw_id
    AND d.schedule_id = q.schedule_id AND d.registration_id = q.registration_id
    AND d.tenant_id = q.tenant_id AND d.is_current
  JOIN public.registrations r ON r.id = q.registration_id
    AND r.tenant_id = q.tenant_id AND r.festival_id = q.festival_id
    AND r.item_id = s.item_id AND r.status IS DISTINCT FROM 'rejected'
    AND btrim(r.code_letter) = q.code_letter
  WHERE q.venue_id = p_venue_id AND q.tenant_id = v_venue.tenant_id
    AND q.festival_id = v_venue.festival_id AND q.published_at IS NULL
  ORDER BY q.sequence LIMIT 1 FOR UPDATE OF q;
  IF v_next.id IS NULL THEN
    RAISE EXCEPTION 'No ready topic for this stage.' USING ERRCODE = '55000';
  END IF;
  UPDATE private.stage_topic_display_queue q
    SET published_at = clock_timestamp(),
      duration_seconds = s.topic_draw_duration_seconds
    FROM public.schedules s
    WHERE q.id = v_next.id AND s.id = q.schedule_id
      AND s.tenant_id = q.tenant_id AND s.festival_id = q.festival_id;
  UPDATE private.stage_topic_display_states
    SET published_queue_id = v_next.id, version = version + 1
    WHERE venue_id = p_venue_id;
  RETURN public.stage_portal_topic_display_state(p_venue_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.stage_portal_topic_show_next(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_portal_topic_show_next(uuid, bigint) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stage_portal_topic_set_paused(
  p_venue_id uuid, p_paused boolean, p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant uuid;
  v_venue public.venues%ROWTYPE;
  v_state private.stage_topic_display_states%ROWTYPE;
BEGIN
  PERFORM private.assert_stage_topic_portal(p_venue_id);
  SELECT tenant_id INTO v_actor_tenant FROM public.venues WHERE id = p_venue_id;
  SELECT * INTO v_venue FROM public.venues WHERE id = p_venue_id;
  IF v_venue.id IS NULL OR
    v_venue.tenant_id <> v_actor_tenant THEN
    RAISE EXCEPTION 'Stage is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_state FROM private.stage_topic_display_states
    WHERE venue_id = p_venue_id AND tenant_id = v_venue.tenant_id
      AND festival_id = v_venue.festival_id FOR UPDATE;
  IF v_state.venue_id IS NULL OR v_state.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Stage display changed. Refresh before updating it.' USING ERRCODE = '40001';
  END IF;
  IF p_paused IS NULL THEN
    RAISE EXCEPTION 'Pause state is required.' USING ERRCODE = '22023';
  END IF;
  IF v_state.paused IS DISTINCT FROM p_paused THEN
    UPDATE private.stage_topic_display_states
      SET paused = p_paused, version = version + 1 WHERE venue_id = p_venue_id;
  END IF;
  RETURN public.stage_portal_topic_display_state(p_venue_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.stage_portal_topic_set_paused(uuid, boolean, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_portal_topic_set_paused(uuid, boolean, bigint) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stage_portal_topic_draw_state(p_venue_id uuid, p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_display_state private.schedule_topic_display_states%ROWTYPE;
BEGIN
  PERFORM private.assert_stage_topic_portal(p_venue_id, p_schedule_id);
  SELECT tenant_id INTO v_actor_tenant_id FROM public.venues WHERE id = p_venue_id;
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id;
  IF v_schedule.id IS NULL OR v_schedule.tenant_id <> v_actor_tenant_id
    OR v_schedule.venue_id IS DISTINCT FROM p_venue_id
    OR NOT EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = p_venue_id AND v.tenant_id = v_schedule.tenant_id
        AND v.festival_id = v_schedule.festival_id
    ) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_display_state FROM private.schedule_topic_display_states
  WHERE schedule_id = p_schedule_id AND tenant_id = v_schedule.tenant_id;

  RETURN jsonb_build_object(
    'enabled', v_schedule.topic_draw_enabled,
    'participant_duration_seconds', v_schedule.topic_draw_duration_seconds,
    'display_token', CASE WHEN v_schedule.topic_draw_enabled THEN v_display_state.display_token::text ELSE NULL END,
    'displayed_assignment_id', CASE WHEN v_schedule.topic_draw_enabled THEN v_display_state.displayed_assignment_id ELSE NULL END,
    'judging_started', EXISTS (
      SELECT 1 FROM public.mark_entries m
      WHERE m.schedule_id = v_schedule.id AND m.tenant_id = v_schedule.tenant_id
    ),
    'topics', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'topic_text', t.topic_text, 'is_active', t.is_active,
        'is_deleted', t.is_deleted, 'created_at', t.created_at, 'updated_at', t.updated_at
      ) ORDER BY t.created_at, t.id)
      FROM private.schedule_topics t
      WHERE t.schedule_id = v_schedule.id AND t.tenant_id = v_schedule.tenant_id
        AND NOT t.is_deleted
    ), '[]'::jsonb),
    'assignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'registration_id', d.registration_id,
        'topic_id', d.topic_id, 'topic_text', d.topic_text_snapshot,
        'drawn_at', d.drawn_at, 'is_current', d.is_current
      ) ORDER BY d.drawn_at DESC, d.id)
      FROM private.schedule_topic_draws d
      WHERE d.schedule_id = v_schedule.id AND d.tenant_id = v_schedule.tenant_id
        AND d.is_current
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.stage_portal_topic_draw_state(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_portal_topic_draw_state(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stage_portal_set_topic_active(p_venue_id uuid, p_schedule_id uuid, p_topic_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
BEGIN
  PERFORM private.assert_stage_topic_portal(p_venue_id, p_schedule_id);
  SELECT tenant_id INTO v_actor_tenant_id FROM public.venues WHERE id = p_venue_id;
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR v_schedule.tenant_id <> v_actor_tenant_id
    OR v_schedule.venue_id IS DISTINCT FROM p_venue_id
    OR NOT EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = p_venue_id AND v.tenant_id = v_schedule.tenant_id
        AND v.festival_id = v_schedule.festival_id
    ) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_schedule.topic_draw_enabled THEN RAISE EXCEPTION 'Topic Draw is disabled for this schedule.' USING ERRCODE = '55000'; END IF;
  UPDATE private.schedule_topics
  SET is_active = p_active, updated_by = auth.uid(), updated_at = now()
  WHERE id = p_topic_id AND schedule_id = p_schedule_id AND tenant_id = v_schedule.tenant_id AND NOT is_deleted;
  IF NOT FOUND THEN RAISE EXCEPTION 'Topic does not belong to this schedule.' USING ERRCODE = '42501'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.stage_portal_set_topic_active(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_portal_set_topic_active(uuid, uuid, uuid, boolean) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stage_portal_draw_topic(
  p_venue_id uuid,
  p_schedule_id uuid,
  p_registration_id uuid,
  p_confirm_redraw boolean DEFAULT false,
  p_confirm_judging_started boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_old private.schedule_topic_draws%ROWTYPE;
  v_topic private.schedule_topics%ROWTYPE;
  v_new private.schedule_topic_draws%ROWTYPE;
  v_judging_started boolean;
BEGIN
  PERFORM private.assert_stage_topic_portal(p_venue_id, p_schedule_id);
  SELECT tenant_id INTO v_actor_tenant_id FROM public.venues WHERE id = p_venue_id;
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR v_schedule.tenant_id <> v_actor_tenant_id
    OR v_schedule.venue_id IS DISTINCT FROM p_venue_id
    OR NOT EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = p_venue_id AND v.tenant_id = v_schedule.tenant_id
        AND v.festival_id = v_schedule.festival_id
    ) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_schedule.topic_draw_enabled THEN RAISE EXCEPTION 'Topic Draw is disabled for this schedule.' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.stage_venue_portal_schedule_detail_v2(p_venue_id, '', p_schedule_id)->'registrations'
    ) r WHERE r->>'id' = p_registration_id::text AND r->>'status' IS DISTINCT FROM 'rejected'
  ) THEN RAISE EXCEPTION 'Participant is not eligible for this schedule.' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_old FROM private.schedule_topic_draws
  WHERE schedule_id = p_schedule_id AND registration_id = p_registration_id AND is_current
  FOR UPDATE;
  IF v_old.id IS NOT NULL AND NOT p_confirm_redraw THEN
    RAISE EXCEPTION 'A topic is already assigned. Confirm redraw before changing it.' USING ERRCODE = '55000';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.mark_entries m WHERE m.schedule_id = p_schedule_id AND m.tenant_id = v_schedule.tenant_id)
  INTO v_judging_started;
  IF v_judging_started AND NOT p_confirm_judging_started THEN
    RAISE EXCEPTION 'Judging has started. Confirm redraw; existing marks will remain unchanged.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_topic FROM private.schedule_topics
  WHERE schedule_id = p_schedule_id AND tenant_id = v_schedule.tenant_id
    AND is_active AND NOT is_deleted
  ORDER BY random()
  LIMIT 1
  FOR UPDATE;
  IF v_topic.id IS NULL THEN RAISE EXCEPTION 'No active topics are available. Activate a topic in Stage Portal.' USING ERRCODE = '55000'; END IF;

  IF v_old.id IS NOT NULL THEN
    UPDATE private.schedule_topic_draws SET is_current = false WHERE id = v_old.id;
  END IF;
  -- Stage operators disable a used topic explicitly when it should leave the pool.
  -- A topic may therefore be drawn for more than one participant.

  INSERT INTO private.schedule_topic_draws (
    tenant_id, festival_id, schedule_id, registration_id, topic_id,
    topic_text_snapshot, replaces_assignment_id, drawn_by
  ) VALUES (
    v_schedule.tenant_id, v_schedule.festival_id, p_schedule_id, p_registration_id,
    v_topic.id, v_topic.topic_text, v_old.id, auth.uid()
  ) RETURNING * INTO v_new;

  UPDATE private.schedule_topic_display_states
  SET displayed_assignment_id = NULL
  WHERE schedule_id = p_schedule_id AND tenant_id = v_schedule.tenant_id;

  PERFORM private.enqueue_stage_topic_draw(p_schedule_id, p_registration_id, v_new.id);

  -- Refresh topic labels in an already-open judge page without reloading its
  -- local mark drafts or changing the active registration.
  PERFORM realtime.send(
    '{}'::jsonb,
    'changed',
    'judge-labels:schedule:' || p_schedule_id::text,
    false
  );

  RETURN jsonb_build_object(
    'assignment_id', v_new.id, 'registration_id', v_new.registration_id,
    'topic_id', v_new.topic_id, 'topic_text', v_new.topic_text_snapshot,
    'drawn_at', v_new.drawn_at, 'judging_started', v_judging_started,
    'replaced_assignment_id', v_old.id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.stage_portal_draw_topic(uuid, uuid, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_portal_draw_topic(uuid, uuid, uuid, boolean, boolean) TO anon, authenticated, service_role;

-- The display can say that topics are configured without exposing their text
-- before Stage Portal explicitly publishes a draw with Show Next.
CREATE OR REPLACE FUNCTION public.get_stage_topic_display(p_display_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'version', state.version, 'paused', state.paused,
    'server_time', now(),
    'has_topics', EXISTS (
      SELECT 1 FROM public.schedules s
      JOIN private.schedule_topics t ON t.schedule_id = s.id
        AND t.tenant_id = s.tenant_id AND t.festival_id = s.festival_id
        AND NOT t.is_deleted
      WHERE s.venue_id = state.venue_id AND s.tenant_id = state.tenant_id
        AND s.festival_id = state.festival_id AND s.topic_draw_enabled
    ),
    'on_screen', CASE WHEN state.paused OR q.id IS NULL THEN NULL ELSE
      jsonb_build_object('item_name', q.item_name, 'code_letter', q.code_letter,
        'topic_text', q.topic_text, 'duration_seconds', q.duration_seconds,
        'published_at', q.published_at) END
  )
  FROM private.stage_topic_display_states state
  JOIN public.venues v ON v.id = state.venue_id
    AND v.tenant_id = state.tenant_id AND v.festival_id = state.festival_id
  LEFT JOIN private.stage_topic_display_queue q ON q.id = state.published_queue_id
    AND q.venue_id = state.venue_id AND q.tenant_id = state.tenant_id
    AND q.festival_id = state.festival_id
  WHERE state.display_token = p_display_token;
$function$;
REVOKE ALL ON FUNCTION public.get_stage_topic_display(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stage_topic_display(uuid) TO anon, authenticated, service_role;

COMMIT;
