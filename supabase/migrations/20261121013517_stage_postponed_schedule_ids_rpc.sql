-- Restore the Stage Management postponed-schedule lookup that the client calls.
-- Keep this migration limited to the missing RPC so it can be reviewed and
-- applied independently of the historical schedule-order migration.
CREATE OR REPLACE FUNCTION public.get_stage_management_postponed_schedule_ids(p_festival_id uuid)
RETURNS TABLE(schedule_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF NOT EXISTS (
    SELECT 1
    FROM public.festival_calendar f
    WHERE f.id = p_festival_id
      AND f.tenant_id = v_tenant_id
      AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The requested festival is not active for this tenant.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id
  FROM public.schedules s
  WHERE s.tenant_id = v_tenant_id
    AND s.festival_id = p_festival_id
    AND coalesce(s.is_postponed, false) IS TRUE;
END;
$function$;

ALTER FUNCTION public.get_stage_management_postponed_schedule_ids(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_stage_management_postponed_schedule_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_management_postponed_schedule_ids(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
