SET ROLE authenticated;
SELECT set_config('fixture.admin','20000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE c jsonb; BEGIN
 c:=public.admin_festival_readonly_portal('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',false);
 PERFORM set_config('fixture.link',c->>'link_id',false); PERFORM set_config('fixture.pin',c->>'pin',false);
 BEGIN PERFORM public.admin_festival_readonly_portal('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002',false); RAISE EXCEPTION 'Cross-tenant admin access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ DECLARE d jsonb; BEGIN
 IF has_schema_privilege('anon','festival_readonly_private','usage') OR has_function_privilege('anon','public.admin_festival_readonly_portal(uuid,uuid,boolean)','execute') THEN RAISE EXCEPTION 'Credential access exposed'; END IF;
 d:=public.festival_readonly_data(current_setting('fixture.link')::uuid,current_setting('fixture.pin'),'participants');
 IF d->>'status'<>'ok' OR jsonb_array_length(d->'rows')<>1 OR d::text LIKE '%Secret%' THEN RAISE EXCEPTION 'Participant scope failed'; END IF;
 IF d::text LIKE '%phone%' OR d::text LIKE '%email%' THEN RAISE EXCEPTION 'Private field exposed'; END IF;
 d:=public.festival_readonly_data(current_setting('fixture.link')::uuid,current_setting('fixture.pin'),'participant','','1','50000000-0000-0000-0000-000000000001');
 IF jsonb_array_length(d->'rows')<>2 THEN RAISE EXCEPTION 'Participant assignment failed'; END IF;
 d:=public.festival_readonly_data(current_setting('fixture.link')::uuid,current_setting('fixture.pin'),'programs');
 IF jsonb_array_length(d->'rows')<>2 OR d::text NOT LIKE '%Assigned inactive%' OR d::text LIKE '%Unassigned inactive%' THEN RAISE EXCEPTION 'Inactive assignment visibility failed'; END IF;
 d:=public.festival_readonly_data(current_setting('fixture.link')::uuid,current_setting('fixture.pin'),'program','','1','60000000-0000-0000-0000-000000000001');
 IF jsonb_array_length(d->'rows')<>1 OR d::text LIKE '%Secret%' THEN RAISE EXCEPTION 'Group roster scope failed'; END IF;
 FOR i IN 1..8 LOOP d:=public.festival_readonly_data(current_setting('fixture.link')::uuid,CASE WHEN current_setting('fixture.pin')='9999' THEN '8888' ELSE '9999' END,'participants'); END LOOP;
 d:=public.festival_readonly_data(current_setting('fixture.link')::uuid,current_setting('fixture.pin'),'participants');
 IF d->>'status'<>'locked' THEN RAISE EXCEPTION 'PIN lockout failed'; END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ DECLARE c jsonb; BEGIN
 c:=public.admin_festival_readonly_portal('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',true);
 PERFORM set_config('fixture.newlink',c->>'link_id',false); PERFORM set_config('fixture.newpin',c->>'pin',false);
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 IF public.festival_readonly_data(current_setting('fixture.link')::uuid,current_setting('fixture.pin'),'participants')->>'status'<>'invalid' THEN RAISE EXCEPTION 'Old link still works'; END IF;
 IF public.festival_readonly_data(current_setting('fixture.newlink')::uuid,current_setting('fixture.newpin'),'programs')->>'status'<>'ok' THEN RAISE EXCEPTION 'Rotated link failed'; END IF;
END $$;
RESET ROLE;
