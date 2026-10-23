CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA team_assignment_test;

CREATE TABLE public.tenants (id uuid PRIMARY KEY);
INSERT INTO public.tenants VALUES ('40000000-0000-0000-0000-000000000001');
CREATE TABLE public.festival_calendar (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id)
);
INSERT INTO public.festival_calendar VALUES
  ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001');
CREATE TABLE public.organisations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id)
);
INSERT INTO public.organisations VALUES
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001');

CREATE FUNCTION public.get_visible_organisations(p_tenant_id uuid)
RETURNS TABLE (id uuid, tenant_id uuid)
LANGUAGE sql STABLE
AS $$ SELECT o.id, o.tenant_id FROM public.organisations o WHERE p_tenant_id = '40000000-0000-0000-0000-000000000001'::uuid $$;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE team_assignment_test.members (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  status text,
  is_eligible boolean NOT NULL
);
CREATE TABLE public.items (
  id uuid PRIMARY KEY,
  item_code text,
  item_name_en text,
  item_name_ml text,
  category_codes text[],
  gender text,
  participation_type text,
  group_min_members integer,
  group_max_members integer,
  is_active boolean,
  tenant_id uuid NOT NULL DEFAULT '40000000-0000-0000-0000-000000000001',
  festival_id uuid NOT NULL DEFAULT '40000000-0000-0000-0000-000000000001'
);
CREATE TABLE public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  entry_kind text NOT NULL DEFAULT 'participant',
  status text NOT NULL DEFAULT 'pending',
  tenant_id uuid NOT NULL DEFAULT '40000000-0000-0000-0000-000000000001',
  festival_id uuid NOT NULL DEFAULT '40000000-0000-0000-0000-000000000001',
  organisation_id uuid NOT NULL DEFAULT '30000000-0000-0000-0000-000000000001',
  UNIQUE (participant_id, item_id)
);
CREATE TABLE public.participants (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT '40000000-0000-0000-0000-000000000001',
  festival_id uuid NOT NULL DEFAULT '40000000-0000-0000-0000-000000000001',
  organisation_id uuid NOT NULL DEFAULT '30000000-0000-0000-0000-000000000001',
  status text
);

INSERT INTO public.items (id, item_code, item_name_en, item_name_ml, category_codes, gender,
                          participation_type, group_min_members, group_max_members, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001', 'IND-1', 'Individual One', NULL, ARRAY['JR'], 'both', 'individual', NULL, NULL, true),
  ('10000000-0000-0000-0000-000000000003', 'IND-2', 'Individual Two', NULL, ARRAY['JR'], 'both', 'individual', NULL, NULL, true),
  ('10000000-0000-0000-0000-000000000002', 'GRP-1', 'Group One', NULL, ARRAY['GN'], 'both', 'group', 2, 4, true);
INSERT INTO team_assignment_test.members VALUES
  ('20000000-0000-0000-0000-000000000001', 'Eligible A', 'approved', true),
  ('20000000-0000-0000-0000-000000000002', 'Eligible B', 'approved', true),
  ('20000000-0000-0000-0000-000000000003', 'Not Eligible', 'approved', false),
  ('20000000-0000-0000-0000-000000000004', 'Rejected', 'rejected', false);
INSERT INTO public.participants (id, status)
SELECT id, status FROM team_assignment_test.members;

CREATE FUNCTION public.get_team_leader_context()
RETURNS TABLE (team_id uuid, parent_tenant_id uuid, festival_id uuid, organisation_id uuid)
LANGUAGE sql STABLE
AS $$ SELECT '30000000-0000-0000-0000-000000000001'::uuid,
                '40000000-0000-0000-0000-000000000001'::uuid,
                '40000000-0000-0000-0000-000000000001'::uuid,
                '30000000-0000-0000-0000-000000000001'::uuid
       WHERE auth.uid() IS NOT NULL $$;

CREATE FUNCTION public.get_team_leader_participants()
RETURNS TABLE (id uuid, name text, gender text, category_code text, chest_number text,
               status text, festival_id uuid, organisation_id uuid, profile_slug text)
LANGUAGE sql STABLE
AS $$
  SELECT m.id, m.name, 'both', 'JR', m.id::text, m.status,
         '40000000-0000-0000-0000-000000000001'::uuid,
         '30000000-0000-0000-0000-000000000001'::uuid, NULL::text
  FROM team_assignment_test.members m
$$;

CREATE FUNCTION public.get_team_leader_programs(p_participant_id uuid)
RETURNS TABLE (item_id uuid, item_code text, item_name_en text, item_name_ml text,
  category_codes text[], gender text, participation_type text, group_min_members integer,
  group_max_members integer, entry_kind text, is_assigned boolean, is_eligible boolean,
  team_entry_count integer)
LANGUAGE sql STABLE
AS $$
  SELECT i.id, i.item_code, i.item_name_en, i.item_name_ml, i.category_codes, i.gender,
         i.participation_type, i.group_min_members, i.group_max_members,
         CASE WHEN i.participation_type = 'group' THEN 'general_team' ELSE 'participant' END,
         EXISTS (SELECT 1 FROM public.registrations r WHERE r.item_id = i.id AND r.participant_id = p_participant_id),
         m.is_eligible,
         (SELECT count(*)::integer FROM public.registrations r WHERE r.item_id = i.id AND r.entry_kind = 'general_team')
  FROM public.items i
  CROSS JOIN team_assignment_test.members m
  WHERE m.id = p_participant_id AND (i.is_active OR EXISTS (
    SELECT 1 FROM public.registrations r WHERE r.item_id = i.id AND r.participant_id = p_participant_id
  ))
$$;

CREATE FUNCTION public.team_leader_assign_program(p_participant_id uuid, p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_registration_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM team_assignment_test.members m WHERE m.id = p_participant_id AND m.status IS DISTINCT FROM 'rejected' AND m.is_eligible) THEN
    RAISE EXCEPTION 'This student is not eligible in your team.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.items i WHERE i.id = p_item_id AND i.is_active AND i.participation_type = 'individual') THEN
    RAISE EXCEPTION 'This program is unavailable.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.registrations (participant_id, item_id)
  VALUES (p_participant_id, p_item_id)
  RETURNING id INTO v_registration_id;
  RETURN jsonb_build_object('registration_id', v_registration_id, 'participant_id', p_participant_id,
                            'item_id', p_item_id, 'status', 'pending');
END;
$$;

CREATE FUNCTION team_assignment_test.assert(passed boolean, label text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF passed IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
  RETURN 'PASS: ' || label;
END;
$$;

CREATE TABLE team_assignment_test.assignment_results (data jsonb NOT NULL);

SELECT set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', false);
