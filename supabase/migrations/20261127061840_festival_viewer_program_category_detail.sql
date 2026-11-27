-- Keep the read-only program detail aligned with the selected program category.
BEGIN;
CREATE FUNCTION public.festival_readonly_program_detail(p_link_id uuid, p_pin text, p_item_id uuid, p_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE access_result jsonb; c festival_readonly_private.credentials%ROWTYPE; rows_result jsonb;
BEGIN
  access_result := public.festival_readonly_data(p_link_id, p_pin, 'auth', '', 1, NULL);
  IF access_result->>'status' IS DISTINCT FROM 'ok' THEN RETURN access_result; END IF;
  SELECT * INTO c FROM festival_readonly_private.credentials WHERE link_id=p_link_id;
  IF c.festival_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.items i
    CROSS JOIN LATERAL unnest(COALESCE(i.category_codes,ARRAY[]::text[])) code
    WHERE i.id=p_item_id AND i.festival_id=c.festival_id AND i.tenant_id=c.tenant_id
      AND i.is_active IS TRUE
      AND program_read_private.category_code(code)=program_read_private.category_code(p_category)
  ) THEN RETURN pg_catalog.jsonb_build_object('status','invalid'); END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.team,x.participant,x.id),'[]'::jsonb)
  INTO rows_result FROM (
    SELECT r.id,r.entry_kind,r.entry_chest_number,r.status,o.name AS team,p.name AS participant,p.chest_number,
      COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',member.name,'chest_number',member.chest_number)
        ORDER BY gm.member_order,member.id)
        FROM public.group_members gm JOIN public.participants member ON member.id=gm.participant_id
        WHERE gm.registration_id=r.id AND member.festival_id=c.festival_id
          AND member.organisation_id=o.id AND member.tenant_id IN (c.tenant_id,o.tenant_id)),'[]'::jsonb) AS members
    FROM public.registrations r JOIN public.items i ON i.id=r.item_id AND i.festival_id=c.festival_id AND i.tenant_id=c.tenant_id
    JOIN public.festival_teams ft ON ft.organisation_id=r.organisation_id AND ft.festival_id=c.festival_id
      AND ft.parent_tenant_id=c.tenant_id AND ft.is_active IS TRUE
    JOIN public.organisations o ON o.id=ft.organisation_id AND o.archived_at IS NULL
    LEFT JOIN public.participants p ON p.id=r.participant_id AND p.festival_id=c.festival_id
      AND p.organisation_id=o.id AND p.tenant_id IN (c.tenant_id,o.tenant_id)
    WHERE r.item_id=p_item_id AND r.festival_id=c.festival_id
      AND r.tenant_id IN (c.tenant_id,o.tenant_id) AND r.status IS DISTINCT FROM 'rejected'
      AND EXISTS (SELECT 1 FROM public.get_visible_organisations(c.tenant_id) visible
        WHERE visible.id=o.id AND visible.tenant_id=o.tenant_id)
      AND (r.entry_kind='general_team' OR (p.id IS NOT NULL AND program_read_private.matches_category(
        p.category_code,p_category,COALESCE((pg_catalog.to_jsonb(p)->>'is_post_hs_religious')::boolean,false))))
  ) x;
  RETURN pg_catalog.jsonb_build_object('status','ok','rows',rows_result);
END $$;
ALTER FUNCTION public.festival_readonly_program_detail(uuid,text,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.festival_readonly_program_detail(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.festival_readonly_program_detail(uuid,text,uuid,text) TO anon,authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
