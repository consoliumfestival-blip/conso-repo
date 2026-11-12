-- Synthetic schema for a disposable PostgreSQL database only.
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.tenants(id uuid PRIMARY KEY, access_disabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.profiles(id uuid, tenant_id uuid, role text, is_superadmin boolean);
CREATE TABLE public.festival_calendar(id uuid PRIMARY KEY, tenant_id uuid);
CREATE TABLE public.items(id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, item_name_en text, item_name_ml text, item_code text, category_codes text[], participation_type text);
CREATE TABLE public.organisations(id uuid PRIMARY KEY, name text, tenant_id uuid, parent_id uuid);
CREATE TABLE public.participants(id uuid PRIMARY KEY, name text, organisation_id uuid);
CREATE TABLE public.registrations(id uuid PRIMARY KEY, participant_id uuid, group_leader_participant_id uuid, organisation_id uuid, status text);
CREATE TABLE public.results(id uuid PRIMARY KEY, festival_id uuid, tenant_id uuid, item_id uuid, registration_id uuid, published boolean, result_status text, public_visible boolean, rank integer, grade text, points_awarded integer);
CREATE TABLE public.result_team_awards(result_id uuid, organisation_id uuid);
CREATE FUNCTION public.get_admin_published_results(p_tenant_id uuid, p_festival_id uuid)
RETURNS TABLE(item_id uuid, item_name text, item_name_ml text, organisation_id uuid, rank integer, published boolean, result_status text, public_visible boolean, festival_id uuid, tenant_id uuid, registration_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.smart_announcer_assert_admin(p_tenant_id, p_festival_id);
  RETURN QUERY SELECT r.item_id, COALESCE(i.item_name_en,''), COALESCE(i.item_name_ml,''), COALESCE(a.organisation_id, reg.organisation_id, p.organisation_id), r.rank, r.published, r.result_status, r.public_visible, r.festival_id, r.tenant_id, r.registration_id
  FROM public.results r JOIN public.items i ON i.id=r.item_id
  LEFT JOIN public.result_team_awards a ON a.result_id=r.id
  LEFT JOIN public.registrations reg ON reg.id=r.registration_id
  LEFT JOIN public.participants p ON p.id=reg.participant_id
  WHERE r.festival_id=p_festival_id AND r.published AND r.result_status='published';
END $$;
