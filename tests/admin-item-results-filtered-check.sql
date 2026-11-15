SET ROLE authenticated;
SELECT set_config('fixture.tenant','20000000-0000-0000-0000-000000000001',false);
DO $$
DECLARE result jsonb; tenant uuid := '20000000-0000-0000-0000-000000000001'; fest uuid := '30000000-0000-0000-0000-000000000001';
BEGIN
  result := public.admin_item_results_filtered(tenant, fest);
  IF jsonb_array_length(result->'rows') <> 2 THEN RAISE EXCEPTION 'positive points filtering failed'; END IF;
  IF jsonb_array_length(result->'items'->'10000000-0000-0000-0000-000000000001'->'result_ids') <> 2 THEN RAISE EXCEPTION 'item actions lost zero-point row'; END IF;
  IF (result->'items'->'10000000-0000-0000-0000-000000000001'->>'all_public')::boolean THEN RAISE EXCEPTION 'visibility summary ignored hidden row'; END IF;
  IF jsonb_array_length(public.admin_item_results_filtered(tenant,fest,'alice','nova','individual','published')->'rows') <> 1 THEN RAISE EXCEPTION 'combined filters failed'; END IF;
  IF jsonb_array_length(public.admin_item_results_filtered(tenant,fest,'','prime','group','unpublished')->'rows') <> 1 THEN RAISE EXCEPTION 'group filters failed'; END IF;
  IF jsonb_array_length(public.admin_item_results_filtered(tenant,fest,'bob')->'rows') <> 0 THEN RAISE EXCEPTION 'zero-point result exposed'; END IF;
  IF jsonb_array_length(public.admin_item_results_filtered('20000000-0000-0000-0000-000000000002',fest)->'rows') <> 0 THEN RAISE EXCEPTION 'cross tenant result exposed'; END IF;
  IF has_function_privilege('anon','public.admin_item_results_filtered(uuid,uuid,text,text,text,text)','execute') THEN RAISE EXCEPTION 'anonymous access'; END IF;
END $$;
RESET ROLE;
