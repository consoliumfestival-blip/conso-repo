-- Run with ON_ERROR_STOP against a disposable database after both migrations.
INSERT INTO auth.users VALUES ('10000000-0000-0000-0000-000000000001');
INSERT INTO public.tenants(id) VALUES ('20000000-0000-0000-0000-000000000001'), ('20000000-0000-0000-0000-000000000002');
INSERT INTO public.profiles VALUES ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','tenant_admin',false);
INSERT INTO public.festival_calendar(id,tenant_id) VALUES ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'), ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002');
INSERT INTO public.organisations(id,name,tenant_id) VALUES ('60000000-0000-0000-0000-000000000001','Team A','20000000-0000-0000-0000-000000000001'), ('60000000-0000-0000-0000-000000000002','Team B','20000000-0000-0000-0000-000000000001'), ('60000000-0000-0000-0000-000000000003','Outside team','20000000-0000-0000-0000-000000000002');
INSERT INTO public.organisations(id,name,tenant_id,parent_id) VALUES ('60000000-0000-0000-0000-000000000004','Parent','20000000-0000-0000-0000-000000000001',NULL), ('60000000-0000-0000-0000-000000000005','Child team','20000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000004');
INSERT INTO public.items(id,tenant_id,festival_id,item_name_en) VALUES
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','First'),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Second');
INSERT INTO public.results(id,tenant_id,festival_id,item_id,published,result_status,public_visible,rank,points_awarded) VALUES
 ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',true,'published',false,1,7),
 ('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',true,'published',false,1,5);
