CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA stage_portal_private;
CREATE TABLE public.items (
  id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid,
  participation_type text, category_codes text[]
);
CREATE TABLE public.venues (id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid);
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, item_id uuid,
  venue_id uuid, is_shuffle_locked boolean DEFAULT false
);
CREATE TABLE public.participants (id uuid PRIMARY KEY, chest_number text);
CREATE TABLE public.registrations (
  id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, item_id uuid,
  participant_id uuid, organisation_id uuid, status text DEFAULT 'approved',
  is_verified boolean DEFAULT false, code_letter text
);
CREATE FUNCTION public.stage_assert_admin_access() RETURNS uuid LANGUAGE sql AS $$
  SELECT '00000000-0000-0000-0000-000000000001'::uuid
$$;
CREATE FUNCTION stage_portal_private.assert_pin(uuid, text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
CREATE FUNCTION public.get_visible_organisations(uuid)
RETURNS TABLE(id uuid, tenant_id uuid) LANGUAGE sql AS $$
  SELECT NULL::uuid, NULL::uuid WHERE false
$$;
CREATE FUNCTION public.stage_update_registration(uuid, uuid, text)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.stage_venue_portal_update_registration(uuid, text, uuid, uuid, text)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
