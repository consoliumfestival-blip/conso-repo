-- Disposable database fixture. Never run on a live project.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE TABLE public.results(id integer PRIMARY KEY, tenant_id uuid, festival_id uuid, item_id uuid,
  published boolean, result_status text, public_visible boolean, points_awarded integer, total_score numeric);
CREATE FUNCTION public.smart_announcer_assert_admin(p_tenant_id uuid, p_festival_id uuid)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF current_setting('fixture.tenant',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON public.results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.results TO service_role;
INSERT INTO public.results VALUES
(1,'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true,'published',false,5,88),
(2,'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true,'published',false,0,30),
(3,'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',true,'published',false,3,70),
(4,'20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',true,'published',false,7,90);
