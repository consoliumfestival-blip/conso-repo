SELECT set_config('request.jwt.claim.sub',md5('admin')::uuid::text,false);
DO $$
DECLARE s jsonb; again jsonb; d jsonb; result jsonb;
BEGIN
 s:=smart_announcer_session_admin(md5('tenant')::uuid,md5('festival')::uuid,'create');
 again:=smart_announcer_session_admin(md5('tenant')::uuid,md5('festival')::uuid,'create');
 IF s->>'token' IS DISTINCT FROM again->>'token' OR again ? 'pin' THEN RAISE EXCEPTION 'Session not reused'; END IF;
 IF NOT EXISTS(SELECT 1 FROM smart_announcer_credentials WHERE token_hash=extensions.digest(s->>'token','sha256') AND expires_at='infinity') THEN RAISE EXCEPTION 'Session expires'; END IF;
 d:=smart_announcer_device_login(s->>'token',s->>'pin');
 IF d->>'status'<>'ok' THEN RAISE EXCEPTION 'PIN login failed'; END IF;
 result:=smart_announcer_device_queue(s->>'token',d->>'device_token');
 IF result->>'status'<>'ok' OR result ? 'standings' THEN RAISE EXCEPTION 'Device access response'; END IF;
 IF smart_announcer_device_queue(s->>'token','invalid')->>'status'='ok' THEN RAISE EXCEPTION 'Device bypass'; END IF;
 PERFORM set_config('test.module','off',false);
 IF smart_announcer_device_queue(s->>'token',d->>'device_token')->>'status'='ok' THEN RAISE EXCEPTION 'Module bypass'; END IF;
 PERFORM set_config('test.module','on',false);
 IF smart_announcer_device_queue(s->>'token',d->>'device_token')->>'status'<>'ok' THEN RAISE EXCEPTION 'Module resume'; END IF;
 BEGIN
  PERFORM smart_announcer_session_admin(md5('foreign')::uuid,md5('festival')::uuid,'get');
  RAISE EXCEPTION 'Cross tenant session access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM smart_announcer_session_admin(md5('tenant')::uuid,md5('festival')::uuid,'close');
 IF smart_announcer_device_queue(s->>'token',d->>'device_token')->>'status'='ok' THEN RAISE EXCEPTION 'Closed access'; END IF;
 IF smart_announcer_device_login(s->>'token',s->>'pin')->>'status'='ok' THEN RAISE EXCEPTION 'Closed login'; END IF;
 IF has_table_privilege('anon','smart_announcer_sessions','SELECT') OR has_table_privilege('authenticated','smart_announcer_devices','SELECT') OR has_function_privilege('anon','smart_announcer_session_admin(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe grants'; END IF;
 INSERT INTO organisations(id,name,tenant_id) VALUES(md5('team')::uuid,'Team',md5('tenant')::uuid);
 INSERT INTO items(id,tenant_id,festival_id,item_name_en) VALUES(md5('item')::uuid,md5('tenant')::uuid,md5('festival')::uuid,'Test item');
 INSERT INTO registrations(id,organisation_id) VALUES(md5('reg')::uuid,md5('team')::uuid);
 INSERT INTO results(id,item_id,registration_id,festival_id,tenant_id,published,result_status,rank,points_awarded) VALUES(md5('result')::uuid,md5('item')::uuid,md5('reg')::uuid,md5('festival')::uuid,md5('tenant')::uuid,true,'published',1,5);
 s:=smart_announcer_session_admin(md5('tenant')::uuid,md5('festival')::uuid,'create');
 d:=smart_announcer_device_login(s->>'token',s->>'pin');
 PERFORM smart_announcer_send_batch(md5('tenant')::uuid,md5('festival')::uuid,md5('team')::uuid,ARRAY[md5('item')::uuid]);
 IF (SELECT count(*) FROM smart_announcer_batches)<>1 THEN RAISE EXCEPTION 'Missing audit'; END IF;
 BEGIN
  PERFORM smart_announcer_send_batch(md5('tenant')::uuid,md5('festival')::uuid,md5('team')::uuid,ARRAY[md5('item')::uuid]);
  RAISE EXCEPTION 'Pending batch replaced' USING ERRCODE='22023';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 result:=smart_announcer_device_queue(s->>'token',d->>'device_token',md5('item')::uuid);
 IF result->'items'->0->>'announced_at' IS NULL THEN RAISE EXCEPTION 'Announcement not saved'; END IF;
 INSERT INTO items(id,tenant_id,festival_id,item_name_en) VALUES(md5('item-next')::uuid,md5('tenant')::uuid,md5('festival')::uuid,'Next item');
 INSERT INTO registrations(id,organisation_id) VALUES(md5('reg-next')::uuid,md5('team')::uuid);
 INSERT INTO results(id,item_id,registration_id,festival_id,tenant_id,published,result_status,rank,points_awarded) VALUES(md5('result-next')::uuid,md5('item-next')::uuid,md5('reg-next')::uuid,md5('festival')::uuid,md5('tenant')::uuid,true,'published',2,3);
 PERFORM smart_announcer_send_batch(md5('tenant')::uuid,md5('festival')::uuid,md5('team')::uuid,ARRAY[md5('item-next')::uuid]);
 result:=smart_announcer_device_queue(s->>'token',d->>'device_token');
 IF jsonb_array_length(result->'items')<>2 OR (SELECT count(*) FROM smart_announcer_batches)<>2 THEN RAISE EXCEPTION 'Batch history lost'; END IF;
 BEGIN
  PERFORM smart_announcer_team_strategy(md5('tenant')::uuid,md5('festival')::uuid,md5('team')::uuid,ARRAY[md5('item')::uuid]);
  RAISE EXCEPTION 'Announced item replay' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF EXISTS(SELECT 1 FROM results WHERE public_visible IS TRUE) THEN RAISE EXCEPTION 'Public state mutated'; END IF;
END $$;
SELECT 'session checks passed';
