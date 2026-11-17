-- Expose team names for an enabled public leaderboard before any result is published.
-- Scores remain sourced exclusively from the existing published leaderboard RPC.
CREATE OR REPLACE FUNCTION public.get_public_team_roster_scoped(
  p_tenant_id uuid, p_festival_id uuid
)
RETURNS TABLE(organisation_id uuid, organisation_name text, organisation_type text, parent_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT unit.id, unit.name, unit.org_type, unit.parent_id
  FROM public.organisations AS unit
  JOIN public.organisations AS parent ON parent.id = unit.parent_id
  WHERE p_tenant_id IS NOT NULL
    AND p_festival_id = public.get_public_active_festival_id(p_tenant_id)
    AND public.tenant_module_enabled(p_tenant_id, 'public_leaderboard')
    AND public.tenant_module_section_enabled(p_tenant_id, 'public_page', 'results')
    AND parent.tenant_id = p_tenant_id
    AND unit.org_type = 'unit'
  ORDER BY unit.name, unit.id;
$function$;

ALTER FUNCTION public.get_public_team_roster_scoped(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_team_roster_scoped(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_team_roster_scoped(uuid,uuid) TO anon, authenticated, service_role;
