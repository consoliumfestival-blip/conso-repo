BEGIN;

-- CREATE FUNCTION inherits the database default PUBLIC EXECUTE grant. Restore
-- the pre-migration ACL: authenticated and service_role only.
REVOKE EXECUTE ON FUNCTION public.get_team_leader_assignments_for_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_assignments_for_admin(uuid) TO authenticated, service_role;

COMMIT;
