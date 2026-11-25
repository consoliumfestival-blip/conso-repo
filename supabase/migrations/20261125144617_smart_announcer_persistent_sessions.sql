BEGIN;
-- Private recovery of the shared link is restricted to the admin RPC below.
CREATE TABLE public.smart_announcer_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 festival_id uuid NOT NULL REFERENCES public.festival_calendar(id), credential_id uuid NOT NULL REFERENCES public.smart_announcer_credentials(id),
 link_token text NOT NULL UNIQUE, closed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX smart_announcer_one_active_session ON public.smart_announcer_sessions(tenant_id,festival_id) WHERE closed_at IS NULL;
CREATE TABLE public.smart_announcer_devices (
 token_hash bytea PRIMARY KEY, session_id uuid NOT NULL REFERENCES public.smart_announcer_sessions(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.smart_announcer_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.smart_announcer_sessions(id),
 team_id uuid NOT NULL REFERENCES public.organisations(id), item_ids uuid[] NOT NULL,
 preview jsonb NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX smart_announcer_devices_session ON public.smart_announcer_devices(session_id);
CREATE INDEX smart_announcer_batches_session ON public.smart_announcer_batches(session_id);
ALTER TABLE public.smart_announcer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_announcer_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_announcer_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.smart_announcer_sessions,public.smart_announcer_devices,public.smart_announcer_batches FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.smart_announcer_session_admin(p_tenant_id uuid,p_festival_id uuid,p_action text DEFAULT 'get') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.smart_announcer_sessions%ROWTYPE; c record; credential uuid;
BEGIN
 PERFORM public.smart_announcer_assert_admin(p_tenant_id,p_festival_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text||':'||p_festival_id::text,0));
 SELECT * INTO s FROM public.smart_announcer_sessions WHERE tenant_id=p_tenant_id AND festival_id=p_festival_id AND closed_at IS NULL FOR UPDATE;
 IF p_action='close' THEN
  UPDATE public.smart_announcer_credentials SET revoked_at=now() WHERE id=s.credential_id;
  UPDATE public.smart_announcer_sessions SET closed_at=now() WHERE id=s.id;
  RETURN NULL;
 ELSIF p_action='create' AND s.id IS NULL THEN
  SELECT * INTO c FROM public.smart_announcer_issue_pin_token(p_tenant_id,p_festival_id);
  UPDATE public.smart_announcer_credentials SET expires_at='infinity' WHERE token_hash=extensions.digest(c.token,'sha256') RETURNING id INTO credential;
  INSERT INTO public.smart_announcer_sessions(tenant_id,festival_id,credential_id,link_token) VALUES(p_tenant_id,p_festival_id,credential,c.token) RETURNING * INTO s;
  RETURN jsonb_build_object('id',s.id,'token',s.link_token,'pin',c.pin);
 ELSIF p_action NOT IN ('get','create') THEN RAISE EXCEPTION 'Invalid session action'; END IF;
 IF s.id IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',s.id,'token',s.link_token);
END $$;

CREATE FUNCTION public.smart_announcer_device_login(p_token text,p_pin text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.smart_announcer_sessions%ROWTYPE; status text; device text;
BEGIN
 SELECT * INTO s FROM public.smart_announcer_sessions WHERE link_token=p_token AND closed_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;
 status:=public.smart_announcer_check_pin(p_token,p_pin,true);
 IF status<>'ok' THEN RETURN jsonb_build_object('status',status); END IF;
 device:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.smart_announcer_devices(token_hash,session_id) VALUES(extensions.digest(device,'sha256'),s.id);
 RETURN jsonb_build_object('status','ok','device_token',device);
END $$;

CREATE FUNCTION public.smart_announcer_device_queue(p_token text,p_device_token text,p_item_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.smart_announcer_sessions%ROWTYPE; entries jsonb;
BEGIN
 SELECT session.* INTO s FROM public.smart_announcer_sessions session
 JOIN public.smart_announcer_devices d ON d.session_id=session.id
 JOIN public.smart_announcer_credentials c ON c.id=session.credential_id
 JOIN public.tenants t ON t.id=session.tenant_id
 WHERE session.link_token=p_token AND d.token_hash=extensions.digest(p_device_token,'sha256')
 AND session.closed_at IS NULL AND c.revoked_at IS NULL AND t.access_disabled IS FALSE
 AND public.tenant_module_enabled(session.tenant_id,'smart_announcer') FOR SHARE OF session,c;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 IF p_item_id IS NOT NULL THEN PERFORM public.smart_announcer_mark_announced_internal(p_token,p_item_id); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.queue_position,q.item_id),'[]'::jsonb) INTO entries FROM public.smart_announcer_get_queue_internal(p_token) q;
 RETURN jsonb_build_object('status','ok','items',entries);
END $$;

CREATE FUNCTION public.smart_announcer_batch_preview(p_tenant_id uuid,p_festival_id uuid,p_team_id uuid,p_item_ids uuid[] DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; schedules jsonb;
BEGIN
 PERFORM public.smart_announcer_assert_admin(p_tenant_id,p_festival_id);
 result:=public.smart_announcer_team_strategy(p_tenant_id,p_festival_id,p_team_id,p_item_ids);
 SELECT coalesce(jsonb_agg(jsonb_build_object('item_id',s.item_id,'start_time',s.start_time,'venue',v.name) ORDER BY s.start_time),'[]'::jsonb)
 INTO schedules FROM public.schedules s LEFT JOIN public.venues v ON v.id=s.venue_id
 WHERE s.tenant_id=p_tenant_id AND s.festival_id=p_festival_id AND s.item_id IN(SELECT (x->>'item_id')::uuid FROM jsonb_array_elements(result->'items') x);
 RETURN result||jsonb_build_object('schedules',schedules);
END $$;

CREATE FUNCTION public.smart_announcer_send_batch(p_tenant_id uuid,p_festival_id uuid,p_team_id uuid,p_item_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE session uuid; preview jsonb;
BEGIN
 PERFORM public.smart_announcer_assert_admin(p_tenant_id,p_festival_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text||':'||p_festival_id::text,0));
 SELECT id INTO session FROM public.smart_announcer_sessions WHERE tenant_id=p_tenant_id AND festival_id=p_festival_id AND closed_at IS NULL FOR UPDATE;
 IF session IS NULL THEN RAISE EXCEPTION 'Create an announcer session first'; END IF;
 IF EXISTS(SELECT 1 FROM public.smart_announcer_queue WHERE tenant_id=p_tenant_id AND festival_id=p_festival_id AND announced_at IS NULL) THEN RAISE EXCEPTION 'Finish the pending batch before sending the next batch'; END IF;
 PERFORM public.smart_announcer_replace_team_queue(p_tenant_id,p_festival_id,p_team_id,p_item_ids);
 preview:=public.smart_announcer_batch_preview(p_tenant_id,p_festival_id,p_team_id,p_item_ids)
   ||jsonb_build_object('suggested',public.smart_announcer_team_strategy(p_tenant_id,p_festival_id,p_team_id));
 INSERT INTO public.smart_announcer_batches(session_id,team_id,item_ids,preview,created_by) VALUES(session,p_team_id,p_item_ids,preview,auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.smart_announcer_session_admin(uuid,uuid,text),public.smart_announcer_batch_preview(uuid,uuid,uuid,uuid[]),public.smart_announcer_send_batch(uuid,uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.smart_announcer_session_admin(uuid,uuid,text),public.smart_announcer_batch_preview(uuid,uuid,uuid,uuid[]),public.smart_announcer_send_batch(uuid,uuid,uuid,uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.smart_announcer_device_login(text,text),public.smart_announcer_device_queue(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.smart_announcer_device_login(text,text),public.smart_announcer_device_queue(text,text,uuid),public.smart_announcer_access_mode(text) TO anon,authenticated;
COMMIT;
