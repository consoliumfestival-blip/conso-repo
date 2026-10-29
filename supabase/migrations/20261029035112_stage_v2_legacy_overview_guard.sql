-- Prevent legacy full-festival roster work in v2. Preserve existing schedule
-- reads, function contracts, permissions and tenant-switch rollback to v1.
DO $migration$
DECLARE signature text; definition text; body text; anchor text := 'v_tenant_id := public.stage_assert_admin_access();'; guard text := $guard$
  -- stage_v2_legacy_overview_guard
  IF p_schedule_id IS NULL AND public.stage_management_read_mode() = 'v2' THEN
    RAISE EXCEPTION 'Stage overview uses v2 summaries. Refresh the page.' USING ERRCODE = '42501';
  END IF;
$guard$;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_stage_management_registrations(uuid,uuid)',
    'public.get_stage_management_registrations_scoped(uuid,uuid)'
  ] LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'Required Stage read is missing: %', signature;
    END IF;
    SELECT pg_get_functiondef(p.oid), p.prosrc INTO definition, body FROM pg_proc p WHERE p.oid=to_regprocedure(signature);
    IF position('stage_v2_legacy_overview_guard' IN body)>0 THEN CONTINUE; END IF;
    IF position(anchor IN body)=0 THEN
      RAISE EXCEPTION 'Unexpected Stage function body: %. Review before applying.', signature;
    END IF;
    EXECUTE replace(definition,body,replace(body,anchor,anchor || guard));
  END LOOP;
END;
$migration$;
-- The unwrapped legacy venue endpoint must obey the same mode switch as its
-- existing with-letters facade. V2 summary/detail do not call this endpoint.
DO $migration$
DECLARE definition text; body text; guarded text; begin_at integer;
BEGIN
  SELECT pg_get_functiondef(p.oid),p.prosrc INTO definition,body FROM pg_proc p
  WHERE p.oid=to_regprocedure('public.stage_venue_portal_data(uuid,text)');
  IF definition IS NULL THEN RAISE EXCEPTION 'Required legacy venue read is missing'; END IF;
  IF position('stage_v2_legacy_venue_guard' IN body)>0 THEN RETURN; END IF;
  begin_at := position('BEGIN' IN body);
  IF begin_at=0 THEN RAISE EXCEPTION 'Unexpected legacy venue function body'; END IF;
  guarded := overlay(body placing $guard$BEGIN
  -- stage_v2_legacy_venue_guard
  IF public.stage_venue_portal_read_mode(p_venue_id)='v2' THEN
    RETURN jsonb_build_object('error','This Stage link uses v2. Refresh the page.');
  END IF;
$guard$ from begin_at for 5);
  EXECUTE replace(definition,body,guarded);
END;
$migration$;
