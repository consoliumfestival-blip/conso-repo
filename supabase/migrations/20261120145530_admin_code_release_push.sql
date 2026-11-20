-- Store only opted-in Admin web push endpoints. This table is separate from
-- application data change notifications and is read by the release Worker.
CREATE TABLE IF NOT EXISTS public.admin_web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_web_push_endpoint_https CHECK (endpoint LIKE 'https://%'),
  CONSTRAINT admin_web_push_subscription_object CHECK (jsonb_typeof(subscription) = 'object')
);

CREATE INDEX IF NOT EXISTS admin_web_push_subscriptions_user_idx
  ON public.admin_web_push_subscriptions (user_id, tenant_id);

ALTER TABLE public.admin_web_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_web_push_subscriptions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_web_push_subscriptions TO authenticated;
GRANT ALL ON public.admin_web_push_subscriptions TO service_role;

CREATE POLICY admin_web_push_admin_owns_subscription
  ON public.admin_web_push_subscriptions
  FOR ALL
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (p.is_superadmin IS TRUE OR (p.role IN ('admin', 'admin_leader') AND p.tenant_id = admin_web_push_subscriptions.tenant_id))
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (p.is_superadmin IS TRUE OR (p.role IN ('admin', 'admin_leader') AND p.tenant_id = admin_web_push_subscriptions.tenant_id))
    )
  );

CREATE OR REPLACE FUNCTION public.remove_admin_web_push_subscriptions_on_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.admin_web_push_subscriptions WHERE user_id = OLD.id;
    RETURN NULL;
  END IF;

  IF (NEW.is_superadmin IS NOT TRUE AND COALESCE(NEW.role NOT IN ('admin', 'admin_leader'), true))
     OR (NEW.is_superadmin IS NOT TRUE AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id) THEN
    DELETE FROM public.admin_web_push_subscriptions WHERE user_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_admin_web_push_subscriptions_on_access_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS remove_admin_web_push_subscriptions_after_profile_update ON public.profiles;
CREATE TRIGGER remove_admin_web_push_subscriptions_after_profile_update
  AFTER UPDATE OF role, tenant_id, is_superadmin ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.remove_admin_web_push_subscriptions_on_access_change();

DROP TRIGGER IF EXISTS remove_admin_web_push_subscriptions_after_profile_delete ON public.profiles;
CREATE TRIGGER remove_admin_web_push_subscriptions_after_profile_delete
  AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.remove_admin_web_push_subscriptions_on_access_change();

CREATE TABLE IF NOT EXISTS public.admin_code_release_events (
  event_key text PRIMARY KEY,
  alert_policy_id text NOT NULL,
  deployment_name text NOT NULL,
  deployment_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent')),
  lease_until timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_code_release_event_key_length CHECK (length(event_key) BETWEEN 1 AND 200)
);

ALTER TABLE public.admin_code_release_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_code_release_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_code_release_events TO service_role;

CREATE OR REPLACE FUNCTION public.claim_admin_code_release_event(
  p_event_key text,
  p_alert_policy_id text,
  p_deployment_name text,
  p_deployment_url text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_claimed integer;
BEGIN
  IF pg_catalog.length(p_event_key) NOT BETWEEN 1 AND 200
     OR pg_catalog.length(p_alert_policy_id) NOT BETWEEN 1 AND 200
     OR pg_catalog.length(p_deployment_name) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid release event';
  END IF;

  INSERT INTO public.admin_code_release_events (event_key, alert_policy_id, deployment_name, deployment_url)
  VALUES (p_event_key, p_alert_policy_id, p_deployment_name, p_deployment_url)
  ON CONFLICT (event_key) DO NOTHING;

  UPDATE public.admin_code_release_events
  SET status = 'sending', lease_until = pg_catalog.now() + interval '3 minutes', attempt_count = attempt_count + 1
  WHERE event_key = p_event_key
    AND (status IN ('pending') OR (status = 'sending' AND lease_until < pg_catalog.now()));
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed::integer > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_admin_code_release_event(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_code_release_event(text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_admin_code_release_event(p_event_key text, p_sent boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  UPDATE public.admin_code_release_events
  SET status = CASE WHEN p_sent THEN 'sent' ELSE 'pending' END,
      lease_until = NULL
  WHERE event_key = p_event_key AND status = 'sending';
$function$;

REVOKE ALL ON FUNCTION public.finish_admin_code_release_event(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_admin_code_release_event(text, boolean) TO service_role;

COMMENT ON TABLE public.admin_web_push_subscriptions IS
  'Opted-in Admin PWA push endpoints. Used only for successful production code release notifications.';
COMMENT ON TABLE public.admin_code_release_events IS
  'Deduplication keys for Cloudflare Pages production deployment success webhooks.';
