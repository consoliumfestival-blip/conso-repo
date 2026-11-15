-- Run after the disposable admin-item-results fixture and count migration.
SET ROLE authenticated;
SELECT set_config('fixture.tenant','20000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
 IF public.admin_core_published_item_count('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001') <> 3 THEN
   RAISE EXCEPTION 'Count must include hidden and zero-point items and count each item once';
 END IF;
 IF public.admin_core_published_item_count('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001') <> 0 THEN
   RAISE EXCEPTION 'Cross-tenant count exposed';
 END IF;
 IF has_function_privilege('anon','public.admin_core_published_item_count(uuid,uuid)','execute') THEN RAISE EXCEPTION 'Anonymous access'; END IF;
END $$;
RESET ROLE;
