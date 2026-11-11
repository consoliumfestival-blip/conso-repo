-- Apply only after the new client is deployed and its complete workflow has
-- been verified. Legacy clients must update after this security cutover.
REVOKE ALL ON FUNCTION public.auto_publish_suspense_batch(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_announcer_result_visibility(text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_strategic_publish_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Public can view active announcer tokens" ON public.announcer_tokens;
DROP POLICY IF EXISTS "Tenant admins can manage announcer tokens" ON public.announcer_tokens;
REVOKE ALL ON TABLE public.announcer_tokens FROM PUBLIC, anon, authenticated;
