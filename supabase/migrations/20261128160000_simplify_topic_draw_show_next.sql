-- Simplify Topic Draw & Show Next for live speech/stage workflows:
-- 1. Keep active topics permanently in the random pool (no auto-disable, no predictable reload cycles).
-- 2. Drawing for the next participant queues the draw without changing the live Audience screen.
-- 3. Remove unnecessary Show Next blockers (replay ban, version lock, 4-field preview mismatch,
--    paused block, mandatory code_letter gate, judging_started draw error, duration mismatch).
-- 4. Expose draw_id on on_screen so Show Next knows when to advance to the next queued draw.

BEGIN;

-- Ensure stage_topic_registration_in_scope exists (compatibility for standalone test fixtures).
DO $ensure_scope$
BEGIN
  IF to_regprocedure('private.stage_topic_registration_in_scope(public.registrations, public.schedules)') IS NULL THEN
    CREATE FUNCTION private.stage_topic_registration_in_scope(
      p_registration public.registrations, p_schedule public.schedules
    )
    RETURNS boolean LANGUAGE sql STABLE SET search_path = ''
    AS $fn$
      SELECT COALESCE(
        (p_registration).tenant_id = (p_schedule).tenant_id
        AND (p_registration).festival_id = (p_schedule).festival_id
        AND (p_registration).item_id = (p_schedule).item_id
        AND (p_registration).status IS DISTINCT FROM 'rejected',
        false
      );
    $fn$;
    REVOKE ALL ON FUNCTION private.stage_topic_registration_in_scope(public.registrations, public.schedules)
      FROM PUBLIC, anon, authenticated;
  END IF;
END $ensure_scope$;

-- 1. Allow drawing without judging_started errors and without auto-disabling topics.
CREATE OR REPLACE FUNCTION public.stage_draw_schedule_topic(
  p_schedule_id uuid,
  p_registration_id uuid,
  p_confirm_redraw boolean DEFAULT true,
  p_confirm_judging_started boolean DEFAULT true
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
  v_actor_tenant_id := public.stage_assert_admin_access();
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR (v_schedule.tenant_id <> v_actor_tenant_id AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_schedule.topic_draw_enabled THEN
    RAISE EXCEPTION 'Topic Draw is disabled for this schedule.' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.get_stage_management_registrations_scoped(p_schedule_id, NULL) r
    WHERE r.id = p_registration_id AND r.status IS DISTINCT FROM 'rejected'
  ) THEN
    RAISE EXCEPTION 'Participant is not eligible for this schedule.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old FROM private.schedule_topic_draws
  WHERE schedule_id = p_schedule_id AND registration_id = p_registration_id AND is_current
  FOR UPDATE;
  IF v_old.id IS NOT NULL AND NOT COALESCE(p_confirm_redraw, true) THEN
    RAISE EXCEPTION 'A topic is already assigned. Confirm redraw before changing it.' USING ERRCODE = '55000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.mark_entries m WHERE m.schedule_id = p_schedule_id AND m.tenant_id = v_schedule.tenant_id
  ) INTO v_judging_started;

  -- Pure random selection across ALL active topics; topics stay active so draws remain unpredictable.
  SELECT * INTO v_topic FROM private.schedule_topics
  WHERE schedule_id = p_schedule_id AND tenant_id = v_schedule.tenant_id
    AND is_active AND NOT is_deleted
  ORDER BY random()
  LIMIT 1
  FOR UPDATE;
  IF v_topic.id IS NULL THEN
    RAISE EXCEPTION 'No active topics are available. Add or enable a topic first.' USING ERRCODE = '55000';
  END IF;

  IF v_old.id IS NOT NULL THEN
    UPDATE private.schedule_topic_draws SET is_current = false WHERE id = v_old.id;
  END IF;

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

  -- Enqueue into pending stage queue ONLY (published_queue_id on Audience screen is NOT touched).
  PERFORM private.enqueue_stage_topic_draw(p_schedule_id, p_registration_id, v_new.id);

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

