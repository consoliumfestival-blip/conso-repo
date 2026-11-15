-- Private credentials for the festival-wide read-only portal.
CREATE SCHEMA IF NOT EXISTS festival_readonly_private;
REVOKE ALL ON SCHEMA festival_readonly_private FROM PUBLIC, anon, authenticated;
CREATE TABLE festival_readonly_private.credentials (
  festival_id uuid PRIMARY KEY REFERENCES public.festival_calendar(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  link_id uuid NOT NULL UNIQUE DEFAULT pg_catalog.gen_random_uuid(),
  pin text NOT NULL CHECK (pin ~ '^[0-9]{4}$'),
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE festival_readonly_private.credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON festival_readonly_private.credentials FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.admin_festival_readonly_portal(p_tenant_id uuid, p_festival_id uuid, p_rotate boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c festival_readonly_private.credentials%ROWTYPE; b bytea; n integer; new_pin text;
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  IF NOT EXISTS (SELECT 1 FROM public.festival_calendar f WHERE f.id=p_festival_id AND f.tenant_id=p_tenant_id AND f.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Festival is not active.' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('festival-readonly:' || p_festival_id::text,0));
  SELECT * INTO c FROM festival_readonly_private.credentials WHERE festival_id=p_festival_id FOR UPDATE;
  IF c.festival_id IS NULL OR p_rotate THEN
    LOOP
      b := extensions.gen_random_bytes(2);
      n := pg_catalog.get_byte(b,0)*256 + pg_catalog.get_byte(b,1);
      EXIT WHEN n < 60000;
    END LOOP;
    new_pin := pg_catalog.lpad((n % 10000)::text,4,'0');
    INSERT INTO festival_readonly_private.credentials(festival_id,tenant_id,link_id,pin)
    VALUES(p_festival_id,p_tenant_id,pg_catalog.gen_random_uuid(),new_pin)
    ON CONFLICT(festival_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,link_id=EXCLUDED.link_id,
      pin=EXCLUDED.pin,attempts=0,window_started_at=NULL,locked_until=NULL,created_at=pg_catalog.now()
    RETURNING * INTO c;
  END IF;
  RETURN pg_catalog.jsonb_build_object('link_id',c.link_id,'pin',c.pin);
END $$;
REVOKE ALL ON FUNCTION public.admin_festival_readonly_portal(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_festival_readonly_portal(uuid,uuid,boolean) TO authenticated;

-- Return errors rather than raising, so failed-attempt updates commit.
CREATE FUNCTION public.festival_readonly_data(p_link_id uuid, p_pin text, p_view text,
  p_search text DEFAULT '', p_page integer DEFAULT 1, p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c festival_readonly_private.credentials%ROWTYPE; q text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_search,'')));
  page integer := greatest(COALESCE(p_page,1),1); payload jsonb;
BEGIN
  SELECT * INTO c FROM festival_readonly_private.credentials WHERE link_id=p_link_id FOR UPDATE;
  IF c.festival_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid'); END IF;
  IF c.locked_until > pg_catalog.now() THEN RETURN pg_catalog.jsonb_build_object('status','locked'); END IF;
  IF p_pin IS NULL OR c.pin IS DISTINCT FROM p_pin THEN
    UPDATE festival_readonly_private.credentials SET
      attempts=CASE WHEN window_started_at IS NULL OR window_started_at < pg_catalog.now()-interval '10 minutes' THEN 1 ELSE attempts+1 END,
      locked_until=CASE WHEN window_started_at >= pg_catalog.now()-interval '10 minutes' AND attempts+1 >= 8 THEN pg_catalog.now()+interval '5 minutes' ELSE NULL END,
      window_started_at=CASE WHEN window_started_at IS NULL OR window_started_at < pg_catalog.now()-interval '10 minutes' THEN pg_catalog.now() ELSE window_started_at END
      WHERE festival_id=c.festival_id;
    RETURN pg_catalog.jsonb_build_object('status','invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.festival_calendar f JOIN public.tenants t ON t.id=f.tenant_id
    WHERE f.id=c.festival_id AND f.tenant_id=c.tenant_id AND f.is_active IS TRUE AND t.access_disabled IS FALSE) THEN
    RETURN pg_catalog.jsonb_build_object('status','invalid');
  END IF;
  IF p_view NOT IN ('participants','programs','participant','program') THEN RETURN pg_catalog.jsonb_build_object('status','invalid'); END IF;
  IF p_view='participants' THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) INTO payload FROM (
      SELECT p.id,p.name,p.chest_number,p.category_code,p.gender,p.status,o.name AS team
      FROM public.participants p JOIN public.festival_teams ft ON ft.organisation_id=p.organisation_id AND ft.festival_id=c.festival_id AND ft.parent_tenant_id=c.tenant_id AND ft.is_active IS TRUE
      JOIN public.organisations o ON o.id=ft.organisation_id AND o.archived_at IS NULL
      WHERE p.festival_id=c.festival_id AND p.tenant_id IN (c.tenant_id,o.tenant_id)
        AND EXISTS (SELECT 1 FROM public.get_visible_organisations(c.tenant_id) visible WHERE visible.id=o.id AND visible.tenant_id=o.tenant_id)
        AND (q='' OR pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',p.name,p.chest_number,p.category_code,o.name)),q)>0)
      ORDER BY p.name,p.id LIMIT 31 OFFSET (least(page,100000)-1)*30
    ) x;
  ELSIF p_view='programs' THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) INTO payload FROM (
      SELECT i.id,i.item_name_en AS name,i.item_name_ml,i.item_code,i.category_codes,i.item_type,i.participation_type
      FROM public.items i WHERE i.festival_id=c.festival_id AND i.tenant_id=c.tenant_id AND (i.is_active IS TRUE OR EXISTS (
        SELECT 1 FROM public.registrations r
        JOIN public.festival_teams ft ON ft.organisation_id=r.organisation_id AND ft.festival_id=c.festival_id AND ft.parent_tenant_id=c.tenant_id AND ft.is_active IS TRUE
        JOIN public.organisations o ON o.id=ft.organisation_id AND o.archived_at IS NULL
        WHERE r.item_id=i.id AND r.festival_id=c.festival_id AND r.tenant_id IN (c.tenant_id,o.tenant_id)
          AND r.status IS DISTINCT FROM 'rejected'
          AND EXISTS (SELECT 1 FROM public.get_visible_organisations(c.tenant_id) visible WHERE visible.id=o.id AND visible.tenant_id=o.tenant_id)
      ))
        AND (q='' OR pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',i.item_name_en,i.item_name_ml,i.item_code,pg_catalog.array_to_string(i.category_codes,' '))),q)>0)
      ORDER BY i.item_name_en,i.id LIMIT 31 OFFSET (least(page,100000)-1)*30
    ) x;
  ELSIF p_view='participant' THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) INTO payload FROM (
      SELECT DISTINCT i.id,i.item_name_en AS name,i.item_code,i.category_codes,i.participation_type
      FROM public.participants p JOIN public.festival_teams ft ON ft.organisation_id=p.organisation_id AND ft.festival_id=c.festival_id AND ft.parent_tenant_id=c.tenant_id AND ft.is_active IS TRUE
      JOIN public.organisations o ON o.id=ft.organisation_id AND o.archived_at IS NULL
      JOIN public.registrations r ON r.festival_id=c.festival_id AND (r.participant_id=p.id OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.registration_id=r.id AND gm.participant_id=p.id))
      JOIN public.items i ON i.id=r.item_id AND i.festival_id=c.festival_id AND i.tenant_id=c.tenant_id
      WHERE p.id=p_id AND p.festival_id=c.festival_id AND p.tenant_id IN (c.tenant_id,o.tenant_id)
        AND EXISTS (SELECT 1 FROM public.get_visible_organisations(c.tenant_id) visible WHERE visible.id=o.id AND visible.tenant_id=o.tenant_id)
        AND r.organisation_id=p.organisation_id AND r.tenant_id IN (c.tenant_id,o.tenant_id) AND r.status IS DISTINCT FROM 'rejected'
      ORDER BY i.item_name_en,i.id
    ) x;
  ELSE
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)),'[]'::jsonb) INTO payload FROM (
      SELECT r.id,r.entry_kind,r.entry_chest_number,r.status,o.name AS team,p.name AS participant,p.chest_number,
        COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',member.name,'chest_number',member.chest_number) ORDER BY gm.member_order,member.id)
          FROM public.group_members gm JOIN public.participants member ON member.id=gm.participant_id
          WHERE gm.registration_id=r.id AND member.festival_id=c.festival_id AND member.organisation_id=o.id AND member.tenant_id IN (c.tenant_id,o.tenant_id)),'[]'::jsonb) AS members
      FROM public.registrations r JOIN public.items i ON i.id=r.item_id AND i.festival_id=c.festival_id AND i.tenant_id=c.tenant_id
      JOIN public.festival_teams ft ON ft.organisation_id=r.organisation_id AND ft.festival_id=c.festival_id AND ft.parent_tenant_id=c.tenant_id AND ft.is_active IS TRUE
      JOIN public.organisations o ON o.id=ft.organisation_id AND o.archived_at IS NULL
      LEFT JOIN public.participants p ON p.id=r.participant_id AND p.festival_id=c.festival_id AND p.organisation_id=o.id AND p.tenant_id IN (c.tenant_id,o.tenant_id)
      WHERE r.item_id=p_id AND r.festival_id=c.festival_id AND r.tenant_id IN (c.tenant_id,o.tenant_id) AND r.status IS DISTINCT FROM 'rejected'
        AND EXISTS (SELECT 1 FROM public.get_visible_organisations(c.tenant_id) visible WHERE visible.id=o.id AND visible.tenant_id=o.tenant_id)
      ORDER BY o.name,p.name,r.id
    ) x;
  END IF;
  RETURN pg_catalog.jsonb_build_object('status','ok','rows',payload);
END $$;
REVOKE ALL ON FUNCTION public.festival_readonly_data(uuid,text,text,text,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.festival_readonly_data(uuid,text,text,text,integer,uuid) TO anon, authenticated;
