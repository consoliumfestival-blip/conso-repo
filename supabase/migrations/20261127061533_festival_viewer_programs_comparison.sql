-- Extend the PIN-scoped, read-only viewer with Admin-equivalent program reads.
BEGIN;
CREATE OR REPLACE FUNCTION public.festival_readonly_data(p_link_id uuid, p_pin text, p_view text,
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
  IF p_view NOT IN ('participants','programs','participant','program','auth') THEN RETURN pg_catalog.jsonb_build_object('status','invalid'); END IF;
  IF p_view='auth' THEN RETURN pg_catalog.jsonb_build_object('status','ok','rows','[]'::jsonb);
  ELSIF p_view='participants' THEN
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
CREATE OR REPLACE FUNCTION program_read_private.compare_participants_core(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_programs jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE result jsonb;
BEGIN

  IF jsonb_typeof(p_programs) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_programs) < 2 THEN
    RAISE EXCEPTION 'Select at least two programs to compare.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_programs) > 100 THEN
    RAISE EXCEPTION 'Select at most 100 programs to compare.' USING ERRCODE = '22023';
  END IF;

  WITH selected_input AS MATERIALIZED (
    SELECT DISTINCT
      (entry ->> 'item_id')::uuid AS item_id,
      program_read_private.category_code(coalesce(entry ->> 'category', '')) AS category
    FROM jsonb_array_elements(p_programs) AS value(entry)
    WHERE nullif(entry ->> 'item_id', '') IS NOT NULL
      AND nullif(btrim(entry ->> 'category'), '') IS NOT NULL
  ), selected_programs AS MATERIALIZED (
    SELECT selection.item_id,
      selection.category,
      i.item_code,
      coalesce(i.item_name_en, i.item_code) AS item_name,
      CASE WHEN lower(btrim(coalesce(i.participation_type, ''))) = 'group'
        THEN 'group' ELSE 'individual' END AS kind
    FROM selected_input selection
    JOIN public.items i ON i.id = selection.item_id
      AND i.tenant_id = p_tenant_id
      AND i.festival_id = p_festival_id
      AND i.is_active IS TRUE
    JOIN public.festival_calendar f ON f.id = i.festival_id AND f.tenant_id = i.tenant_id
    WHERE EXISTS (
      SELECT 1 FROM unnest(coalesce(i.category_codes, ARRAY[]::text[])) AS category_code
      WHERE program_read_private.category_code(category_code) = selection.category
    )
      AND (selection.category <> 'GENERAL' OR f.general_category_enabled IS TRUE)
  ), visible_organisations AS MATERIALIZED (
    SELECT id, tenant_id FROM public.get_visible_organisations(p_tenant_id)
  ), direct_members AS (
    SELECT DISTINCT program.item_id, program.category, program.item_code, program.item_name, program.kind,
      person.id AS participant_id, person.name AS participant_name, person.chest_number, false AS group_member
    FROM selected_programs program
    JOIN public.registrations registration ON registration.item_id = program.item_id
      AND registration.festival_id = p_festival_id
      AND registration.status IS DISTINCT FROM 'rejected'
      AND registration.status IS DISTINCT FROM 'cancelled'
      AND registration.participant_id IS NOT NULL
    JOIN public.participants person ON person.id = registration.participant_id
      AND person.festival_id = p_festival_id
    JOIN visible_organisations organisation ON organisation.id = person.organisation_id
      AND (person.tenant_id = p_tenant_id OR person.tenant_id = organisation.tenant_id)
      AND (registration.organisation_id IS NULL OR registration.organisation_id = organisation.id)
      AND (registration.tenant_id = p_tenant_id OR registration.tenant_id IS NULL
        OR (registration.tenant_id = person.tenant_id AND person.tenant_id = organisation.tenant_id))
    WHERE program_read_private.matches_category(
      person.category_code,
      program.category,
      coalesce((pg_catalog.to_jsonb(person)->>'is_post_hs_religious')::boolean, false)
    )
  ), group_members AS (
    SELECT DISTINCT program.item_id, program.category, program.item_code, program.item_name, program.kind,
      person.id AS participant_id, person.name AS participant_name, person.chest_number, true AS group_member
    FROM selected_programs program
    JOIN public.registrations registration ON registration.item_id = program.item_id
      AND registration.festival_id = p_festival_id
      AND registration.status IS DISTINCT FROM 'rejected'
      AND registration.status IS DISTINCT FROM 'cancelled'
    JOIN public.group_members member ON member.registration_id = registration.id
    JOIN public.participants person ON person.id = member.participant_id
      AND person.festival_id = p_festival_id
    JOIN visible_organisations organisation ON organisation.id = person.organisation_id
      AND (person.tenant_id = p_tenant_id OR person.tenant_id = organisation.tenant_id)
      AND (registration.organisation_id IS NULL OR registration.organisation_id = organisation.id)
      AND (registration.tenant_id = p_tenant_id OR registration.tenant_id IS NULL
        OR registration.tenant_id = organisation.tenant_id)
    WHERE program_read_private.matches_category(
      person.category_code,
      program.category,
      coalesce((pg_catalog.to_jsonb(person)->>'is_post_hs_religious')::boolean, false)
    )
  ), memberships AS MATERIALIZED (
    SELECT DISTINCT ON (member.item_id, member.category, member.participant_id)
      member.*
    FROM (
      SELECT * FROM direct_members
      UNION ALL
      SELECT * FROM group_members
    ) member
    ORDER BY member.item_id, member.category, member.participant_id, member.group_member DESC
  ), shared_people AS (
    SELECT participant_id,
      max(participant_name) AS participant_name,
      max(chest_number) AS chest_number,
      count(DISTINCT (item_id, category)) AS program_count,
      jsonb_agg(jsonb_build_object(
        'item_id', item_id,
        'item_code', item_code,
        'item_name', item_name,
        'category', category,
        'kind', kind,
        'group_member', group_member
      ) ORDER BY item_name, item_code, category) AS programs
    FROM memberships
    GROUP BY participant_id
    HAVING count(DISTINCT (item_id, category)) > 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'participant_id', participant_id,
    'participant_name', participant_name,
    'chest_number', chest_number,
    'program_count', program_count,
    'programs', programs
  ) ORDER BY chest_number NULLS LAST, participant_name, participant_id), '[]'::jsonb)
  INTO result
  FROM shared_people;

  RETURN result;