CREATE OR REPLACE FUNCTION public.stage_portal_draw_topic(
  p_venue_id uuid,
  p_schedule_id uuid,
  p_registration_id uuid,
  p_confirm_redraw boolean DEFAULT true,
  p_confirm_judging_started boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_schedule public.schedules%ROWTYPE;
  v_old private.schedule_topic_draws%ROWTYPE;
  v_topic private.schedule_topics%ROWTYPE;
  v_new private.schedule_topic_draws%ROWTYPE;
  v_judging_started boolean;
BEGIN
  PERFORM private.assert_stage_topic_portal(p_venue_id, p_schedule_id);
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR v_schedule.venue_id IS DISTINCT FROM p_venue_id THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_schedule.topic_draw_enabled THEN
    RAISE EXCEPTION 'Topic Draw is disabled for this schedule.' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.stage_venue_portal_schedule_detail_v2(p_venue_id, '', p_schedule_id)->'registrations'
    ) r WHERE r->>'id' = p_registration_id::text AND r->>'status' IS DISTINCT FROM 'rejected'
  ) THEN
    RAISE EXCEPTION 'Participant is not eligible for this schedule.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old FROM private.schedule_topic_draws
  WHERE schedule_id = p_schedule_id AND registration_id = p_registration_id AND is_current
  FOR UPDATE;
  IF v_old.id IS NOT NULL AND NOT COALESCE(p_confirm_redraw, true) THEN
    RAISE EXCEPTION 'A topic is already assigned. Confirm redraw before changing it.' USING ERRCODE = '55000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.mark_entries m WHERE m.schedule_id = p_schedule_id AND m.tenant_id = v_schedule.tenant_id
  ) INTO v_judging_started;

  SELECT * INTO v_topic FROM private.schedule_topics
  WHERE schedule_id = p_schedule_id AND tenant_id = v_schedule.tenant_id
    AND is_active AND NOT is_deleted
  ORDER BY random()
  LIMIT 1
  FOR UPDATE;
  IF v_topic.id IS NULL THEN
    RAISE EXCEPTION 'No active topics are available. Add or enable a topic first.' USING ERRCODE = '55000';
  END IF;

  IF v_old.id IS NOT NULL THEN
    UPDATE private.schedule_topic_draws SET is_current = false WHERE id = v_old.id;
  END IF;

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

