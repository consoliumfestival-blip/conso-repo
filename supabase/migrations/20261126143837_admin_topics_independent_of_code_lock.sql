BEGIN;

-- Topic setup is independent of code-letter shuffle locking. Reuse the
-- existing Admin topic validation and save transaction, then enable drawing.
CREATE OR REPLACE FUNCTION public.admin_save_schedule_topics_and_enable(
  p_schedule_id uuid,
  p_topics jsonb,
  p_duration_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor_tenant uuid;
  v_schedule public.schedules%ROWTYPE;
  v_result jsonb;
BEGIN
  v_actor_tenant := public.stage_assert_admin_access();
  SELECT * INTO v_schedule FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.id IS NULL OR
    (v_schedule.tenant_id <> v_actor_tenant AND NOT public.is_superadmin()) THEN
    RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501';
  END IF;

  v_result := public.admin_save_schedule_topics(p_schedule_id, p_topics, p_duration_seconds);
  IF NOT EXISTS (
    SELECT 1 FROM private.schedule_topics t
    WHERE t.schedule_id = v_schedule.id AND t.tenant_id = v_schedule.tenant_id
      AND NOT t.is_deleted
  ) THEN
    RAISE EXCEPTION 'Add at least one topic before enabling Topic Draw.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.schedules
    SET topic_draw_enabled = true
    WHERE id = v_schedule.id AND tenant_id = v_schedule.tenant_id
      AND topic_draw_enabled IS NOT TRUE;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_save_schedule_topics_and_enable(uuid, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_schedule_topics_and_enable(uuid, jsonb, integer)
  TO authenticated, service_role;

COMMIT;
