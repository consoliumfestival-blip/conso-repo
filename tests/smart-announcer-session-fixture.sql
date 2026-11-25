-- Disposable PostgreSQL only, after pin setup + queue + PIN migrations.
CREATE TABLE public.venues(id uuid PRIMARY KEY,name text);
CREATE TABLE public.schedules(id uuid,item_id uuid,tenant_id uuid,festival_id uuid,venue_id uuid,start_time timestamptz);
CREATE FUNCTION public.tenant_module_enabled(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.module',true) IS DISTINCT FROM 'off' $$;
ALTER TABLE public.results ADD COLUMN published_at timestamptz;
ALTER TABLE public.organisations ADD COLUMN org_type text;
CREATE TABLE public.festival_leaderboard_settings(festival_id uuid,ranking_mode text,item_limit integer);
CREATE TABLE public.points_config(festival_id uuid,enable_grace_marks boolean,config_version integer);
CREATE TABLE public.grace_marks(org_id uuid,festival_id uuid,tenant_id uuid,submission_id uuid,points integer);
INSERT INTO auth.users VALUES(md5('admin')::uuid);
INSERT INTO tenants(id) VALUES(md5('tenant')::uuid),(md5('foreign')::uuid);
INSERT INTO festival_calendar VALUES(md5('festival')::uuid,md5('tenant')::uuid);
INSERT INTO profiles VALUES(md5('admin')::uuid,md5('tenant')::uuid,'tenant_admin',false);
SELECT set_config('request.jwt.claim.sub',md5('admin')::uuid::text,false);