-- 2. Enqueue without requiring code_letter (fallback cleanly to chest number or '—').
CREATE OR REPLACE FUNCTION private.enqueue_stage_topic_draw(
  p_schedule_id uuid, p_registration_id uuid, p_draw_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_schedule public.schedules%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_draw private.schedule_topic_draws%ROWTYPE;
  v_venue public.venues%ROWTYPE;
  v_item_name text;
  v_display_code text;
  v_duration integer;
BEGIN
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id;
  IF v_schedule.venue_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_venue FROM public.venues WHERE id = v_schedule.venue_id
    AND tenant_id = v_schedule.tenant_id AND festival_id = v_schedule.festival_id;
  IF v_venue.id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_registration FROM public.registrations
    WHERE id = p_registration_id
      AND private.stage_topic_registration_in_scope(registrations, v_schedule);
  IF v_registration.id IS NULL THEN RETURN; END IF;

  v_display_code := COALESCE(NULLIF(btrim(v_registration.code_letter), ''), '—');

  SELECT * INTO v_draw FROM private.schedule_topic_draws
    WHERE id = p_draw_id AND schedule_id = p_schedule_id
      AND registration_id = p_registration_id AND tenant_id = v_schedule.tenant_id
      AND festival_id = v_schedule.festival_id AND is_current;
  IF v_draw.id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(NULLIF(btrim(i.item_name_en), ''), NULLIF(btrim(i.item_name_ml), ''),
      NULLIF(btrim(i.item_code), ''), 'Item')
    INTO v_item_name FROM public.items i
    WHERE i.id = v_schedule.item_id AND i.tenant_id = v_schedule.tenant_id
      AND i.festival_id = v_schedule.festival_id;
  IF v_item_name IS NULL THEN RETURN; END IF;

  v_duration := GREATEST(60, LEAST(86400, COALESCE(v_schedule.topic_draw_duration_seconds, 300)));

  INSERT INTO private.stage_topic_display_states (venue_id, tenant_id, festival_id)
    VALUES (v_venue.id, v_venue.tenant_id, v_venue.festival_id)
    ON CONFLICT (venue_id) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM private.stage_topic_display_states state
    WHERE state.venue_id = v_venue.id AND state.tenant_id = v_venue.tenant_id
      AND state.festival_id = v_venue.festival_id
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Stage ownership changed.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM private.stage_topic_display_queue q
  WHERE q.schedule_id = p_schedule_id AND q.registration_id = p_registration_id
    AND q.venue_id <> v_venue.id AND q.published_at IS NULL;

  IF EXISTS (
    SELECT 1 FROM private.stage_topic_display_queue q
    WHERE q.venue_id = v_venue.id AND q.draw_id = p_draw_id
      AND q.published_at IS NOT NULL
  ) THEN RETURN; END IF;

  INSERT INTO private.stage_topic_display_queue (
    venue_id, tenant_id, festival_id, schedule_id, registration_id, draw_id,
    item_name, code_letter, topic_text, duration_seconds
  ) VALUES (
    v_venue.id, v_venue.tenant_id, v_venue.festival_id, p_schedule_id,
    p_registration_id, p_draw_id, v_item_name, v_display_code,
    v_draw.topic_text_snapshot, v_duration
  )
  ON CONFLICT (venue_id, schedule_id, registration_id) WHERE published_at IS NULL
  DO UPDATE SET draw_id = EXCLUDED.draw_id, item_name = EXCLUDED.item_name,
    code_letter = EXCLUDED.code_letter, topic_text = EXCLUDED.topic_text,
    duration_seconds = EXCLUDED.duration_seconds;
END;
$function$;

-- 3. Display states include draw_id on on_screen and do not drop items missing code_letter.
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
      SELECT jsonb_build_object(
        'draw_id', q.draw_id,
        'item_name', q.item_name,
        'code_letter', q.code_letter,
        'topic_text', q.topic_text,
        'duration_seconds', q.duration_seconds,
        'published_at', q.published_at
      )
      FROM private.stage_topic_display_queue q
      WHERE q.id = v_state.published_queue_id AND q.venue_id = v_state.venue_id
        AND q.tenant_id = v_state.tenant_id AND q.festival_id = v_state.festival_id
    ),
    'ready', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id,
        'schedule_id', q.schedule_id,
        'registration_id', q.registration_id,
        'draw_id', q.draw_id,
        'item_name', q.item_name,
        'code_letter', COALESCE(NULLIF(btrim(r.code_letter), ''), q.code_letter),
        'topic_text', q.topic_text,
        'duration_seconds', q.duration_seconds
      ) ORDER BY q.sequence)
      FROM private.stage_topic_display_queue q
      JOIN public.schedules s ON s.id = q.schedule_id AND s.venue_id = q.venue_id
        AND s.tenant_id = q.tenant_id AND s.festival_id = q.festival_id
        AND s.topic_draw_enabled
      JOIN private.schedule_topic_draws d ON d.id = q.draw_id
        AND d.schedule_id = q.schedule_id AND d.registration_id = q.registration_id
        AND d.tenant_id = q.tenant_id AND d.is_current
      JOIN public.registrations r ON r.id = q.registration_id
        AND private.stage_topic_registration_in_scope(r, s)
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
  IF v_venue.id IS NULL OR v_venue.tenant_id <> v_actor_tenant THEN
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
      SELECT jsonb_build_object(
        'draw_id', q.draw_id,
        'item_name', q.item_name,
        'code_letter', q.code_letter,
        'topic_text', q.topic_text,
        'duration_seconds', q.duration_seconds,
        'published_at', q.published_at
      )
      FROM private.stage_topic_display_queue q
      WHERE q.id = v_state.published_queue_id AND q.venue_id = v_state.venue_id
        AND q.tenant_id = v_state.tenant_id AND q.festival_id = v_state.festival_id
    ),
    'ready', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id,
        'schedule_id', q.schedule_id,
        'registration_id', q.registration_id,
        'draw_id', q.draw_id,
        'item_name', q.item_name,
        'code_letter', COALESCE(NULLIF(btrim(r.code_letter), ''), q.code_letter),
        'topic_text', q.topic_text,
        'duration_seconds', q.duration_seconds
      ) ORDER BY q.sequence)
      FROM private.stage_topic_display_queue q
      JOIN public.schedules s ON s.id = q.schedule_id AND s.venue_id = q.venue_id
        AND s.tenant_id = q.tenant_id AND s.festival_id = q.festival_id
        AND s.topic_draw_enabled
      JOIN private.schedule_topic_draws d ON d.id = q.draw_id
        AND d.schedule_id = q.schedule_id AND d.registration_id = q.registration_id
        AND d.tenant_id = q.tenant_id AND d.is_current
      JOIN public.registrations r ON r.id = q.registration_id
        AND private.stage_topic_registration_in_scope(r, s)
      WHERE q.venue_id = v_state.venue_id AND q.tenant_id = v_state.tenant_id
        AND q.festival_id = v_state.festival_id AND q.published_at IS NULL
    ), '[]'::jsonb)
  );
