-- These schedule-administration RPCs are authenticated-only. Supabase's
-- configured default privileges may grant EXECUTE directly to anon, which
-- REVOKE FROM PUBLIC alone does not remove.
REVOKE ALL ON FUNCTION public.get_admin_schedule_substages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_schedule_substages(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_schedule_checkin_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_schedule_checkin_state(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_schedule_checkin_action(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_schedule_checkin_action(uuid, text, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.stage_update_registration(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_update_registration(uuid, uuid, text) TO authenticated, service_role;
