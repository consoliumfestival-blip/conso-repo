SET ROLE authenticated;
SELECT set_config('fixture.tenant','20000000-0000-0000-0000-000000000001',false);
UPDATE public.results SET public_visible = true WHERE id = 1;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.results WHERE id IN (1,2) AND public_visible) <> 2 THEN RAISE EXCEPTION 'show not item-wide'; END IF;
 IF EXISTS(SELECT 1 FROM public.results WHERE id IN (3,4) AND public_visible) THEN RAISE EXCEPTION 'cross scope update'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.results WHERE id=1 AND points_awarded=5 AND total_score=88) THEN RAISE EXCEPTION 'score changed'; END IF;
END $$;
UPDATE public.results SET public_visible = false WHERE id = 2;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.results WHERE id IN (1,2) AND public_visible) THEN RAISE EXCEPTION 'hide not item-wide'; END IF;
 BEGIN UPDATE public.results SET public_visible = true WHERE id=4; RAISE EXCEPTION 'authorization bypass';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.results SET public_visible = (id = 1) WHERE id IN (1,2); RAISE EXCEPTION 'contradictory request accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
UPDATE public.results SET public_visible = true WHERE id IN (1,2);
INSERT INTO public.results VALUES
(1,'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true,'published',false,5,88)
ON CONFLICT (id) DO UPDATE SET public_visible=EXCLUDED.public_visible;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.results WHERE id IN (1,2) AND public_visible) THEN RAISE EXCEPTION 'republish hide not item-wide'; END IF;
END $$;
UPDATE public.results SET public_visible = true WHERE id IN (1,2);
INSERT INTO public.results VALUES
(5,'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true,'published',false,1,45);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.results WHERE id IN (1,2,5) AND public_visible) THEN RAISE EXCEPTION 'insert introduced partial visibility'; END IF;
END $$;
RESET ROLE;
SET ROLE service_role;
SELECT set_config('fixture.tenant','',false);
UPDATE public.results SET public_visible=true WHERE id=1;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.results WHERE id IN (1,2,5) AND public_visible) <> 3 THEN RAISE EXCEPTION 'service role visibility failed'; END IF;
END $$;
RESET ROLE;
