ALTER TABLE public.schedules
  ADD COLUMN topic_draw_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE private.schedule_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  festival_id uuid NOT NULL,
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  topic_text text NOT NULL CHECK (length(btrim(topic_text)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, schedule_id)
);

CREATE INDEX schedule_topics_pool_idx
  ON private.schedule_topics (schedule_id, is_active)
  WHERE is_deleted = false;

CREATE TABLE private.schedule_topic_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  festival_id uuid NOT NULL,
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  -- Keep the registration identifier as an audit reference so deleting a
  -- participant cannot erase a prior draw or redraw history.
  registration_id uuid NOT NULL,
  topic_id uuid NOT NULL,
  topic_text_snapshot text NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  replaces_assignment_id uuid REFERENCES private.schedule_topic_draws(id),
  drawn_by uuid REFERENCES auth.users(id),
  drawn_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_topic_draws_topic_schedule_fk
    FOREIGN KEY (topic_id, schedule_id)
    REFERENCES private.schedule_topics(id, schedule_id)
);

CREATE UNIQUE INDEX schedule_topic_draws_current_registration_unique
  ON private.schedule_topic_draws (schedule_id, registration_id)
  WHERE is_current;

CREATE INDEX schedule_topic_draws_schedule_history_idx
  ON private.schedule_topic_draws (schedule_id, drawn_at DESC);

