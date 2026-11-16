CREATE OR REPLACE FUNCTION public.super_update_tenant_name(p_tenant_id uuid, p_name text, p_expected_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_old text; v_name text := btrim(p_name);
BEGIN
  IF auth.uid() IS NULL OR public.is_superadmin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR length(v_name) = 0 OR length(v_name) > 160 THEN
    RAISE EXCEPTION 'Tenant name must contain 1 to 160 characters' USING ERRCODE = '22023';
  END IF;
  SELECT name INTO v_old FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'P0002'; END IF;
  IF v_old IS DISTINCT FROM p_expected_name THEN
    RAISE EXCEPTION 'Tenant name changed; refresh and try again' USING ERRCODE = '40001';
  END IF;
  IF v_old IS DISTINCT FROM v_name THEN
    UPDATE public.tenants SET name = v_name WHERE id = p_tenant_id;
    INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (p_tenant_id, auth.uid(), 'super_update_tenant_name', 'tenants', p_tenant_id,
      jsonb_build_object('name', v_old), jsonb_build_object('name', v_name));
  END IF;
  RETURN v_name;
END;
$$;
REVOKE ALL ON FUNCTION public.super_update_tenant_name(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_update_tenant_name(uuid, text, text) TO authenticated;
