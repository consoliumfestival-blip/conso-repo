BEGIN;

-- Publish from the persisted draw, not from the presence of a ready-queue row.
-- The existing queue remains the audience/history store. Only the selected
-- participant's pending entry can be prepared and published here.
CREATE OR REPLACE FUNCTION private.publish_saved_stage_draw(
  p_venue_id uuid, p_expected_version bigint,
  p_schedule_id uuid, p_registration_id uuid, p_draw_id uuid,
  p_expected_code_letter text, p_expected_topic_text text,
  p_expected_item_name text, p_expected_duration_seconds integer
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_schedule public.schedules%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_draw private.schedule_topic_draws%ROWTYPE;
  v_state private.stage_topic_display_states%ROWTYPE;
  v_queue private.stage_topic_display_queue%ROWTYPE;
  v_item_name text;
BEGIN
  IF p_venue_id IS NULL OR p_schedule_id IS NULL OR p_registration_id IS NULL
    OR p_draw_id IS NULL OR p_expected_version IS NULL
    OR NULLIF(btrim(p_expected_code_letter), '') IS NULL
    OR p_expected_topic_text IS NULL OR p_expected_item_name IS NULL
    OR p_expected_duration_seconds IS NULL THEN
    RAISE EXCEPTION 'Select an event, participant and saved draw before Show Next.' USING ERRCODE = '22023';
  END IF;

  -- Keep the existing draw lock order: schedule, draw, then stage state.
  -- The registration lock also serializes code/status edits before publishing.
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR v_schedule.venue_id IS DISTINCT FROM p_venue_id
    OR NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.id = p_venue_id
      AND v.tenant_id = v_schedule.tenant_id AND v.festival_id = v_schedule.festival_id) THEN
    RAISE EXCEPTION 'The selected event does not belong to this stage. Refresh the event selection.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_schedule.topic_draw_enabled THEN
    RAISE EXCEPTION 'Topic Draw is disabled for this event.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_registration FROM public.registrations
    WHERE id = p_registration_id FOR UPDATE;
  IF v_registration.id IS NULL THEN
    RAISE EXCEPTION 'The selected participant registration no longer exists.' USING ERRCODE = '55000';
  END IF;
  IF v_registration.tenant_id IS DISTINCT FROM v_schedule.tenant_id THEN
    RAISE EXCEPTION 'Registration ownership does not match this event. Ask an administrator to verify the registration tenant before displaying this draw.' USING ERRCODE = '42501';
  END IF;
  IF v_registration.festival_id IS DISTINCT FROM v_schedule.festival_id
    OR v_registration.item_id IS DISTINCT FROM v_schedule.item_id
    OR v_registration.status = 'rejected' THEN
    RAISE EXCEPTION 'The selected registration is not eligible for this event.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(v_registration.code_letter), '') IS NULL THEN
    RAISE EXCEPTION 'Assign a code letter to the selected participant before showing this saved draw. A new random draw is not required.' USING ERRCODE = '55000';
  END IF;
  IF btrim(v_registration.code_letter) IS DISTINCT FROM p_expected_code_letter THEN
    RAISE EXCEPTION 'The participant code letter changed. Refresh the preview before Show Next.' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_draw FROM private.schedule_topic_draws WHERE id = p_draw_id FOR UPDATE;
  IF v_draw.id IS NULL OR NOT v_draw.is_current
    OR v_draw.schedule_id IS DISTINCT FROM p_schedule_id
    OR v_draw.registration_id IS DISTINCT FROM p_registration_id
    OR v_draw.tenant_id IS DISTINCT FROM v_schedule.tenant_id
    OR v_draw.festival_id IS DISTINCT FROM v_schedule.festival_id THEN
    RAISE EXCEPTION 'This saved draw was replaced or does not belong to the selected participant. Refresh the preview.' USING ERRCODE = '40001';
  END IF;
  IF v_draw.topic_text_snapshot IS DISTINCT FROM p_expected_topic_text THEN
    RAISE EXCEPTION 'The saved topic differs from the preview. Refresh before Show Next.' USING ERRCODE = '40001';
  END IF;
  SELECT COALESCE(NULLIF(btrim(i.item_name_en), ''), NULLIF(btrim(i.item_name_ml), ''),
      NULLIF(btrim(i.item_code), ''), 'Item') INTO v_item_name
    FROM public.items i WHERE i.id = v_schedule.item_id
      AND i.tenant_id = v_schedule.tenant_id AND i.festival_id = v_schedule.festival_id;
  IF v_item_name IS NULL THEN
    RAISE EXCEPTION 'The event item does not match its tenant and festival.' USING ERRCODE = '42501';
  END IF;
  IF v_item_name IS DISTINCT FROM p_expected_item_name
    OR v_schedule.topic_draw_duration_seconds IS DISTINCT FROM p_expected_duration_seconds THEN
    RAISE EXCEPTION 'The event name or display duration changed. Refresh the preview.' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_state FROM private.stage_topic_display_states
    WHERE venue_id = p_venue_id AND tenant_id = v_schedule.tenant_id
      AND festival_id = v_schedule.festival_id FOR UPDATE;
  IF v_state.venue_id IS NULL OR v_state.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Stage display changed. Refresh before Show Next.' USING ERRCODE = '40001';
  END IF;
  IF v_state.paused THEN
    RAISE EXCEPTION 'Resume the stage display before Show Next.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM private.stage_topic_display_queue q
    WHERE q.draw_id = v_draw.id AND q.tenant_id = v_schedule.tenant_id
      AND q.festival_id = v_schedule.festival_id AND q.published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'This saved draw has already been shown. Select the next participant; it will not be replayed automatically.' USING ERRCODE = '55000';
  END IF;

  -- All ownership/preview checks precede queue preparation. This reuses the
  -- same saved draw and never generates or activates a random topic.
  PERFORM private.enqueue_stage_topic_draw(p_schedule_id, p_registration_id, p_draw_id);
  SELECT * INTO v_queue FROM private.stage_topic_display_queue q
    WHERE q.venue_id = p_venue_id AND q.schedule_id = p_schedule_id
      AND q.registration_id = p_registration_id AND q.draw_id = p_draw_id
      AND q.tenant_id = v_schedule.tenant_id AND q.festival_id = v_schedule.festival_id
      AND q.code_letter = p_expected_code_letter AND q.topic_text = p_expected_topic_text
      AND q.item_name = p_expected_item_name AND q.published_at IS NULL FOR UPDATE;
  IF v_queue.id IS NULL THEN
    RAISE EXCEPTION 'The selected saved draw could not be prepared for this stage. No topic was displayed.' USING ERRCODE = '55000';
  END IF;
  UPDATE private.stage_topic_display_queue SET published_at = clock_timestamp(),
    duration_seconds = v_schedule.topic_draw_duration_seconds WHERE id = v_queue.id;
  UPDATE private.stage_topic_display_states
    SET published_queue_id = v_queue.id, version = version + 1 WHERE venue_id = p_venue_id;