END;
$function$;

-- 4. Direct Show Next without version/snapshot/replay/paused/code-letter blocks.
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
  v_display_code text;
  v_duration integer;
BEGIN
  IF p_venue_id IS NULL OR p_schedule_id IS NULL OR p_registration_id IS NULL THEN
    RAISE EXCEPTION 'Select an event and participant before Show Next.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR v_schedule.venue_id IS DISTINCT FROM p_venue_id
    OR NOT EXISTS (
      SELECT 1 FROM public.venues v WHERE v.id = p_venue_id
        AND v.tenant_id = v_schedule.tenant_id AND v.festival_id = v_schedule.festival_id
    ) THEN
    RAISE EXCEPTION 'The selected event does not belong to this stage.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_schedule.topic_draw_enabled THEN
    RAISE EXCEPTION 'Topic Draw is disabled for this event.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_registration FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF v_registration.id IS NULL OR NOT private.stage_topic_registration_in_scope(v_registration, v_schedule) THEN
    RAISE EXCEPTION 'The selected participant registration is not eligible for this event.' USING ERRCODE = '42501';
  END IF;

  -- Prefer current draw for this participant; fall back to explicit p_draw_id if needed.
  SELECT * INTO v_draw FROM private.schedule_topic_draws
    WHERE schedule_id = p_schedule_id
      AND registration_id = p_registration_id
      AND tenant_id = v_schedule.tenant_id
      AND festival_id = v_schedule.festival_id
      AND is_current
    FOR UPDATE;
  IF v_draw.id IS NULL AND p_draw_id IS NOT NULL THEN
    SELECT * INTO v_draw FROM private.schedule_topic_draws WHERE id = p_draw_id FOR UPDATE;
  END IF;
  IF v_draw.id IS NULL THEN
    RAISE EXCEPTION 'No drawn topic found for this participant. Draw a topic first.' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(NULLIF(btrim(i.item_name_en), ''), NULLIF(btrim(i.item_name_ml), ''),
      NULLIF(btrim(i.item_code), ''), 'Item') INTO v_item_name
    FROM public.items i WHERE i.id = v_schedule.item_id
      AND i.tenant_id = v_schedule.tenant_id AND i.festival_id = v_schedule.festival_id;
  v_item_name := COALESCE(v_item_name, 'Item');
  v_display_code := COALESCE(NULLIF(btrim(v_registration.code_letter), ''), '—');
  v_duration := GREATEST(60, LEAST(86400, COALESCE(v_schedule.topic_draw_duration_seconds, 300)));

  INSERT INTO private.stage_topic_display_states (venue_id, tenant_id, festival_id)
    VALUES (p_venue_id, v_schedule.tenant_id, v_schedule.festival_id)
    ON CONFLICT (venue_id) DO NOTHING;

  SELECT * INTO v_state FROM private.stage_topic_display_states
    WHERE venue_id = p_venue_id AND tenant_id = v_schedule.tenant_id
      AND festival_id = v_schedule.festival_id FOR UPDATE;

  -- Reuse existing pending or previously-shown queue row for this draw, or create one.
  SELECT * INTO v_queue FROM private.stage_topic_display_queue q
    WHERE q.venue_id = p_venue_id
      AND q.draw_id = v_draw.id
      AND q.tenant_id = v_schedule.tenant_id
      AND q.festival_id = v_schedule.festival_id
    ORDER BY q.published_at NULLS FIRST, q.sequence DESC
    LIMIT 1
    FOR UPDATE;

  IF v_queue.id IS NULL THEN
    PERFORM private.enqueue_stage_topic_draw(p_schedule_id, p_registration_id, v_draw.id);
    SELECT * INTO v_queue FROM private.stage_topic_display_queue q
      WHERE q.venue_id = p_venue_id
        AND q.schedule_id = p_schedule_id
        AND q.registration_id = p_registration_id
        AND q.draw_id = v_draw.id
        AND q.tenant_id = v_schedule.tenant_id
        AND q.festival_id = v_schedule.festival_id
      ORDER BY q.published_at NULLS FIRST, q.sequence DESC
      LIMIT 1
      FOR UPDATE;
  END IF;

  IF v_queue.id IS NULL THEN
    RAISE EXCEPTION 'Could not prepare this draw for display.' USING ERRCODE = '55000';
  END IF;

  UPDATE private.stage_topic_display_queue
  SET
    item_name = v_item_name,
    code_letter = v_display_code,
    topic_text = v_draw.topic_text_snapshot,
    duration_seconds = v_duration,
    published_at = clock_timestamp()
  WHERE id = v_queue.id;

  -- Auto-resume if paused and publish immediately.
  UPDATE private.stage_topic_display_states
  SET
    paused = false,
    published_queue_id = v_queue.id,
    version = version + 1
  WHERE venue_id = p_venue_id;
