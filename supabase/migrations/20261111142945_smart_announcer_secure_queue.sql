-- Additive first phase. Legacy permissions are intentionally unchanged until
-- the replacement clients have been deployed and verified.
CREATE TABLE public.smart_announcer_queue (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id),
  item_id uuid NOT NULL REFERENCES public.items(id),
  position bigint NOT NULL,
  announced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, festival_id, item_id)
);

CREATE TABLE public.smart_announcer_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id),
  token_hash bytea NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

ALTER TABLE public.smart_announcer_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_announcer_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.smart_announcer_queue, public.smart_announcer_credentials FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.smart_announcer_assert_admin(p_tenant_id uuid, p_festival_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.festival_calendar f ON f.id = p_festival_id AND f.tenant_id = p_tenant_id
    JOIN public.tenants t ON t.id = f.tenant_id AND t.access_disabled = false
    WHERE p.id = auth.uid()
      AND (COALESCE(p.is_superadmin, false) OR
        (p.tenant_id = p_tenant_id AND p.role IN ('tenant_admin','festival_admin','admin')))
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.smart_announcer_assert_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.smart_announcer_issue_token(p_tenant_id uuid, p_festival_id uuid)
RETURNS TABLE(token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_token text; v_expiry timestamptz := now() + interval '24 hours';
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.smart_announcer_credentials (tenant_id, festival_id, token_hash, created_by, expires_at)
  VALUES (p_tenant_id, p_festival_id, extensions.digest(v_token, 'sha256'), auth.uid(), v_expiry);
  RETURN QUERY SELECT v_token, v_expiry;
END $$;

CREATE FUNCTION public.smart_announcer_revoke_tokens(p_tenant_id uuid, p_festival_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  UPDATE public.smart_announcer_credentials SET revoked_at = now()
  WHERE tenant_id = p_tenant_id AND festival_id = p_festival_id AND revoked_at IS NULL;
END $$;

CREATE FUNCTION public.smart_announcer_save_queue(p_tenant_id uuid, p_festival_id uuid, p_item_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid; v_position bigint := 0;
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  IF p_item_ids IS NULL OR cardinality(p_item_ids) > 2000 OR
     cardinality(p_item_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_item_ids) x) THEN
    RAISE EXCEPTION 'Invalid queue selection' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_festival_id::text, 0));
  FOREACH v_id IN ARRAY p_item_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.results r JOIN public.items i ON i.id = r.item_id
      WHERE r.festival_id = p_festival_id AND r.item_id = v_id
        AND i.festival_id = p_festival_id AND i.tenant_id = p_tenant_id
        AND r.published IS TRUE AND r.result_status = 'published') THEN
      RAISE EXCEPTION 'Item is not eligible for this festival' USING ERRCODE = '22023';
    END IF;
    v_position := v_position + 1;
    INSERT INTO public.smart_announcer_queue (tenant_id, festival_id, item_id, position)
    VALUES (p_tenant_id, p_festival_id, v_id, v_position)
    ON CONFLICT (tenant_id, festival_id, item_id) DO UPDATE SET position = EXCLUDED.position;
  END LOOP;
  DELETE FROM public.smart_announcer_queue q WHERE q.tenant_id = p_tenant_id
    AND q.festival_id = p_festival_id AND q.announced_at IS NULL AND NOT (q.item_id = ANY(p_item_ids));
END $$;

CREATE FUNCTION public.smart_announcer_get_queue(p_token text)
RETURNS TABLE(item_id uuid, item_name text, queue_position bigint, announced_at timestamptz, category_codes text[], result_details jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_credential public.smart_announcer_credentials%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RAISE EXCEPTION 'Invalid or expired token' USING ERRCODE = '42501'; END IF;
  SELECT c.* INTO v_credential FROM public.smart_announcer_credentials c
  JOIN public.tenants t ON t.id = c.tenant_id AND t.access_disabled = false
  WHERE c.token_hash = extensions.digest(p_token, 'sha256') AND c.revoked_at IS NULL AND c.expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired token' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT q.item_id, COALESCE(i.item_name_en, i.item_name_ml, i.item_code, ''), q.position, q.announced_at,
    COALESCE(i.category_codes, ARRAY[]::text[]), COALESCE(details.entries, '[]'::jsonb)
    FROM public.smart_announcer_queue q JOIN public.items i ON i.id = q.item_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('rank', r.rank, 'grade', r.grade,
        'participant_name', COALESCE(p.name, leader.name, ''),
        'team_name', COALESCE(o.name, ''), 'points_awarded', r.points_awarded)
        ORDER BY r.rank NULLS LAST, r.id) AS entries
      FROM public.results r
      LEFT JOIN public.result_team_awards award ON award.result_id = r.id
      LEFT JOIN public.registrations reg ON reg.id = r.registration_id
      LEFT JOIN public.participants p ON p.id = reg.participant_id
      LEFT JOIN public.participants leader ON leader.id = reg.group_leader_participant_id
      LEFT JOIN public.organisations o ON o.id = COALESCE(award.organisation_id, reg.organisation_id, p.organisation_id)
      WHERE r.festival_id = q.festival_id AND r.item_id = q.item_id
        AND r.published IS TRUE AND r.result_status = 'published'
        AND reg.status IS DISTINCT FROM 'rejected'
    ) details ON true
    WHERE q.tenant_id = v_credential.tenant_id AND q.festival_id = v_credential.festival_id
    ORDER BY q.position, q.item_id;
END $$;

CREATE FUNCTION public.smart_announcer_admin_queue(p_tenant_id uuid, p_festival_id uuid)
RETURNS TABLE(item_id uuid, queue_position bigint, announced_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  RETURN QUERY SELECT q.item_id, q.position, q.announced_at
    FROM public.smart_announcer_queue q
    WHERE q.tenant_id = p_tenant_id AND q.festival_id = p_festival_id
    ORDER BY q.position, q.item_id;
END $$;

CREATE FUNCTION public.smart_announcer_mark_announced(p_token text, p_item_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_time timestamptz;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RAISE EXCEPTION 'Invalid or expired token' USING ERRCODE = '42501'; END IF;
  UPDATE public.smart_announcer_queue q SET announced_at = COALESCE(q.announced_at, now())
  FROM public.smart_announcer_credentials c
  JOIN public.tenants t ON t.id = c.tenant_id AND t.access_disabled = false
  WHERE c.token_hash = extensions.digest(p_token, 'sha256') AND c.revoked_at IS NULL AND c.expires_at > now()
    AND q.tenant_id = c.tenant_id AND q.festival_id = c.festival_id AND q.item_id = p_item_id
  RETURNING q.announced_at INTO v_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token or item not queued' USING ERRCODE = '42501'; END IF;
  RETURN v_time;
END $$;

REVOKE ALL ON FUNCTION public.smart_announcer_issue_token(uuid,uuid), public.smart_announcer_revoke_tokens(uuid,uuid), public.smart_announcer_save_queue(uuid,uuid,uuid[]), public.smart_announcer_admin_queue(uuid,uuid), public.smart_announcer_get_queue(text), public.smart_announcer_mark_announced(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smart_announcer_issue_token(uuid,uuid), public.smart_announcer_revoke_tokens(uuid,uuid), public.smart_announcer_save_queue(uuid,uuid,uuid[]), public.smart_announcer_admin_queue(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.smart_announcer_get_queue(text), public.smart_announcer_mark_announced(text,uuid) TO anon, authenticated;
