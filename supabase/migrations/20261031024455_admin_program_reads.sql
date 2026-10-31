BEGIN;
CREATE SCHEMA IF NOT EXISTS program_read_private;
REVOKE ALL ON SCHEMA program_read_private FROM PUBLIC, anon, authenticated;

CREATE FUNCTION program_read_private.category_code(value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT CASE upper(btrim(coalesce(value,''))) WHEN 'JUNIOR' THEN 'JR' WHEN 'SENIOR' THEN 'SR' WHEN 'CAMPUS' THEN 'CA' WHEN 'GN' THEN 'GENERAL' ELSE upper(btrim(coalesce(value,''))) END;
$$;
ALTER FUNCTION program_read_private.category_code(text) OWNER TO postgres;
CREATE FUNCTION program_read_private.matches_category(person text, target text, post_hs boolean DEFAULT false) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT CASE WHEN coalesce(post_hs,false) AND program_read_private.category_code(target) = 'HS' THEN false
 ELSE program_read_private.category_code(target) = 'GENERAL'
 OR program_read_private.category_code(person) = program_read_private.category_code(target)
 OR (coalesce(post_hs,false) AND program_read_private.category_code(target) IN ('JR','SR')) END;
$$;
ALTER FUNCTION program_read_private.matches_category(text,text,boolean) OWNER TO postgres;
CREATE FUNCTION program_read_private.authorize(tenant uuid, festival uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.profiles a JOIN public.festival_calendar f ON f.id = festival
  WHERE a.id = auth.uid() AND (a.is_superadmin IS TRUE OR (a.role = 'admin' AND a.tenant_id = tenant))
    AND f.tenant_id = tenant
 ) THEN RAISE EXCEPTION 'Festival unavailable' USING ERRCODE = '42501'; END IF;
END;
$$;
ALTER FUNCTION program_read_private.authorize(uuid,uuid) OWNER TO postgres;

CREATE FUNCTION public.admin_program_cards_page(p_tenant_id uuid, p_festival_id uuid,
 p_section text DEFAULT 'individual', p_search text DEFAULT '', p_type text DEFAULT 'All types',
 p_stage text DEFAULT 'All stages', p_status text DEFAULT 'All statuses', p_category text DEFAULT 'All categories', p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM program_read_private.authorize(p_tenant_id,p_festival_id);
 IF p_section IS NULL OR p_section NOT IN ('individual','group') OR p_page IS NULL OR p_page < 1
 OR p_status IS NULL OR p_status NOT IN ('All statuses','Complete','Open') THEN RAISE EXCEPTION 'Invalid program filter'; END IF;
 WITH cards AS MATERIALIZED (
  SELECT jsonb_build_object('id',i.id,'item_code',i.item_code,'item_name_en',i.item_name_en,'item_name_ml',i.item_name_ml,
   'category_codes',i.category_codes,'participation_type',i.participation_type,'item_type',i.item_type,
   'max_participants_per_team',i.max_participants_per_team,'gender',i.gender,'is_active',i.is_active,
   'group_min_members',i.group_min_members,'group_max_members',i.group_max_members,
   'white_dress_required',to_jsonb(i)->'white_dress_required',
   'regional_dialect_blocked',to_jsonb(i)->'regional_dialect_blocked',
   'organisation_id',to_jsonb(i)->'organisation_id') AS item,
   i.id AS item_id, upper(btrim(code)) AS category,
   CASE WHEN lower(btrim(coalesce(i.participation_type,''))) = 'group' THEN 'general_team' ELSE 'participant' END AS kind,
   coalesce(i.item_name_en,i.item_code) AS name, i.item_name_ml, i.item_code,
   lower(i.participation_type) AS participation_type, i.item_type, i.max_participants_per_team,
   coalesce((SELECT s.is_complete FROM public.program_intake_statuses s
     WHERE s.tenant_id=p_tenant_id AND s.festival_id=p_festival_id AND s.item_id=i.id AND upper(s.category_code)=upper(btrim(code))
     AND (s.entry_kind=CASE WHEN lower(btrim(coalesce(i.participation_type,'')))='group' THEN 'general_team' ELSE 'participant' END
       OR (lower(btrim(coalesce(i.participation_type,'')))='group' AND s.entry_kind='participant'))
     ORDER BY (s.entry_kind='general_team') DESC LIMIT 1),false) AS is_complete
  FROM public.items i JOIN public.festival_calendar f ON f.id=i.festival_id AND f.tenant_id=i.tenant_id
  CROSS JOIN LATERAL unnest(coalesce(i.category_codes,ARRAY[]::text[])) code
  WHERE i.tenant_id=p_tenant_id AND i.festival_id=p_festival_id AND i.is_active IS TRUE
   AND (lower(btrim(coalesce(i.participation_type,'')))='group')=(p_section='group')
   AND (upper(btrim(code)) NOT IN ('GN','GENERAL') OR f.general_category_enabled IS TRUE)
 ), filtered AS MATERIALIZED (
  SELECT * FROM cards c WHERE
   (coalesce(btrim(p_search),'')='' OR strpos(lower(c.name || ' ' || coalesce(c.item_name_ml,'') || ' ' || c.item_code),lower(btrim(p_search)))>0)
   AND (p_type='All types' OR c.participation_type=p_type)
   AND (p_stage='All stages' OR c.item_type=CASE WHEN p_stage='On Stage' THEN 'stage' ELSE 'offstage' END)
   AND (p_status='All statuses' OR c.is_complete=(p_status='Complete'))
   AND (p_category='All categories' OR program_read_private.category_code(c.category)=program_read_private.category_code(p_category))
 ), page AS MATERIALIZED (
  SELECT * FROM filtered ORDER BY name,item_id,category,kind LIMIT 20 OFFSET (p_page::bigint-1)*20
 ), orgs AS MATERIALIZED (SELECT id FROM public.get_visible_organisations(p_tenant_id)),
 assignments AS MATERIALIZED (
  SELECT r.item_id,r.entry_kind,r.status,r.participant_id,coalesce(r.organisation_id,p.organisation_id) AS team,
   p.category_code FROM public.registrations r LEFT JOIN public.participants p ON p.id=r.participant_id
   AND p.festival_id=p_festival_id AND (p.tenant_id=p_tenant_id OR EXISTS (
    SELECT 1 FROM public.organisations po WHERE po.id=p.organisation_id AND po.tenant_id=p.tenant_id))
  WHERE (r.tenant_id=p_tenant_id OR r.tenant_id IS NULL OR r.tenant_id=p.tenant_id)
   AND r.festival_id=p_festival_id AND r.item_id IN (SELECT item_id FROM page)
   AND coalesce(r.organisation_id,p.organisation_id) IN (SELECT id FROM orgs)
   AND (r.entry_kind='general_team' OR p.id IS NOT NULL)
 ), result_cards AS (
  SELECT pg.*, CASE WHEN pg.kind='general_team' THEN
    (SELECT count(*) FROM assignments a WHERE a.item_id=pg.item_id AND a.entry_kind='general_team')
   ELSE (SELECT count(*) FROM assignments a WHERE a.item_id=pg.item_id AND a.participant_id IS NOT NULL
    AND a.status IS DISTINCT FROM 'rejected' AND program_read_private.matches_category(a.category_code,pg.category)) END AS assigned_count,
   (SELECT count(*) FROM (SELECT a.team FROM assignments a WHERE a.item_id=pg.item_id AND a.entry_kind='participant'
     AND a.participant_id IS NOT NULL AND a.team IS NOT NULL AND a.status IS DISTINCT FROM 'rejected'
     AND a.status IS DISTINCT FROM 'cancelled' GROUP BY a.team
     HAVING count(*)>pg.max_participants_per_team) teams) AS over_limit_teams
  FROM page pg
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'section_total',(SELECT count(*) FROM cards),
  'completed',(SELECT count(*) FROM cards WHERE is_complete),
  'options',jsonb_build_object('type',coalesce((SELECT jsonb_agg(v ORDER BY v) FROM (SELECT DISTINCT participation_type v FROM cards WHERE participation_type IS NOT NULL) t),'[]'::jsonb),
    'stage',coalesce((SELECT jsonb_agg(v ORDER BY v) FROM (SELECT DISTINCT CASE WHEN item_type='stage' THEN 'On Stage' ELSE 'Off Stage' END v FROM cards WHERE item_type IS NOT NULL) t),'[]'::jsonb),
    'category',coalesce((SELECT jsonb_agg(v ORDER BY v) FROM (SELECT DISTINCT program_read_private.category_code(category) v FROM cards) t),'[]'::jsonb)),
  'cards',coalesce((SELECT jsonb_agg(jsonb_build_object('item',item,'category',category,'kind',kind,'is_complete',is_complete,'assigned_count',assigned_count,'over_limit_teams',over_limit_teams) ORDER BY name,item_id,category,kind) FROM result_cards),'[]'::jsonb)) INTO result;
 RETURN result;
END;
$$;
ALTER FUNCTION public.admin_program_cards_page(uuid,uuid,text,text,text,text,text,text,integer) OWNER TO postgres;

CREATE FUNCTION public.admin_program_detail(p_tenant_id uuid,p_festival_id uuid,p_item_id uuid,p_category text,p_include_eligible boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM program_read_private.authorize(p_tenant_id,p_festival_id);
 IF NOT EXISTS (SELECT 1 FROM public.items i WHERE i.id=p_item_id AND i.festival_id=p_festival_id AND i.tenant_id=p_tenant_id
   AND EXISTS(SELECT 1 FROM unnest(i.category_codes) code WHERE upper(btrim(code))=upper(btrim(p_category))))
 THEN RAISE EXCEPTION 'Program unavailable'; END IF;
 WITH orgs AS MATERIALIZED (SELECT id FROM public.get_visible_organisations(p_tenant_id)),
 regs AS MATERIALIZED (SELECT r.id,r.item_id,r.participant_id,r.organisation_id,r.tenant_id,r.festival_id,r.entry_kind,r.status,r.is_verified,r.code_letter
  FROM public.registrations r LEFT JOIN public.participants rp ON rp.id=r.participant_id AND rp.festival_id=p_festival_id
   AND (rp.tenant_id=p_tenant_id OR EXISTS (SELECT 1 FROM public.organisations rpo WHERE rpo.id=rp.organisation_id AND rpo.tenant_id=rp.tenant_id))
  WHERE (r.tenant_id=p_tenant_id OR r.tenant_id IS NULL OR r.tenant_id=rp.tenant_id)
   AND r.item_id=p_item_id AND r.festival_id=p_festival_id
   AND coalesce(r.organisation_id,rp.organisation_id) IN (SELECT id FROM orgs)
   AND (r.entry_kind='general_team' OR rp.id IS NOT NULL)),
 people AS (
  SELECT p.id,p.tenant_id,p.festival_id,p.organisation_id,p.name,p.chest_number,p.category_code,p.gender,p.status,
   p.is_post_hs_religious,p.plagiarism_ban_until,
   jsonb_build_object('id',o.id,'name',o.name,'org_type',o.org_type) AS organisations
  FROM public.participants p JOIN public.organisations o ON o.id=p.organisation_id
  JOIN public.items i ON i.id=p_item_id AND i.festival_id=p_festival_id
  WHERE p.festival_id=p_festival_id AND p.organisation_id IN (SELECT id FROM orgs)
    AND (p.tenant_id=p_tenant_id OR p.tenant_id=o.tenant_id)
    AND (EXISTS(SELECT 1 FROM regs r WHERE r.participant_id=p.id)
      OR (p_include_eligible AND p.status IS DISTINCT FROM 'rejected'
       AND program_read_private.matches_category(p.category_code,p_category,p.is_post_hs_religious)
       AND (i.gender IS NULL OR i.gender IN ('','both') OR i.gender=p.gender)))
 ) SELECT jsonb_build_object('participants',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name,p.id) FROM people p),'[]'::jsonb),
   'registrations',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM regs r),'[]'::jsonb),
   'organisation_ids',coalesce((SELECT jsonb_agg(id) FROM orgs),'[]'::jsonb)) INTO result;
 RETURN result;
END;
$$;
ALTER FUNCTION public.admin_program_detail(uuid,uuid,uuid,text,boolean) OWNER TO postgres;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA program_read_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_program_cards_page(uuid,uuid,text,text,text,text,text,text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_program_detail(uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_program_cards_page(uuid,uuid,text,text,text,text,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_program_detail(uuid,uuid,uuid,text,boolean) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