END;
$function$;
REVOKE ALL ON FUNCTION private.publish_saved_stage_draw(uuid,bigint,uuid,uuid,uuid,text,text,text,integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_stage_topic_show_draw(
  p_venue_id uuid, p_expected_version bigint,
  p_schedule_id uuid, p_registration_id uuid, p_draw_id uuid,
  p_expected_code_letter text, p_expected_topic_text text,
  p_expected_item_name text, p_expected_duration_seconds integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_actor_tenant uuid; v_venue public.venues%ROWTYPE;
BEGIN
  v_actor_tenant := public.stage_assert_admin_access();
  SELECT * INTO v_venue FROM public.venues WHERE id = p_venue_id;
  IF v_venue.id IS NULL OR
    (v_venue.tenant_id IS DISTINCT FROM v_actor_tenant AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Stage is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  PERFORM private.publish_saved_stage_draw(p_venue_id,p_expected_version,p_schedule_id,
    p_registration_id,p_draw_id,p_expected_code_letter,p_expected_topic_text,
    p_expected_item_name,p_expected_duration_seconds);
  RETURN public.admin_stage_topic_display_state(p_venue_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_stage_topic_show_draw(uuid,bigint,uuid,uuid,uuid,text,text,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stage_topic_show_draw(uuid,bigint,uuid,uuid,uuid,text,text,text,integer)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stage_portal_topic_show_draw(
  p_venue_id uuid, p_expected_version bigint,
  p_schedule_id uuid, p_registration_id uuid, p_draw_id uuid,
  p_expected_code_letter text, p_expected_topic_text text,
  p_expected_item_name text, p_expected_duration_seconds integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  PERFORM private.assert_stage_topic_portal(p_venue_id,p_schedule_id);
  PERFORM private.publish_saved_stage_draw(p_venue_id,p_expected_version,p_schedule_id,
    p_registration_id,p_draw_id,p_expected_code_letter,p_expected_topic_text,
    p_expected_item_name,p_expected_duration_seconds);
  RETURN public.stage_portal_topic_display_state(p_venue_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.stage_portal_topic_show_draw(uuid,bigint,uuid,uuid,uuid,text,text,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_portal_topic_show_draw(uuid,bigint,uuid,uuid,uuid,text,text,text,integer)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
