-- Explicitly deny anonymous calls even if the anon role has a direct grant.
REVOKE ALL ON FUNCTION public.preview_schedule_participant_conflicts(uuid, jsonb) FROM anon;
