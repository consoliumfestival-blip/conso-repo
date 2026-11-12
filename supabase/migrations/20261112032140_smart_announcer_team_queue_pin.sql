-- Additive target migration. Existing unprotected links remain usable until expiry.
ALTER TABLE public.smart_announcer_credentials
  ADD COLUMN pin_hash text,
  ADD COLUMN pin_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN pin_failure_window_started_at timestamptz,
  ADD COLUMN pin_locked_until timestamptz;

CREATE FUNCTION public.smart_announcer_team_candidates(p_tenant_id uuid, p_festival_id uuid, p_team_id uuid)
RETURNS TABLE(id uuid, name text, item_code text, category_codes text[]) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  RETURN QUERY SELECT DISTINCT r.item_id, COALESCE(NULLIF(r.item_name_ml, ''), NULLIF(r.item_name, ''), r.item_id::text), i.item_code, COALESCE(i.category_codes, ARRAY[]::text[])
  FROM public.get_admin_published_results(p_tenant_id, p_festival_id) r
  JOIN public.items i ON i.id = r.item_id AND i.festival_id = p_festival_id AND i.tenant_id = p_tenant_id
  JOIN public.organisations team ON team.id = r.organisation_id AND
    (team.tenant_id = p_tenant_id OR EXISTS (SELECT 1 FROM public.organisations parent WHERE parent.id = team.parent_id AND parent.tenant_id = p_tenant_id))
  LEFT JOIN public.registrations reg ON reg.id = r.registration_id
  WHERE r.organisation_id = p_team_id AND r.rank = 1 AND r.published IS TRUE
    AND r.result_status = 'published' AND r.public_visible IS NOT TRUE
    AND r.festival_id = p_festival_id AND reg.status IS DISTINCT FROM 'rejected'
    AND NOT EXISTS (SELECT 1 FROM public.smart_announcer_queue q WHERE q.tenant_id = p_tenant_id
      AND q.festival_id = p_festival_id AND q.item_id = r.item_id AND q.announced_at IS NOT NULL)
  ORDER BY 2, 1;
END $$;

CREATE FUNCTION public.smart_announcer_replace_team_queue(p_tenant_id uuid, p_festival_id uuid, p_team_id uuid, p_item_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  IF p_team_id IS NULL OR p_item_ids IS NULL OR pg_catalog.cardinality(p_item_ids) NOT BETWEEN 1 AND 5
     OR pg_catalog.cardinality(p_item_ids) <> (SELECT count(DISTINCT x) FROM pg_catalog.unnest(p_item_ids) x) THEN
    RAISE EXCEPTION 'Invalid selection' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_festival_id::text, 0));
  PERFORM i.id FROM public.items i WHERE i.id = ANY(p_item_ids) ORDER BY i.id FOR SHARE;
  PERFORM r.id FROM public.results r WHERE r.festival_id = p_festival_id AND r.item_id = ANY(p_item_ids) ORDER BY r.id FOR UPDATE;
  PERFORM a.result_id FROM public.result_team_awards a WHERE a.result_id IN
    (SELECT r.id FROM public.results r WHERE r.festival_id = p_festival_id AND r.item_id = ANY(p_item_ids))
    ORDER BY a.result_id FOR SHARE;
  PERFORM reg.id FROM public.registrations reg WHERE reg.id IN
    (SELECT r.registration_id FROM public.results r WHERE r.festival_id = p_festival_id AND r.item_id = ANY(p_item_ids))
    ORDER BY reg.id FOR SHARE;
  PERFORM p.id FROM public.participants p WHERE p.id IN
    (SELECT reg.participant_id FROM public.registrations reg JOIN public.results r ON r.registration_id = reg.id
      WHERE r.festival_id = p_festival_id AND r.item_id = ANY(p_item_ids))
    ORDER BY p.id FOR SHARE;
  IF (SELECT count(*) FROM public.smart_announcer_team_candidates(p_tenant_id, p_festival_id, p_team_id) c WHERE c.id = ANY(p_item_ids)) <> pg_catalog.cardinality(p_item_ids)
  THEN RAISE EXCEPTION 'Selected item is no longer eligible' USING ERRCODE = '22023'; END IF;
  PERFORM public.smart_announcer_save_queue(p_tenant_id, p_festival_id, p_item_ids);
END $$;

