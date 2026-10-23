CREATE OR REPLACE FUNCTION public.stage_set_schedule_status(
  p_schedule_id uuid,
  p_status text,
  p_expected_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_status text;
  v_schedule public.schedules%ROWTYPE;
  v_new jsonb;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  v_status := pg_catalog.lower(pg_catalog.btrim(p_status));
  IF v_status IS NULL OR v_status NOT IN ('scheduled', 'ongoing', 'completed') THEN
    RAISE EXCEPTION 'Unsupported event status.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_schedule
  FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The schedule is outside the current tenant scope.' USING ERRCODE = '42501';
  END IF;
  IF v_schedule.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'This schedule status changed elsewhere. Refresh and try again.' USING ERRCODE = '40001';
  END IF;

  IF pg_catalog.lower(pg_catalog.btrim(COALESCE(v_schedule.status, 'scheduled'))) = v_status THEN
    RETURN pg_catalog.jsonb_build_object('schedule_id', p_schedule_id, 'status', v_status, 'changed', false);
  END IF;

  UPDATE public.schedules SET status = v_status WHERE id = p_schedule_id;
  SELECT pg_catalog.to_jsonb(s) INTO v_new FROM public.schedules s WHERE s.id = p_schedule_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_tenant_id, auth.uid(), 'schedule_lifecycle_status_updated', 'schedules', p_schedule_id,
    pg_catalog.to_jsonb(v_schedule), v_new);

  RETURN pg_catalog.jsonb_build_object('schedule_id', p_schedule_id, 'status', v_status, 'changed', true);
END;
$function$;

ALTER FUNCTION public.stage_set_schedule_status(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.stage_set_schedule_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_set_schedule_status(uuid, text, text) TO authenticated, service_role, postgres;

CREATE OR REPLACE FUNCTION public.stage_venue_portal_set_schedule_status(
  p_venue_id uuid,
  p_pin text,
  p_schedule_id uuid,
  p_status text,
  p_expected_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_status text;
  v_pin_error text;
  v_new jsonb;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('error', v_pin_error);
  END IF;

  v_status := pg_catalog.lower(pg_catalog.btrim(p_status));
  IF v_status IS NULL OR v_status NOT IN ('scheduled', 'ongoing', 'completed') THEN
    RAISE EXCEPTION 'Unsupported event status.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  SELECT * INTO v_schedule
  FROM public.schedules s
  WHERE s.id = p_schedule_id
    AND s.venue_id = p_venue_id
    AND s.tenant_id = v_venue.tenant_id
    AND s.festival_id = v_venue.festival_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501';
  END IF;
  IF v_schedule.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'This schedule status changed elsewhere. Refresh and try again.' USING ERRCODE = '40001';
  END IF;

  IF pg_catalog.lower(pg_catalog.btrim(COALESCE(v_schedule.status, 'scheduled'))) = v_status THEN
    RETURN pg_catalog.jsonb_build_object('schedule_id', p_schedule_id, 'status', v_status, 'changed', false);
  END IF;

  UPDATE public.schedules SET status = v_status WHERE id = p_schedule_id;
  SELECT pg_catalog.to_jsonb(s) INTO v_new FROM public.schedules s WHERE s.id = p_schedule_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_venue.tenant_id, auth.uid(), 'stage_venue_schedule_status_updated', 'schedules', p_schedule_id,
    pg_catalog.to_jsonb(v_schedule) || pg_catalog.jsonb_build_object('venue_id', p_venue_id),
    v_new || pg_catalog.jsonb_build_object('venue_id', p_venue_id));

  RETURN pg_catalog.jsonb_build_object('schedule_id', p_schedule_id, 'status', v_status, 'changed', true);
END;
$function$;

ALTER FUNCTION public.stage_venue_portal_set_schedule_status(uuid, text, uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.stage_venue_portal_set_schedule_status(uuid, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_set_schedule_status(uuid, text, uuid, text, text) TO anon, authenticated, service_role, postgres;