END;
$function$;

-- 5. Simplify FIFO Show Next RPCs (auto-unpause, ignore stale expected_version).
CREATE OR REPLACE FUNCTION public.admin_stage_topic_show_next(
  p_venue_id uuid, p_expected_version bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant uuid;
  v_venue public.venues%ROWTYPE;
  v_state private.stage_topic_display_states%ROWTYPE;
  v_next private.stage_topic_display_queue%ROWTYPE;
  v_display_code text;
BEGIN
  v_actor_tenant := public.stage_assert_admin_access();
  SELECT * INTO v_venue FROM public.venues WHERE id = p_venue_id;
  IF v_venue.id IS NULL OR
    (v_venue.tenant_id <> v_actor_tenant AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Stage is outside the current tenant.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO private.stage_topic_display_states (venue_id, tenant_id, festival_id)
    VALUES (v_venue.id, v_venue.tenant_id, v_venue.festival_id)
    ON CONFLICT (venue_id) DO NOTHING;

  SELECT * INTO v_state FROM private.stage_topic_display_states
    WHERE venue_id = p_venue_id AND tenant_id = v_venue.tenant_id
      AND festival_id = v_venue.festival_id FOR UPDATE;

  SELECT q.* INTO v_next
  FROM private.stage_topic_display_queue q
  JOIN public.schedules s ON s.id = q.schedule_id AND s.venue_id = q.venue_id
    AND s.tenant_id = q.tenant_id AND s.festival_id = q.festival_id
    AND s.topic_draw_enabled
  JOIN private.schedule_topic_draws d ON d.id = q.draw_id
    AND d.schedule_id = q.schedule_id AND d.registration_id = q.registration_id
    AND d.tenant_id = q.tenant_id AND d.is_current
  JOIN public.registrations r ON r.id = q.registration_id
    AND private.stage_topic_registration_in_scope(r, s)
  WHERE q.venue_id = v_state.venue_id AND q.tenant_id = v_state.tenant_id
    AND q.festival_id = v_state.festival_id AND q.published_at IS NULL
  ORDER BY q.sequence ASC
  LIMIT 1
  FOR UPDATE OF q;

  IF v_next.id IS NULL THEN
    RAISE EXCEPTION 'No queued drawn topic waiting. Draw a topic for a participant first.' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(NULLIF(btrim(r.code_letter), ''), v_next.code_letter) INTO v_display_code
  FROM public.registrations r WHERE r.id = v_next.registration_id;

  UPDATE private.stage_topic_display_queue
  SET published_at = clock_timestamp(),
      code_letter = COALESCE(v_display_code, v_next.code_letter)
  WHERE id = v_next.id;

  UPDATE private.stage_topic_display_states
  SET paused = false, published_queue_id = v_next.id, version = version + 1
  WHERE venue_id = p_venue_id;

  RETURN public.admin_stage_topic_display_state(p_venue_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_portal_topic_show_next(
  p_venue_id uuid, p_expected_version bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_state private.stage_topic_display_states%ROWTYPE;
  v_next private.stage_topic_display_queue%ROWTYPE;
  v_display_code text;
BEGIN
  PERFORM private.assert_stage_topic_portal(p_venue_id);
  SELECT * INTO v_venue FROM public.venues WHERE id = p_venue_id;
  IF v_venue.id IS NULL THEN
    RAISE EXCEPTION 'Invalid stage link.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO private.stage_topic_display_states (venue_id, tenant_id, festival_id)
    VALUES (v_venue.id, v_venue.tenant_id, v_venue.festival_id)
    ON CONFLICT (venue_id) DO NOTHING;

  SELECT * INTO v_state FROM private.stage_topic_display_states
    WHERE venue_id = p_venue_id AND tenant_id = v_venue.tenant_id
      AND festival_id = v_venue.festival_id FOR UPDATE;

  SELECT q.* INTO v_next
  FROM private.stage_topic_display_queue q
  JOIN public.schedules s ON s.id = q.schedule_id AND s.venue_id = q.venue_id
    AND s.tenant_id = q.tenant_id AND s.festival_id = q.festival_id
    AND s.topic_draw_enabled
  JOIN private.schedule_topic_draws d ON d.id = q.draw_id
    AND d.schedule_id = q.schedule_id AND d.registration_id = q.registration_id
    AND d.tenant_id = q.tenant_id AND d.is_current
  JOIN public.registrations r ON r.id = q.registration_id
    AND private.stage_topic_registration_in_scope(r, s)
  WHERE q.venue_id = v_state.venue_id AND q.tenant_id = v_state.tenant_id
    AND q.festival_id = v_state.festival_id AND q.published_at IS NULL
  ORDER BY q.sequence ASC
  LIMIT 1
  FOR UPDATE OF q;

  IF v_next.id IS NULL THEN
    RAISE EXCEPTION 'No queued drawn topic waiting. Draw a topic for a participant first.' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(NULLIF(btrim(r.code_letter), ''), v_next.code_letter) INTO v_display_code
  FROM public.registrations r WHERE r.id = v_next.registration_id;

  UPDATE private.stage_topic_display_queue
  SET published_at = clock_timestamp(),
      code_letter = COALESCE(v_display_code, v_next.code_letter)
  WHERE id = v_next.id;

  UPDATE private.stage_topic_display_states
  SET paused = false, published_queue_id = v_next.id, version = version + 1
  WHERE venue_id = p_venue_id;

  RETURN public.stage_portal_topic_display_state(p_venue_id);
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