INSERT INTO public.result_team_awards VALUES ('50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001'), ('50000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001');
UPDATE public.items SET participation_type='group' WHERE id='40000000-0000-0000-0000-000000000002';
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
CREATE TEMP TABLE test_credentials AS SELECT * FROM public.smart_announcer_issue_pin_token('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
CREATE TEMP TABLE legacy_credentials AS SELECT * FROM public.smart_announcer_issue_token('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
DO $$ DECLARE t text; p text; output jsonb; i int; BEGIN
 SELECT token,pin INTO t,p FROM test_credentials;
 IF p !~ '^[0-9]{4}$' OR length(t) <> 64 THEN RAISE EXCEPTION 'credential format'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.smart_announcer_credentials WHERE token_hash=extensions.digest(t,'sha256') AND pin_hash LIKE '$2a$12$%') THEN RAISE EXCEPTION 'PIN hash cost is incorrect'; END IF;
 IF public.smart_announcer_access_mode(t) <> 'pin' OR public.smart_announcer_access_mode((SELECT token FROM legacy_credentials)) <> 'legacy' OR public.smart_announcer_access_mode(repeat('0',64)) <> 'invalid' THEN RAISE EXCEPTION 'incorrect access mode'; END IF;
 IF EXISTS (SELECT 1 FROM public.smart_announcer_credentials WHERE pin_hash=p OR pin_hash IS NULL AND token_hash=extensions.digest(t,'sha256')) THEN RAISE EXCEPTION 'PIN stored unsafely'; END IF;
 BEGIN PERFORM * FROM public.smart_announcer_get_queue(t); RAISE EXCEPTION 'PIN bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (public.smart_announcer_get_queue_pin(t,p)->>'status') <> 'ok' THEN RAISE EXCEPTION 'valid PIN denied'; END IF;
 IF has_function_privilege('anon','public.smart_announcer_issue_pin_token(uuid,uuid)','execute') OR has_function_privilege('anon','public.smart_announcer_team_candidates(uuid,uuid,uuid)','execute') OR has_function_privilege('anon','public.smart_announcer_replace_team_queue(uuid,uuid,uuid,uuid[])','execute') OR has_function_privilege('anon','public.smart_announcer_check_pin(text,text,boolean)','execute') OR has_function_privilege('anon','public.smart_announcer_get_queue_internal(text)','execute') OR has_function_privilege('authenticated','public.smart_announcer_get_queue_internal(text)','execute') THEN RAISE EXCEPTION 'unexpected grant'; END IF;
 PERFORM public.smart_announcer_get_queue_pin(t,CASE WHEN p='0000' THEN '0001' ELSE '0000' END);
 IF public.smart_announcer_poll_queue_pin(t,p)->>'status' <> 'ok' OR (SELECT pin_failures FROM public.smart_announcer_credentials WHERE token_hash=extensions.digest(t,'sha256')) <> 1 THEN RAISE EXCEPTION 'background refresh reset PIN failures'; END IF;
 UPDATE public.smart_announcer_credentials SET pin_failure_window_started_at=now()-interval '16 minutes' WHERE token_hash=extensions.digest(t,'sha256');
 output := public.smart_announcer_poll_queue_pin(t,p);
 IF output->>'status' <> 'ok' OR (SELECT pin_failures FROM public.smart_announcer_credentials WHERE token_hash=extensions.digest(t,'sha256')) <> 0 THEN RAISE EXCEPTION 'expired failure window was not cleared'; END IF;
 PERFORM public.smart_announcer_get_queue_pin(t,p);
 IF (SELECT count(*) FROM public.smart_announcer_team_candidates('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')) <> 2 THEN RAISE EXCEPTION 'candidate count'; END IF;
 UPDATE public.results SET rank=2 WHERE id='50000000-0000-0000-0000-000000000002';
 IF (SELECT count(*) FROM public.smart_announcer_team_candidates('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')) <> 1 THEN RAISE EXCEPTION 'nonwinner included'; END IF;
 UPDATE public.results SET rank=1, published=false WHERE id='50000000-0000-0000-0000-000000000002';
 IF (SELECT count(*) FROM public.smart_announcer_team_candidates('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')) <> 1 THEN RAISE EXCEPTION 'unpublished result included'; END IF;
 UPDATE public.results SET published=true WHERE id='50000000-0000-0000-0000-000000000002';
 UPDATE public.results SET public_visible=true WHERE id='50000000-0000-0000-0000-000000000002';
 IF (SELECT count(*) FROM public.smart_announcer_team_candidates('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')) <> 1 THEN RAISE EXCEPTION 'public result included'; END IF;
 UPDATE public.results SET public_visible=false WHERE id='50000000-0000-0000-0000-000000000002';
 INSERT INTO public.registrations(id,status) VALUES ('70000000-0000-0000-0000-000000000001','rejected');
 UPDATE public.results SET registration_id='70000000-0000-0000-0000-000000000001' WHERE id='50000000-0000-0000-0000-000000000002';
 IF (SELECT count(*) FROM public.smart_announcer_team_candidates('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')) <> 1 THEN RAISE EXCEPTION 'rejected entry included'; END IF;
 UPDATE public.registrations SET status='active' WHERE id='70000000-0000-0000-0000-000000000001';
 BEGIN PERFORM public.smart_announcer_replace_team_queue('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001', ARRAY['40000000-0000-0000-0000-000000000001'::uuid,'40000000-0000-0000-0000-000000000001'::uuid]); RAISE EXCEPTION 'duplicates accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.smart_announcer_replace_team_queue('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001', ARRAY['40000000-0000-0000-0000-000000000001'::uuid,'40000000-0000-0000-0000-000000000002'::uuid,'40000000-0000-0000-0000-000000000003'::uuid,'40000000-0000-0000-0000-000000000004'::uuid,'40000000-0000-0000-0000-000000000005'::uuid,'40000000-0000-0000-0000-000000000006'::uuid]); RAISE EXCEPTION 'more than five accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.smart_announcer_replace_team_queue('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001', ARRAY['40000000-0000-0000-0000-000000000001'::uuid]); RAISE EXCEPTION 'cross-tenant accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.smart_announcer_replace_team_queue('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002', ARRAY['40000000-0000-0000-0000-000000000001'::uuid]); RAISE EXCEPTION 'wrong team accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 INSERT INTO public.results(id,tenant_id,festival_id,item_id,published,result_status,public_visible,rank,points_awarded) VALUES ('50000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',true,'published',false,1,5);
 INSERT INTO public.result_team_awards VALUES ('50000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-000000000003');
 IF EXISTS (SELECT 1 FROM public.smart_announcer_team_candidates('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000003')) THEN RAISE EXCEPTION 'outside-tenant team included'; END IF;
 BEGIN PERFORM public.smart_announcer_replace_team_queue('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000003', ARRAY['40000000-0000-0000-0000-000000000002'::uuid]); RAISE EXCEPTION 'outside-tenant team accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 INSERT INTO public.results(id,tenant_id,festival_id,item_id,published,result_status,public_visible,rank,points_awarded) VALUES ('50000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',true,'published',false,1,5);
 INSERT INTO public.result_team_awards VALUES ('50000000-0000-0000-0000-000000000005','60000000-0000-0000-0000-000000000005');
 IF (SELECT count(*) FROM public.smart_announcer_team_candidates('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000005')) <> 1 THEN RAISE EXCEPTION 'valid child team omitted'; END IF;
 INSERT INTO public.results(id,tenant_id,festival_id,item_id,published,result_status,public_visible,rank,points_awarded) VALUES ('50000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',true,'published',false,1,5);
 INSERT INTO public.result_team_awards VALUES ('50000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000002');
 IF (SELECT count(*) FROM public.smart_announcer_team_candidates('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002')) <> 1 THEN RAISE EXCEPTION 'tied group winner omitted'; END IF;
 PERFORM public.smart_announcer_replace_team_queue('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001', ARRAY['40000000-0000-0000-0000-000000000001'::uuid]);
 PERFORM public.smart_announcer_get_queue_pin(t,CASE WHEN p='0000' THEN '0001' ELSE '0000' END);
 output := public.smart_announcer_mark_announced_pin(t,p,'40000000-0000-0000-0000-000000000001');
 IF output->>'status' <> 'ok' OR output IS DISTINCT FROM public.smart_announcer_mark_announced_pin(t,p,'40000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'announcement not idempotent'; END IF;
 IF (SELECT pin_failures FROM public.smart_announcer_credentials WHERE token_hash=extensions.digest(t,'sha256')) <> 1 THEN RAISE EXCEPTION 'announcement reset PIN failures'; END IF;
 PERFORM public.smart_announcer_get_queue_pin(t,p);
 BEGIN PERFORM public.smart_announcer_mark_announced_pin(t,p,'40000000-0000-0000-0000-000000000002'); RAISE EXCEPTION 'unqueued item accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.smart_announcer_replace_team_queue('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001', ARRAY['40000000-0000-0000-0000-000000000002'::uuid]);
 IF (SELECT count(*) FROM public.smart_announcer_queue WHERE announced_at IS NOT NULL) <> 1 OR (SELECT count(*) FROM public.smart_announcer_queue WHERE announced_at IS NULL) <> 1 THEN RAISE EXCEPTION 'queue history lost'; END IF;
 UPDATE public.results SET public_visible=true WHERE id='50000000-0000-0000-0000-000000000001';
 UPDATE public.results SET public_visible=false WHERE id='50000000-0000-0000-0000-000000000001';
 IF NOT EXISTS (SELECT 1 FROM public.smart_announcer_queue WHERE item_id='40000000-0000-0000-0000-000000000001' AND announced_at IS NOT NULL) THEN RAISE EXCEPTION 'hide removed announcement'; END IF;
 IF (SELECT count(*) FROM public.smart_announcer_get_queue((SELECT token FROM legacy_credentials))) <> 2 THEN RAISE EXCEPTION 'legacy link failed'; END IF;
 FOR i IN 1..5 LOOP output := public.smart_announcer_get_queue_pin(t,CASE WHEN i=1 THEN repeat('9',100) WHEN p='0000' THEN '0001' ELSE '0000' END); END LOOP;
 IF output->>'status' <> 'locked' OR public.smart_announcer_get_queue_pin(t,p)->>'status' <> 'locked' THEN RAISE EXCEPTION 'lockout failed'; END IF;
END $$;
DO $$ DECLARE t text; p text; BEGIN
 SELECT token,pin INTO t,p FROM test_credentials;
 IF (SELECT pin_failures FROM public.smart_announcer_credentials WHERE token_hash=extensions.digest(t,'sha256')) <> 5 THEN RAISE EXCEPTION 'attempts did not persist'; END IF;
 UPDATE public.smart_announcer_credentials SET pin_locked_until=now()-interval '1 second' WHERE token_hash=extensions.digest(t,'sha256');
 IF public.smart_announcer_get_queue_pin(t,p)->>'status' <> 'ok' THEN RAISE EXCEPTION 'PIN did not unlock'; END IF;
 UPDATE public.smart_announcer_credentials SET expires_at=now()-interval '1 second' WHERE token_hash=extensions.digest(t,'sha256');
 IF public.smart_announcer_get_queue_pin(t,p)->>'status' <> 'invalid' THEN RAISE EXCEPTION 'expired token accepted'; END IF;
 IF public.smart_announcer_access_mode(t) <> 'invalid' THEN RAISE EXCEPTION 'expired token reported valid'; END IF;
 UPDATE public.smart_announcer_credentials SET expires_at=now()+interval '1 hour' WHERE token_hash=extensions.digest(t,'sha256');
 PERFORM public.smart_announcer_revoke_tokens('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
 IF public.smart_announcer_get_queue_pin(t,p)->>'status' <> 'invalid' THEN RAISE EXCEPTION 'revoked token accepted'; END IF;
 IF (SELECT points_awarded FROM public.results WHERE id='50000000-0000-0000-0000-000000000001') <> 7 THEN RAISE EXCEPTION 'points changed'; END IF;
END $$;
DO $$ DECLARE t text; p text; BEGIN
 SELECT token,pin INTO t,p FROM test_credentials;
 UPDATE public.smart_announcer_credentials SET revoked_at=NULL, expires_at=now()+interval '1 hour' WHERE token_hash=extensions.digest(t,'sha256');
 PERFORM set_config('fixture.token',t,false); PERFORM set_config('fixture.pin',p,false);
END $$;
SET ROLE anon;
DO $$ BEGIN
 IF public.smart_announcer_get_queue_pin(current_setting('fixture.token'),current_setting('fixture.pin'))->>'status' <> 'ok' THEN RAISE EXCEPTION 'anonymous PIN access failed'; END IF;
 BEGIN PERFORM * FROM public.smart_announcer_get_queue(current_setting('fixture.token')); RAISE EXCEPTION 'anonymous PIN bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.smart_announcer_team_candidates('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')) <> 1 THEN RAISE EXCEPTION 'authenticated candidate access failed'; END IF;
 PERFORM public.smart_announcer_replace_team_queue('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001', ARRAY['40000000-0000-0000-0000-000000000002'::uuid]);
END $$;
RESET ROLE;