END;
$function$;
CREATE OR REPLACE FUNCTION program_read_private.cards_page_core(p_tenant_id uuid, p_festival_id uuid,
 p_section text DEFAULT 'individual', p_search text DEFAULT '', p_type text DEFAULT 'All types',
 p_stage text DEFAULT 'All stages', p_status text DEFAULT 'All statuses', p_category text DEFAULT 'All categories', p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 IF p_section IS NULL OR p_section NOT IN ('all','individual','group') OR p_page IS NULL OR p_page < 1
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
   AND (p_section='all' OR (lower(btrim(coalesce(i.participation_type,'')))='group')=(p_section='group'))
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
CREATE OR REPLACE FUNCTION public.admin_program_participant_comparison(p_tenant_id uuid, p_festival_id uuid, p_programs jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM program_read_private.authorize(p_tenant_id, p_festival_id);
  RETURN program_read_private.compare_participants_core(p_tenant_id, p_festival_id, p_programs);
END $$;
CREATE OR REPLACE FUNCTION public.admin_program_cards_page(p_tenant_id uuid, p_festival_id uuid,
 p_section text DEFAULT 'individual', p_search text DEFAULT '', p_type text DEFAULT 'All types',
 p_stage text DEFAULT 'All stages', p_status text DEFAULT 'All statuses', p_category text DEFAULT 'All categories', p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM program_read_private.authorize(p_tenant_id,p_festival_id);
 RETURN program_read_private.cards_page_core(p_tenant_id,p_festival_id,p_section,p_search,p_type,p_stage,p_status,p_category,p_page);
END;
$$;
CREATE FUNCTION public.festival_readonly_program_comparison(p_link_id uuid, p_pin text, p_mode text, p_programs jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE access_result jsonb; c festival_readonly_private.credentials%ROWTYPE; result jsonb;
BEGIN
  access_result := public.festival_readonly_data(p_link_id, p_pin, 'auth', '', 1, NULL);
  IF access_result->>'status' IS DISTINCT FROM 'ok' THEN RETURN access_result; END IF;
  SELECT * INTO c FROM festival_readonly_private.credentials WHERE link_id=p_link_id;
  IF c.festival_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid'); END IF;
  IF p_mode='options' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
    'item_id', item_id, 'item_code', item_code, 'item_name', item_name,
    'category', category, 'kind', kind
  ) ORDER BY item_name, item_code, category, kind), '[]'::jsonb) INTO result
  FROM (
    SELECT i.id AS item_id, i.item_code,
      coalesce(i.item_name_en, i.item_code) AS item_name,
      program_read_private.category_code(category_code) AS category,
      CASE WHEN lower(btrim(coalesce(i.participation_type, ''))) = 'group' THEN 'group' ELSE 'individual' END AS kind
    FROM public.items i
    JOIN public.festival_calendar f ON f.id = i.festival_id AND f.tenant_id = i.tenant_id
    CROSS JOIN LATERAL unnest(coalesce(i.category_codes, ARRAY[]::text[])) AS category_code
    WHERE i.tenant_id = c.tenant_id AND i.festival_id = c.festival_id AND i.is_active IS TRUE
      AND (program_read_private.category_code(category_code) <> 'GENERAL' OR f.general_category_enabled IS TRUE)
  ) options;
  ELSIF p_mode='compare' THEN
    result := program_read_private.compare_participants_core(c.tenant_id,c.festival_id,p_programs);
  ELSE
    RETURN pg_catalog.jsonb_build_object('status','invalid');
  END IF;
  RETURN pg_catalog.jsonb_build_object('status','ok','rows',result);
END $$;
CREATE FUNCTION public.festival_readonly_programs_page(p_link_id uuid, p_pin text,
 p_section text DEFAULT 'all', p_search text DEFAULT '', p_type text DEFAULT 'All types',
 p_stage text DEFAULT 'All stages', p_status text DEFAULT 'All statuses', p_category text DEFAULT 'All categories', p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE access_result jsonb; c festival_readonly_private.credentials%ROWTYPE; result jsonb;
BEGIN
  access_result := public.festival_readonly_data(p_link_id, p_pin, 'auth', '', 1, NULL);
  IF access_result->>'status' IS DISTINCT FROM 'ok' THEN RETURN access_result; END IF;
  SELECT * INTO c FROM festival_readonly_private.credentials WHERE link_id=p_link_id;
  IF c.festival_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid'); END IF;
  result := program_read_private.cards_page_core(c.tenant_id,c.festival_id,p_section,p_search,p_type,p_stage,p_status,p_category,p_page);
  RETURN pg_catalog.jsonb_build_object('status','ok','page',pg_catalog.jsonb_build_object(
    'total',result->'total','section_total',result->'section_total','completed',result->'completed','options',result->'options',
    'cards',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'item',pg_catalog.jsonb_build_object('id',card->'item'->'id','item_code',card->'item'->'item_code',
        'item_name_en',card->'item'->'item_name_en','item_name_ml',card->'item'->'item_name_ml',
        'item_type',card->'item'->'item_type','participation_type',card->'item'->'participation_type'),
      'category',card->'category','kind',card->'kind','is_complete',card->'is_complete',
      'assigned_count',card->'assigned_count') ORDER BY position)
      FROM pg_catalog.jsonb_array_elements(result->'cards') WITH ORDINALITY AS entry(card,position)),'[]'::jsonb)));
END $$;

ALTER FUNCTION program_read_private.compare_participants_core(uuid,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION program_read_private.cards_page_core(uuid,uuid,text,text,text,text,text,text,integer) OWNER TO postgres;
ALTER FUNCTION public.festival_readonly_program_comparison(uuid,text,text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.festival_readonly_programs_page(uuid,text,text,text,text,text,text,text,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION program_read_private.compare_participants_core(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION program_read_private.cards_page_core(uuid,uuid,text,text,text,text,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.festival_readonly_program_comparison(uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.festival_readonly_programs_page(uuid,text,text,text,text,text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.festival_readonly_program_comparison(uuid,text,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.festival_readonly_programs_page(uuid,text,text,text,text,text,text,text,integer) TO anon,authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
