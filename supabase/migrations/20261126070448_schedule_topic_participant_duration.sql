ALTER TABLE public.schedules
  ADD COLUMN topic_draw_duration_seconds integer NOT NULL DEFAULT 300,
  ADD CONSTRAINT schedules_topic_draw_duration_seconds_check
    CHECK (
      topic_draw_duration_seconds BETWEEN 60 AND 86400
      AND topic_draw_duration_seconds % 60 = 0
    );

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

CREATE OR REPLACE FUNCTION public.admin_save_schedule_topics(
  p_schedule_id uuid,
  p_topics jsonb,
  p_duration_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
BEGIN
  v_actor_tenant_id := public.stage_assert_admin_access();
  SELECT * INTO v_schedule
  FROM public.schedules
  WHERE id = p_schedule_id
  FOR UPDATE;

  IF v_schedule.id IS NULL OR (v_schedule.tenant_id <> v_actor_tenant_id AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;
  IF p_duration_seconds IS NULL
    OR p_duration_seconds < 60
    OR p_duration_seconds > 86400
    OR p_duration_seconds % 60 <> 0 THEN
    RAISE EXCEPTION 'Participant duration must be a whole number of minutes from 1 to 1440.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.schedules
  SET topic_draw_duration_seconds = p_duration_seconds
  WHERE id = v_schedule.id AND tenant_id = v_schedule.tenant_id;

  -- The existing RPC keeps the established topic validation, ownership checks,
  -- and return shape. Its error rolls the duration update back in this transaction.
  RETURN public.admin_save_schedule_topics(p_schedule_id, p_topics);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_save_schedule_topics(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_schedule_topics(uuid, jsonb, integer) TO authenticated, service_role;
