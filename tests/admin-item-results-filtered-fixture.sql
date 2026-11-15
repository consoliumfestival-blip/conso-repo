-- Disposable PostgreSQL fixture only. Do not run against a production database.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE TABLE public.items (id uuid PRIMARY KEY, festival_id uuid, tenant_id uuid, category_codes text[]);
CREATE TABLE public.fixture_results (
  result_id uuid, item_id uuid, festival_id uuid, tenant_id uuid, item_name text,
  item_name_ml text, organisation_name text, participant_name text, chest_number text,
  is_group boolean, points_awarded integer, grade text, public_visible boolean,
  result_status text, published_at timestamptz
);
GRANT SELECT ON public.items TO authenticated;
CREATE FUNCTION public.get_admin_published_results(p_tenant_id uuid, p_festival_id uuid)
RETURNS SETOF public.fixture_results LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM public.fixture_results r WHERE r.tenant_id = p_tenant_id AND r.festival_id = p_festival_id
  AND current_setting('fixture.tenant', true) = p_tenant_id::text;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_published_results(uuid, uuid) TO authenticated;
INSERT INTO public.items VALUES
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',ARRAY['NOVA']),
('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',ARRAY['PRIME']);
INSERT INTO public.fixture_results VALUES
('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Speech','','Team A','Alice','123',false,5,NULL,true,'published','2026-01-01'),
('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Speech','','Team A','Bob','124',false,0,'A',false,'published','2026-01-01'),
('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Group','','Team B','Carol','125',true,2,NULL,false,'published','2026-01-02');