CREATE FUNCTION public.smart_announcer_issue_pin_token(p_tenant_id uuid, p_festival_id uuid)
RETURNS TABLE(token text, pin text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_token text; v_pin text; v_random bytea; v_number integer; v_expiry timestamptz := pg_catalog.now() + interval '24 hours';
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  LOOP
    v_random := extensions.gen_random_bytes(2);
    v_number := pg_catalog.get_byte(v_random, 0) * 256 + pg_catalog.get_byte(v_random, 1);
    EXIT WHEN v_number < 60000;
  END LOOP;
  v_pin := pg_catalog.lpad((v_number % 10000)::text, 4, '0');
  INSERT INTO public.smart_announcer_credentials(tenant_id, festival_id, token_hash, created_by, expires_at, pin_hash)
  VALUES (p_tenant_id, p_festival_id, extensions.digest(v_token, 'sha256'), auth.uid(), v_expiry, extensions.crypt(v_pin, extensions.gen_salt('bf', 12)));
  RETURN QUERY SELECT v_token, v_pin, v_expiry;
END $$;

-- The renamed functions are internal only. Legacy wrappers explicitly reject PIN credentials.
ALTER FUNCTION public.smart_announcer_get_queue(text) RENAME TO smart_announcer_get_queue_internal;
ALTER FUNCTION public.smart_announcer_mark_announced(text, uuid) RENAME TO smart_announcer_mark_announced_internal;
REVOKE ALL ON FUNCTION public.smart_announcer_get_queue_internal(text), public.smart_announcer_mark_announced_internal(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.smart_announcer_legacy_token_allowed(p_token text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_token IS NULL OR pg_catalog.length(p_token) <> 64 THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.smart_announcer_credentials c
    WHERE c.token_hash = extensions.digest(p_token, 'sha256') AND c.pin_hash IS NULL);
END
$$;
REVOKE ALL ON FUNCTION public.smart_announcer_legacy_token_allowed(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.smart_announcer_access_mode(p_token text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_token IS NULL OR pg_catalog.length(p_token) <> 64 THEN RETURN 'invalid'; END IF;
  RETURN COALESCE((SELECT CASE WHEN c.pin_hash IS NULL THEN 'legacy' ELSE 'pin' END
    FROM public.smart_announcer_credentials c JOIN public.tenants t ON t.id = c.tenant_id AND t.access_disabled = false
    WHERE c.token_hash = extensions.digest(p_token, 'sha256')
      AND c.revoked_at IS NULL AND c.expires_at > pg_catalog.now()), 'invalid');
END
$$;

CREATE FUNCTION public.smart_announcer_get_queue(p_token text)
RETURNS TABLE(item_id uuid, item_name text, queue_position bigint, announced_at timestamptz, category_codes text[], result_details jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.smart_announcer_legacy_token_allowed(p_token) THEN RAISE EXCEPTION 'Invalid or expired token' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.smart_announcer_get_queue_internal(p_token);
END $$;

CREATE FUNCTION public.smart_announcer_mark_announced(p_token text, p_item_id uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.smart_announcer_legacy_token_allowed(p_token) THEN RAISE EXCEPTION 'Invalid or expired token' USING ERRCODE = '42501'; END IF;
  RETURN public.smart_announcer_mark_announced_internal(p_token, p_item_id);
END $$;

-- Failures are returned as data, not exceptions, so the attempt counter commits.
CREATE FUNCTION public.smart_announcer_check_pin(p_token text, p_pin text, p_reset_on_success boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.smart_announcer_credentials%ROWTYPE; v_failures integer; v_window timestamptz; v_valid boolean := false;
BEGIN
  IF p_token IS NULL OR pg_catalog.length(p_token) <> 64 THEN RETURN 'invalid'; END IF;
  SELECT credential.* INTO c FROM public.smart_announcer_credentials credential
  JOIN public.tenants t ON t.id = credential.tenant_id AND t.access_disabled = false
  WHERE credential.token_hash = extensions.digest(p_token, 'sha256') AND credential.pin_hash IS NOT NULL
    AND credential.revoked_at IS NULL AND credential.expires_at > pg_catalog.now() FOR UPDATE OF credential;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF c.pin_locked_until > pg_catalog.now() THEN RETURN 'locked'; END IF;
  IF p_pin ~ '^[0-9]{4}$' THEN v_valid := extensions.crypt(p_pin, c.pin_hash) = c.pin_hash; END IF;
  IF NOT v_valid THEN
    IF c.pin_failure_window_started_at IS NULL OR c.pin_failure_window_started_at <= pg_catalog.now() - interval '15 minutes'
       OR (c.pin_locked_until IS NOT NULL AND c.pin_locked_until <= pg_catalog.now()) THEN
      v_failures := 1; v_window := pg_catalog.now();
    ELSE v_failures := c.pin_failures + 1; v_window := c.pin_failure_window_started_at; END IF;
    UPDATE public.smart_announcer_credentials SET pin_failures = v_failures,
      pin_failure_window_started_at = v_window,
      pin_locked_until = CASE WHEN v_failures >= 5 THEN pg_catalog.now() + interval '15 minutes' ELSE NULL END WHERE id = c.id;
    RETURN CASE WHEN v_failures >= 5 THEN 'locked' ELSE 'invalid' END;
  END IF;
  IF p_reset_on_success OR (c.pin_locked_until IS NOT NULL AND c.pin_locked_until <= pg_catalog.now())
     OR (c.pin_failure_window_started_at IS NOT NULL AND c.pin_failure_window_started_at <= pg_catalog.now() - interval '15 minutes') THEN
    UPDATE public.smart_announcer_credentials SET pin_failures = 0, pin_failure_window_started_at = NULL, pin_locked_until = NULL WHERE id = c.id;
  END IF;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.smart_announcer_check_pin(text,text,boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.smart_announcer_get_queue_pin(p_token text, p_pin text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text; v_items jsonb;
BEGIN
  v_status := public.smart_announcer_check_pin(p_token, p_pin, true);
  IF v_status <> 'ok' THEN RETURN pg_catalog.jsonb_build_object('status', v_status); END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.queue_position, q.item_id), '[]'::jsonb)
    INTO v_items FROM public.smart_announcer_get_queue_internal(p_token) q;
  RETURN pg_catalog.jsonb_build_object('status', 'ok', 'items', v_items);
END $$;

-- Background refresh validates the PIN but does not erase recent failed attempts.
CREATE FUNCTION public.smart_announcer_poll_queue_pin(p_token text, p_pin text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text; v_items jsonb;
BEGIN
  v_status := public.smart_announcer_check_pin(p_token, p_pin, false);
  IF v_status <> 'ok' THEN RETURN pg_catalog.jsonb_build_object('status', v_status); END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.queue_position, q.item_id), '[]'::jsonb)
    INTO v_items FROM public.smart_announcer_get_queue_internal(p_token) q;
  RETURN pg_catalog.jsonb_build_object('status', 'ok', 'items', v_items);
END $$;

CREATE FUNCTION public.smart_announcer_mark_announced_pin(p_token text, p_pin text, p_item_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text; v_time timestamptz;
BEGIN
  v_status := public.smart_announcer_check_pin(p_token, p_pin, false);
  IF v_status <> 'ok' THEN RETURN pg_catalog.jsonb_build_object('status', v_status); END IF;
  v_time := public.smart_announcer_mark_announced_internal(p_token, p_item_id);
  RETURN pg_catalog.jsonb_build_object('status', 'ok', 'announced_at', v_time);
END $$;

REVOKE ALL ON FUNCTION public.smart_announcer_team_candidates(uuid,uuid,uuid), public.smart_announcer_replace_team_queue(uuid,uuid,uuid,uuid[]), public.smart_announcer_issue_pin_token(uuid,uuid), public.smart_announcer_access_mode(text), public.smart_announcer_get_queue(text), public.smart_announcer_mark_announced(text,uuid), public.smart_announcer_get_queue_pin(text,text), public.smart_announcer_poll_queue_pin(text,text), public.smart_announcer_mark_announced_pin(text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smart_announcer_team_candidates(uuid,uuid,uuid), public.smart_announcer_replace_team_queue(uuid,uuid,uuid,uuid[]), public.smart_announcer_issue_pin_token(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.smart_announcer_access_mode(text), public.smart_announcer_get_queue(text), public.smart_announcer_mark_announced(text,uuid), public.smart_announcer_get_queue_pin(text,text), public.smart_announcer_poll_queue_pin(text,text), public.smart_announcer_mark_announced_pin(text,text,uuid) TO anon, authenticated;
