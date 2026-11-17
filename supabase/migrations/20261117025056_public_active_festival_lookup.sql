-- Resolve the public tenant's active festival without coupling schedule
-- visibility to leaderboard publication settings.
CREATE OR REPLACE FUNCTION public.get_public_active_festival_id(p_tenant_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT fc.id
  FROM public.festival_calendar fc
  WHERE fc.tenant_id = p_tenant_id
    AND fc.is_active IS TRUE
    AND (public.get_public_tenant_feature_settings(p_tenant_id)->>'public_page')::boolean IS TRUE
  ORDER BY fc.festival_year DESC, fc.start_date DESC NULLS LAST, fc.id
  LIMIT 1;
$function$;

ALTER FUNCTION public.get_public_active_festival_id(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_active_festival_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_active_festival_id(uuid) TO anon, authenticated, service_role;
