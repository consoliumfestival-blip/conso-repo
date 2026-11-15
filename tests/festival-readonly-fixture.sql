-- Disposable database only.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE public.tenants(id uuid PRIMARY KEY, access_disabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.festival_calendar(id uuid PRIMARY KEY, tenant_id uuid, is_active boolean);
CREATE TABLE public.organisations(id uuid PRIMARY KEY, tenant_id uuid, name text, archived_at timestamptz);
CREATE TABLE public.festival_teams(organisation_id uuid, festival_id uuid, parent_tenant_id uuid, is_active boolean);
CREATE TABLE public.participants(id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, organisation_id uuid, name text, chest_number text, category_code text, gender text, status text);
CREATE TABLE public.items(id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, item_name_en text, item_name_ml text, item_code text, category_codes text[], item_type text, participation_type text, is_active boolean);
CREATE TABLE public.registrations(id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, organisation_id uuid, item_id uuid, participant_id uuid, entry_kind text, entry_chest_number text, status text);
CREATE TABLE public.group_members(registration_id uuid, participant_id uuid, member_order integer);
CREATE FUNCTION public.get_visible_organisations(p_tenant uuid) RETURNS TABLE(id uuid,tenant_id uuid) LANGUAGE sql AS $$
 SELECT o.id,o.tenant_id FROM public.organisations o WHERE o.tenant_id=p_tenant;
$$;
CREATE FUNCTION public.smart_announcer_assert_admin(p_tenant_id uuid,p_festival_id uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('fixture.admin',true) IS DISTINCT FROM p_tenant_id::text THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
END $$;
INSERT INTO public.tenants VALUES ('20000000-0000-0000-0000-000000000001',false),('20000000-0000-0000-0000-000000000002',false);
INSERT INTO public.festival_calendar VALUES ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',true),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',true);
INSERT INTO public.organisations VALUES ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Team A',null),('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Other team',null);
INSERT INTO public.festival_teams VALUES ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',true),('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',true);
INSERT INTO public.participants VALUES ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Alice','101','A','F','active'),('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','Secret','202','B','M','active');
INSERT INTO public.items VALUES ('60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Speech','','A1',ARRAY['A'],'stage','group',true);
INSERT INTO public.registrations VALUES ('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','participant',null,'active');
INSERT INTO public.group_members VALUES ('70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1),('70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002',2);
INSERT INTO public.items VALUES
 ('60000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Assigned inactive','','A2',ARRAY['A'],'stage','individual',false),
 ('60000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Unassigned inactive','','A3',ARRAY['A'],'stage','individual',false);
INSERT INTO public.registrations VALUES ('70000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','participant',null,'active');
-- Even inconsistent team links must not expose another tenant's participant.
INSERT INTO public.festival_teams VALUES ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',true);
INSERT INTO public.participants VALUES ('50000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','Intruder','203','B','M','active');
