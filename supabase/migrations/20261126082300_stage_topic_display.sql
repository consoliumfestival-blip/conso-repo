-- Stage-scoped, read-only audience display. The existing schedule-token display
-- and judge topic labels remain independent of this stage queue.
CREATE TABLE private.stage_topic_display_states (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  festival_id uuid NOT NULL,
  display_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  paused boolean NOT NULL DEFAULT false,
  published_queue_id uuid,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE private.stage_topic_display_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  venue_id uuid NOT NULL REFERENCES private.stage_topic_display_states(venue_id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  festival_id uuid NOT NULL,
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL,
  draw_id uuid NOT NULL REFERENCES private.schedule_topic_draws(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  code_letter text NOT NULL CHECK (btrim(code_letter) <> ''),
  topic_text text NOT NULL CHECK (btrim(topic_text) <> ''),
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 60 AND 86400),
  queued_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE UNIQUE INDEX stage_topic_display_pending_registration_idx
  ON private.stage_topic_display_queue(venue_id, schedule_id, registration_id)
  WHERE published_at IS NULL;
CREATE INDEX stage_topic_display_next_idx
  ON private.stage_topic_display_queue(venue_id, sequence)
  WHERE published_at IS NULL;
CREATE INDEX stage_topic_display_draw_idx
  ON private.stage_topic_display_queue(venue_id, draw_id);
ALTER TABLE private.stage_topic_display_states
  ADD CONSTRAINT stage_topic_display_published_fk
  FOREIGN KEY (published_queue_id) REFERENCES private.stage_topic_display_queue(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE private.stage_topic_display_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.stage_topic_display_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.stage_topic_display_states, private.stage_topic_display_queue
  FROM PUBLIC, anon, authenticated;

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
BEGIN
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id;
  -- A venue or code letter may be assigned later. The historical draw remains
  -- valid; only the stage display queue waits for complete stage context.
  IF v_schedule.venue_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_venue FROM public.venues WHERE id = v_schedule.venue_id
    AND tenant_id = v_schedule.tenant_id AND festival_id = v_schedule.festival_id;
  IF v_venue.id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_registration FROM public.registrations
    WHERE id = p_registration_id AND tenant_id = v_schedule.tenant_id
      AND festival_id = v_schedule.festival_id AND item_id = v_schedule.item_id
      AND status IS DISTINCT FROM 'rejected';
  IF v_registration.id IS NULL OR NULLIF(btrim(v_registration.code_letter), '') IS NULL THEN
    RETURN;
  END IF;
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
  -- A re-draw after a venue move supersedes the unpublished entry at the old
  -- stage. Published screens remain historical snapshots.
  DELETE FROM private.stage_topic_display_queue q
  WHERE q.schedule_id = p_schedule_id AND q.registration_id = p_registration_id
    AND q.venue_id <> v_venue.id AND q.published_at IS NULL;
  -- Keep a pending entry in its original FIFO position when it is re-drawn;
  -- never put an already-published draw back into the queue.
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
    p_registration_id, p_draw_id, v_item_name, btrim(v_registration.code_letter),
    v_draw.topic_text_snapshot, v_schedule.topic_draw_duration_seconds
  )
  ON CONFLICT (venue_id, schedule_id, registration_id) WHERE published_at IS NULL
  DO UPDATE SET draw_id = EXCLUDED.draw_id, item_name = EXCLUDED.item_name,
    code_letter = EXCLUDED.code_letter, topic_text = EXCLUDED.topic_text,
    duration_seconds = EXCLUDED.duration_seconds;
END;
$function$;
REVOKE ALL ON FUNCTION private.enqueue_stage_topic_draw(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

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
CREATE OR REPLACE FUNCTION public.admin_stage_topic_show_next(
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
  v_actor_tenant := public.stage_assert_admin_access();
  SELECT * INTO v_venue FROM public.venues WHERE id = p_venue_id;
  IF v_venue.id IS NULL OR
    (v_venue.tenant_id <> v_actor_tenant AND NOT public.is_superadmin()) THEN
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
  RETURN public.admin_stage_topic_display_state(p_venue_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_stage_topic_set_paused(
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
  v_actor_tenant := public.stage_assert_admin_access();
  SELECT * INTO v_venue FROM public.venues WHERE id = p_venue_id;
  IF v_venue.id IS NULL OR
    (v_venue.tenant_id <> v_actor_tenant AND NOT public.is_superadmin()) THEN
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
  RETURN public.admin_stage_topic_display_state(p_venue_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_stage_topic_display(p_display_token uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'version', state.version, 'paused', state.paused,
    'server_time', now(),
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

REVOKE ALL ON FUNCTION public.admin_stage_topic_display_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stage_topic_display_state(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_stage_topic_show_next(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stage_topic_show_next(uuid, bigint) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_stage_topic_set_paused(uuid, boolean, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stage_topic_set_paused(uuid, boolean, bigint) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_stage_topic_display(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stage_topic_display(uuid) TO anon, authenticated, service_role;

-- Preserve the existing draw transaction and judge notification; enqueue only after the draw succeeds.
CREATE OR REPLACE FUNCTION public.stage_draw_schedule_topic(
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
  v_actor_tenant_id := public.stage_assert_admin_access();
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR (v_schedule.tenant_id <> v_actor_tenant_id AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_schedule.topic_draw_enabled THEN RAISE EXCEPTION 'Topic Draw is disabled for this schedule.' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.get_stage_management_registrations_scoped(p_schedule_id, NULL) r
    WHERE r.id = p_registration_id AND r.status IS DISTINCT FROM 'rejected'
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
  IF v_topic.id IS NULL THEN RAISE EXCEPTION 'No active topics are available. Activate a topic in Stage Management.' USING ERRCODE = '55000'; END IF;

  IF v_old.id IS NOT NULL THEN
    UPDATE private.schedule_topic_draws SET is_current = false WHERE id = v_old.id;
  END IF;
  UPDATE private.schedule_topics
  SET is_active = false, updated_by = auth.uid(), updated_at = now()
  WHERE id = v_topic.id;

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
