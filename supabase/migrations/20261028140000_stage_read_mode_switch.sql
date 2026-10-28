-- Tenant-scoped, reversible Stage read selection. Existing writes remain shared.
CREATE TABLE IF NOT EXISTS stage_portal_private.stage_read_modes (
  tenant_id uuid PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('v1', 'v2')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON stage_portal_private.stage_read_modes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stage_venue_portal_read_mode(p_venue_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT v.tenant_id INTO v_tenant_id FROM public.venues v WHERE v.id = p_venue_id;
  IF v_tenant_id IS NULL THEN RETURN 'v1'; END IF;
  RETURN COALESCE((SELECT m.mode FROM stage_portal_private.stage_read_modes m
                   WHERE m.tenant_id = v_tenant_id), 'v1');
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_management_read_mode()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  RETURN COALESCE((SELECT m.mode FROM stage_portal_private.stage_read_modes m
                   WHERE m.tenant_id = v_tenant_id), 'v1');
END;
$function$;

-- Preserve the old response shape while preventing old reads in v2 tenants.
CREATE OR REPLACE FUNCTION public.stage_venue_portal_data_with_letters(p_venue_id uuid, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE data jsonb;
BEGIN
  IF public.stage_venue_portal_read_mode(p_venue_id) = 'v2' THEN
    RETURN pg_catalog.jsonb_build_object('error', 'This Stage link has moved to version 2. Refresh the page.');
  END IF;
  data := public.stage_venue_portal_data(p_venue_id, p_pin);
  IF data ? 'error' THEN RETURN data; END IF;
  RETURN pg_catalog.jsonb_set(data, '{registrations}', COALESCE((
    SELECT pg_catalog.jsonb_agg(entry || pg_catalog.jsonb_build_object('code_letter_fixed', r.code_letter_fixed) ORDER BY position)
    FROM pg_catalog.jsonb_array_elements(data->'registrations') WITH ORDINALITY entries(entry, position)
    JOIN public.registrations r ON r.id = (entry->>'id')::uuid
  ), '[]'::jsonb));
END $function$;

REVOKE ALL ON FUNCTION public.stage_venue_portal_read_mode(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_read_mode(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stage_management_read_mode() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_management_read_mode() TO authenticated, service_role;

-- After deploying the frontend, switch one tenant with:
-- INSERT INTO stage_portal_private.stage_read_modes(tenant_id, mode)
-- VALUES ('<verified-root-tenant-uuid>', 'v2')
-- ON CONFLICT (tenant_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = now();
-- Roll back immediately by running the same statement with 'v1'.
