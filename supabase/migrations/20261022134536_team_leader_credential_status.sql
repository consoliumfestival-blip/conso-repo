BEGIN;

-- Extend the existing admin-scoped assignments RPC with a non-secret state
-- derived from Supabase Auth metadata. No password values are stored or read.
DROP FUNCTION public.get_team_leader_assignments_for_admin(uuid);

CREATE FUNCTION public.get_team_leader_assignments_for_admin(p_festival_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  festival_team_id uuid,
  organisation_id uuid,
  status text,
  assigned_at timestamptz,
  created_at timestamptz,
  team_name text,
  leader_email text,
  leader_code text,
  leader_name text,
  password_state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_caller public.profiles;
BEGIN
  SELECT * INTO v_caller
  FROM public.profiles
  WHERE profiles.id = auth.uid();

  IF v_caller.id IS NULL
     OR (v_caller.role IS DISTINCT FROM 'admin' AND v_caller.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only an authorized administrator may view Team Leader assignments.';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.user_id,
    a.festival_team_id,
    ft.organisation_id,
    a.status,
    a.assigned_at,
    a.created_at,
    o.name,
    p.team_leader_email,
    p.team_leader_code,
    p.full_name,
    CASE
      WHEN au.id IS NULL THEN 'unavailable'
      WHEN COALESCE(au.raw_app_meta_data ->> 'must_change_credentials', 'false') = 'true'
        OR COALESCE(au.raw_user_meta_data ->> 'must_change_credentials', 'false') = 'true'
        OR COALESCE(au.raw_app_meta_data ->> 'must_change_password', 'false') = 'true'
        OR COALESCE(au.raw_user_meta_data ->> 'must_change_password', 'false') = 'true'
        THEN 'pending_change'
      ELSE 'ready_to_reset'
    END
  FROM public.team_leader_assignments a
  JOIN public.festival_teams ft ON ft.id = a.festival_team_id
  JOIN public.organisations o ON o.id = ft.organisation_id
  LEFT JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN auth.users au ON au.id = a.user_id
  WHERE a.status = 'active'
    AND ft.is_active = true
    AND ft.festival_id = p_festival_id
    AND (
      public.is_superadmin()
      OR public.is_org_visible(ft.organisation_id)
      OR ft.parent_tenant_id IS NOT DISTINCT FROM public.get_my_tenant_id()
    );
END;
$$;

ALTER FUNCTION public.get_team_leader_assignments_for_admin(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_team_leader_assignments_for_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_assignments_for_admin(uuid) TO authenticated, service_role;

COMMIT;
