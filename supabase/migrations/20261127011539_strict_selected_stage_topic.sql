BEGIN;
-- Strict selection: never publish a different event/participant as a fallback.
-- Additive ready-state identity; published historical snapshots stay unchanged.

CREATE OR REPLACE FUNCTION public.admin_stage_topic_display_state(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant uuid;
  v_venue public.venues%ROWTYPE;
  v_state private.stage_topic_display_states%ROWTYPE;
BEGIN
  v_actor_tenant := public.stage_assert_admin_access();
  SELECT * INTO v_venue FROM public.venues WHERE id = p_venue_id;
  IF v_venue.id IS NULL OR
    (v_venue.tenant_id <> v_actor_tenant AND NOT public.is_superadmin()) THEN
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
        'registration_id', q.registration_id, 'draw_id', q.draw_id, 'item_name', q.item_name,
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
        'registration_id', q.registration_id, 'draw_id', q.draw_id, 'item_name', q.item_name,
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

CREATE OR REPLACE FUNCTION public.admin_stage_topic_show_selected(
  p_venue_id uuid, p_expected_version bigint,
  p_schedule_id uuid, p_registration_id uuid, p_queue_id uuid, p_draw_id uuid,
  p_expected_code_letter text, p_expected_topic_text text, p_expected_item_name text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant uuid;
  v_schedule public.schedules%ROWTYPE;
  v_venue public.venues%ROWTYPE;
  v_state private.stage_topic_display_states%ROWTYPE;
  v_next private.stage_topic_display_queue%ROWTYPE;
BEGIN
  v_actor_tenant := public.stage_assert_admin_access();
  SELECT * INTO v_venue FROM public.venues WHERE id = p_venue_id;
  IF v_venue.id IS NULL OR
    (v_venue.tenant_id <> v_actor_tenant AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Stage is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  IF p_schedule_id IS NULL OR p_registration_id IS NULL OR p_queue_id IS NULL
    OR p_draw_id IS NULL OR p_expected_version IS NULL
    OR p_expected_code_letter IS NULL OR p_expected_topic_text IS NULL
    OR p_expected_item_name IS NULL THEN
    RAISE EXCEPTION 'Select a participant and refresh the topic preview before Show Next.' USING ERRCODE = '22023';
  END IF;
  -- Match draw lock order: schedule first, then stage state. Code-letter edits
  -- serialize through the registration lock; selection is checked again below.
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR v_schedule.venue_id IS DISTINCT FROM p_venue_id
    OR v_schedule.tenant_id IS DISTINCT FROM v_venue.tenant_id
    OR v_schedule.festival_id IS DISTINCT FROM v_venue.festival_id THEN
    RAISE EXCEPTION 'Selected event is outside this stage.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_schedule.topic_draw_enabled THEN
    RAISE EXCEPTION 'Topic Draw is disabled for the selected event.' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM public.registrations r WHERE r.id = p_registration_id
    AND r.tenant_id = v_schedule.tenant_id AND r.festival_id = v_schedule.festival_id
    AND r.item_id = v_schedule.item_id AND r.status IS DISTINCT FROM 'rejected'
    AND btrim(r.code_letter) = p_expected_code_letter FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected participant or code letter changed. Refresh the preview.' USING ERRCODE = '40001';
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
  AND q.id = p_queue_id AND q.schedule_id = p_schedule_id
    AND q.registration_id = p_registration_id AND q.draw_id = p_draw_id
    AND q.code_letter = p_expected_code_letter AND q.topic_text = p_expected_topic_text
    AND q.item_name = p_expected_item_name
  FOR UPDATE OF q, d;
  IF v_next.id IS NULL THEN
    RAISE EXCEPTION 'Selected topic is no longer ready or has changed. Refresh the preview; no other topic was shown.' USING ERRCODE = '55000';
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
  RETURN public.admin_stage_topic_display_state(p_venue_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_stage_topic_show_selected(uuid, bigint, uuid, uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_stage_topic_show_selected(uuid, bigint, uuid, uuid, uuid, uuid, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_stage_topic_show_next(p_venue_id uuid, p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  RAISE EXCEPTION 'Refresh the app and select the event and participant before Show Next.' USING ERRCODE = '55000';
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_portal_topic_show_selected(
  p_venue_id uuid, p_expected_version bigint,
  p_schedule_id uuid, p_registration_id uuid, p_queue_id uuid, p_draw_id uuid,
  p_expected_code_letter text, p_expected_topic_text text, p_expected_item_name text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant uuid;
  v_schedule public.schedules%ROWTYPE;
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
  IF p_schedule_id IS NULL OR p_registration_id IS NULL OR p_queue_id IS NULL
    OR p_draw_id IS NULL OR p_expected_version IS NULL
    OR p_expected_code_letter IS NULL OR p_expected_topic_text IS NULL
    OR p_expected_item_name IS NULL THEN
    RAISE EXCEPTION 'Select a participant and refresh the topic preview before Show Next.' USING ERRCODE = '22023';
  END IF;
  -- Match draw lock order: schedule first, then stage state. Code-letter edits
  -- serialize through the registration lock; selection is checked again below.
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR v_schedule.venue_id IS DISTINCT FROM p_venue_id
    OR v_schedule.tenant_id IS DISTINCT FROM v_venue.tenant_id
    OR v_schedule.festival_id IS DISTINCT FROM v_venue.festival_id THEN
    RAISE EXCEPTION 'Selected event is outside this stage.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_schedule.topic_draw_enabled THEN
    RAISE EXCEPTION 'Topic Draw is disabled for the selected event.' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM public.registrations r WHERE r.id = p_registration_id
    AND r.tenant_id = v_schedule.tenant_id AND r.festival_id = v_schedule.festival_id
    AND r.item_id = v_schedule.item_id AND r.status IS DISTINCT FROM 'rejected'
    AND btrim(r.code_letter) = p_expected_code_letter FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected participant or code letter changed. Refresh the preview.' USING ERRCODE = '40001';
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
  AND q.id = p_queue_id AND q.schedule_id = p_schedule_id
    AND q.registration_id = p_registration_id AND q.draw_id = p_draw_id
    AND q.code_letter = p_expected_code_letter AND q.topic_text = p_expected_topic_text
    AND q.item_name = p_expected_item_name
  FOR UPDATE OF q, d;
  IF v_next.id IS NULL THEN
    RAISE EXCEPTION 'Selected topic is no longer ready or has changed. Refresh the preview; no other topic was shown.' USING ERRCODE = '55000';
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

REVOKE ALL ON FUNCTION public.stage_portal_topic_show_selected(uuid, bigint, uuid, uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.stage_portal_topic_show_selected(uuid, bigint, uuid, uuid, uuid, uuid, text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stage_portal_topic_show_next(p_venue_id uuid, p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  RAISE EXCEPTION 'Refresh the app and select the event and participant before Show Next.' USING ERRCODE = '55000';
END;
$function$;

COMMIT;