CREATE TABLE private.schedule_topic_display_states (
  schedule_id uuid PRIMARY KEY REFERENCES public.schedules(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  display_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  displayed_assignment_id uuid REFERENCES private.schedule_topic_draws(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.schedule_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.schedule_topic_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.schedule_topic_display_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON private.schedule_topics, private.schedule_topic_draws,
  private.schedule_topic_display_states FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_schedule_topic_display_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.topic_draw_enabled IS TRUE THEN
    INSERT INTO private.schedule_topic_display_states (schedule_id, tenant_id)
    VALUES (NEW.id, NEW.tenant_id)
    ON CONFLICT (schedule_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id;
  ELSE
    UPDATE private.schedule_topic_display_states
    SET displayed_assignment_id = NULL
    WHERE schedule_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER schedules_sync_topic_display_state
AFTER INSERT OR UPDATE OF topic_draw_enabled ON public.schedules
FOR EACH ROW EXECUTE FUNCTION private.sync_schedule_topic_display_state();

CREATE OR REPLACE FUNCTION public.admin_schedule_topic_draw_state(p_schedule_id uuid)
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
  v_actor_tenant_id := public.stage_assert_admin_access();
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id;
  IF v_schedule.id IS NULL OR (v_schedule.tenant_id <> v_actor_tenant_id AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_display_state FROM private.schedule_topic_display_states
  WHERE schedule_id = p_schedule_id AND tenant_id = v_schedule.tenant_id;

  RETURN jsonb_build_object(
    'enabled', v_schedule.topic_draw_enabled,
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

CREATE OR REPLACE FUNCTION public.admin_save_schedule_topics(p_schedule_id uuid, p_topics jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_row jsonb;
  v_id uuid;
  v_topic_id uuid;
  v_topic_text text;
  v_result jsonb := '[]'::jsonb;
BEGIN
  v_actor_tenant_id := public.stage_assert_admin_access();
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR (v_schedule.tenant_id <> v_actor_tenant_id AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_topics) <> 'array' THEN RAISE EXCEPTION 'Topics must be an array.' USING ERRCODE = '22023'; END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_topics)
  LOOP
    v_topic_text := btrim(v_row->>'topic_text');
    IF v_topic_text IS NULL OR v_topic_text = '' THEN RAISE EXCEPTION 'Topic text cannot be empty.' USING ERRCODE = '22023'; END IF;
    v_id := NULLIF(v_row->>'id', '')::uuid;
    IF v_id IS NULL THEN
      INSERT INTO private.schedule_topics (tenant_id, festival_id, schedule_id, topic_text, created_by, updated_by)
      VALUES (v_schedule.tenant_id, v_schedule.festival_id, v_schedule.id, v_topic_text, auth.uid(), auth.uid())
      RETURNING id INTO v_topic_id;
    ELSE
      UPDATE private.schedule_topics
      SET topic_text = v_topic_text, updated_by = auth.uid(), updated_at = now()
      WHERE id = v_id AND schedule_id = v_schedule.id AND tenant_id = v_schedule.tenant_id AND NOT is_deleted
      RETURNING id INTO v_topic_id;
      IF v_topic_id IS NULL THEN RAISE EXCEPTION 'Topic does not belong to this schedule.' USING ERRCODE = '42501'; END IF;
    END IF;
    v_result := v_result || jsonb_build_array(jsonb_build_object('id', v_topic_id, 'topic_text', v_topic_text));
  END LOOP;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_schedule_topic(p_schedule_id uuid, p_topic_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
BEGIN
  v_actor_tenant_id := public.stage_assert_admin_access();
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR (v_schedule.tenant_id <> v_actor_tenant_id AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  UPDATE private.schedule_topics
  SET is_active = false, is_deleted = true, updated_by = auth.uid(), updated_at = now()
  WHERE id = p_topic_id AND schedule_id = p_schedule_id AND tenant_id = v_schedule.tenant_id AND NOT is_deleted;
  IF NOT FOUND THEN RAISE EXCEPTION 'Topic does not belong to this schedule.' USING ERRCODE = '42501'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_set_schedule_topic_active(p_schedule_id uuid, p_topic_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
BEGIN
  v_actor_tenant_id := public.stage_assert_admin_access();
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR (v_schedule.tenant_id <> v_actor_tenant_id AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_schedule.topic_draw_enabled THEN RAISE EXCEPTION 'Topic Draw is disabled for this schedule.' USING ERRCODE = '55000'; END IF;
  UPDATE private.schedule_topics
  SET is_active = p_active, updated_by = auth.uid(), updated_at = now()
  WHERE id = p_topic_id AND schedule_id = p_schedule_id AND tenant_id = v_schedule.tenant_id AND NOT is_deleted;
  IF NOT FOUND THEN RAISE EXCEPTION 'Topic does not belong to this schedule.' USING ERRCODE = '42501'; END IF;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.stage_set_schedule_topic_display(p_schedule_id uuid, p_assignment_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
BEGIN
  v_actor_tenant_id := public.stage_assert_admin_access();
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR (v_schedule.tenant_id <> v_actor_tenant_id AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_schedule.topic_draw_enabled THEN RAISE EXCEPTION 'Topic Draw is disabled for this schedule.' USING ERRCODE = '55000'; END IF;
  IF p_assignment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.schedule_topic_draws d
    WHERE d.id = p_assignment_id AND d.schedule_id = p_schedule_id
      AND d.tenant_id = v_schedule.tenant_id AND d.is_current
  ) THEN RAISE EXCEPTION 'Select a current topic assignment for this schedule.' USING ERRCODE = '42501'; END IF;
  UPDATE private.schedule_topic_display_states
  SET displayed_assignment_id = p_assignment_id
  WHERE schedule_id = p_schedule_id AND tenant_id = v_schedule.tenant_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_judge_topic_assignments(p_token text)
RETURNS TABLE(registration_id uuid, topic_text text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
  v_schedule_tenant_id uuid;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN RAISE EXCEPTION 'Access code is required.'; END IF;
  SELECT jt.* INTO v_token FROM public.judge_tokens jt
  WHERE (jt.token_hash = encode(extensions.digest(upper(btrim(p_token)), 'sha256'), 'hex')
      OR jt.token = upper(btrim(p_token)))
    AND jt.status = 'approved' AND jt.is_used = false AND jt.is_revoked IS NOT TRUE
    AND (jt.expires_at IS NULL OR jt.expires_at > now())
  ORDER BY jt.created_at DESC LIMIT 1;
  IF v_token.id IS NULL THEN RAISE EXCEPTION 'Access code is invalid, awaiting approval, or expired.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = v_token.schedule_id AND a.judge_id = v_token.judge_id
      AND a.tenant_id = v_token.tenant_id AND a.status = 'active'
  ) THEN RAISE EXCEPTION 'This judge is no longer assigned to the event.'; END IF;
  SELECT s.tenant_id INTO v_schedule_tenant_id FROM public.schedules s WHERE s.id = v_token.schedule_id;
  IF v_schedule_tenant_id IS NULL OR v_schedule_tenant_id <> v_token.tenant_id THEN
    RAISE EXCEPTION 'Event schedule was not found.';
  END IF;
  IF NOT public.tenant_module_enabled(v_schedule_tenant_id, 'judge_portal') THEN
    RAISE EXCEPTION 'Judge Portal is disabled for this tenant.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT d.registration_id, d.topic_text_snapshot
  FROM private.schedule_topic_draws d
  JOIN public.schedules s ON s.id = d.schedule_id AND s.tenant_id = d.tenant_id
  JOIN public.get_judge_registrations(p_token) eligible ON eligible.id = d.registration_id
  WHERE d.schedule_id = v_token.schedule_id AND d.tenant_id = v_token.tenant_id
    AND d.is_current AND s.topic_draw_enabled;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_schedule_topic_display(p_display_token uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT d.topic_text_snapshot
  FROM private.schedule_topic_display_states state
  JOIN public.schedules s ON s.id = state.schedule_id AND s.tenant_id = state.tenant_id
  JOIN private.schedule_topic_draws d
    ON d.id = state.displayed_assignment_id AND d.schedule_id = state.schedule_id
      AND d.tenant_id = state.tenant_id AND d.is_current
  WHERE state.display_token = p_display_token AND s.topic_draw_enabled;
$function$;

REVOKE ALL ON FUNCTION public.admin_schedule_topic_draw_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_schedule_topic_draw_state(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_save_schedule_topics(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_schedule_topics(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_delete_schedule_topic(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_schedule_topic(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.stage_set_schedule_topic_active(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_set_schedule_topic_active(uuid, uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.stage_draw_schedule_topic(uuid, uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_draw_schedule_topic(uuid, uuid, boolean, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.stage_set_schedule_topic_display(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_set_schedule_topic_display(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_judge_topic_assignments(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_judge_topic_assignments(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_schedule_topic_display(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_schedule_topic_display(uuid) TO anon, authenticated, service_role;
