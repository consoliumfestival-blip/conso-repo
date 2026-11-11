-- Run only against a disposable database with the queue migration applied.
BEGIN;
INSERT INTO auth.users VALUES ('10000000-0000-0000-0000-000000000001');
INSERT INTO public.tenants(id) VALUES ('20000000-0000-0000-0000-000000000001'), ('20000000-0000-0000-0000-000000000002');
INSERT INTO public.profiles(id,tenant_id,role,is_superadmin) VALUES ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','tenant_admin',false);
INSERT INTO public.festival_calendar VALUES ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'), ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002');
INSERT INTO public.items(id,tenant_id,festival_id,item_name_en) VALUES ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Fixture');
INSERT INTO public.results VALUES ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',true,'published');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE token_value text; first_time timestamptz; second_time timestamptz;
BEGIN
  IF has_table_privilege('anon','public.smart_announcer_credentials','SELECT') OR
     has_table_privilege('authenticated','public.smart_announcer_credentials','SELECT') OR
     has_table_privilege('anon','public.smart_announcer_queue','SELECT') OR
     has_function_privilege('anon','public.smart_announcer_issue_token(uuid,uuid)','EXECUTE') OR
     has_function_privilege('anon','public.smart_announcer_save_queue(uuid,uuid,uuid[])','EXECUTE') OR
     NOT has_function_privilege('anon','public.smart_announcer_get_queue(text)','EXECUTE') THEN
    RAISE EXCEPTION 'unexpected queue or credential grants';
  END IF;
  BEGIN
    PERFORM public.smart_announcer_issue_token('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'cross-tenant token issuance accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM * FROM public.get_admin_published_results('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'cross-tenant result access accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM public.get_admin_published_results('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')) <> 1 THEN
    RAISE EXCEPTION 'authorised admin result read failed';
  END IF;
  SELECT token INTO token_value FROM public.smart_announcer_issue_token('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
  IF length(token_value) <> 64 THEN RAISE EXCEPTION 'invalid token length'; END IF;
  PERFORM public.smart_announcer_save_queue('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001', ARRAY['40000000-0000-0000-0000-000000000001'::uuid]);
  IF (SELECT count(*) FROM public.smart_announcer_get_queue(token_value)) <> 1 THEN RAISE EXCEPTION 'queue missing'; END IF;
  first_time := public.smart_announcer_mark_announced(token_value,'40000000-0000-0000-0000-000000000001');
  second_time := public.smart_announcer_mark_announced(token_value,'40000000-0000-0000-0000-000000000001');
  IF first_time IS DISTINCT FROM second_time THEN RAISE EXCEPTION 'announcement is not idempotent'; END IF;
  BEGIN
    PERFORM public.smart_announcer_mark_announced(token_value,'40000000-0000-0000-0000-000000000099');
    RAISE EXCEPTION 'unqueued item accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.smart_announcer_save_queue('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001', ARRAY[]::uuid[]);
  IF (SELECT count(*) FROM public.smart_announcer_get_queue(token_value)) <> 1 THEN RAISE EXCEPTION 'announced item lost'; END IF;
  UPDATE public.smart_announcer_credentials SET expires_at = now() - interval '1 second' WHERE token_hash = extensions.digest(token_value,'sha256');
  BEGIN
    PERFORM * FROM public.smart_announcer_get_queue(token_value);
    RAISE EXCEPTION 'expired token accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.smart_announcer_credentials SET expires_at = now() + interval '1 hour' WHERE token_hash = extensions.digest(token_value,'sha256');
  PERFORM public.smart_announcer_revoke_tokens('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
  BEGIN
    PERFORM * FROM public.smart_announcer_get_queue(token_value);
    RAISE EXCEPTION 'revoked token accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM public.results WHERE id = '50000000-0000-0000-0000-000000000001' AND published AND result_status = 'published') THEN RAISE EXCEPTION 'result modified'; END IF;
END $$;
DO $$
DECLARE
  tenant uuid := '20000000-0000-0000-0000-000000000001';
  festival uuid := '30000000-0000-0000-0000-000000000001';
  item uuid := '40000000-0000-0000-0000-000000000001';
  other_item uuid := '40000000-0000-0000-0000-000000000002';
  team_a uuid := '60000000-0000-0000-0000-000000000001';
  team_b uuid := '60000000-0000-0000-0000-000000000002';
  result_a uuid := '50000000-0000-0000-0000-000000000001';
  result_b uuid := '50000000-0000-0000-0000-000000000002';
  result_c uuid := '50000000-0000-0000-0000-000000000003';
  expected jsonb;
  actual jsonb;
  payload jsonb;
  ranking text;
BEGIN
  INSERT INTO public.organisations (id, name, org_type, tenant_id)
  VALUES (team_a, 'Team A', 'unit', tenant), (team_b, 'Team B', 'unit', tenant);
  INSERT INTO public.festival_teams (festival_id, organisation_id) VALUES (festival, team_a), (festival, team_b);
  INSERT INTO public.items (id, tenant_id, festival_id, item_name_en) VALUES (other_item, tenant, festival, 'Earlier item');
  UPDATE public.results SET points_awarded = 7, rank = 1, public_visible = true,
    published_at = statement_timestamp() - interval '1 hour' WHERE id = result_a;
  INSERT INTO public.results (id, tenant_id, festival_id, item_id, published, result_status, points_awarded, rank, public_visible, published_at)
  VALUES (result_b, tenant, festival, item, true, 'published', 2, 2, false, NULL),
         (result_c, tenant, festival, other_item, true, 'published', 2, 1, true, statement_timestamp() - interval '2 hours');
  INSERT INTO public.result_team_awards (result_id, organisation_id)
  VALUES (result_a, team_a), (result_b, team_b), (result_c, team_b);
  INSERT INTO public.festival_leaderboard_settings (festival_id, ranking_mode, item_limit, is_public_visible) VALUES (festival, 'ALL', 1, true);
  INSERT INTO public.points_config (festival_id, enable_grace_marks, config_version) VALUES (festival, true, 1);
  INSERT INTO public.grace_marks (festival_id, tenant_id, org_id, points, submission_id) VALUES (festival, tenant, team_b, 3, gen_random_uuid());

  FOREACH ranking IN ARRAY ARRAY['ALL', 'LIMITED'] LOOP
    UPDATE public.festival_leaderboard_settings SET ranking_mode = ranking WHERE festival_id = festival;
    payload := public.smart_announcer_recommendations(tenant, festival);
    IF jsonb_array_length(payload->'items') <> 1 OR
       (payload->'items'->0->'points'->>team_a::text)::int IS DISTINCT FROM 7 OR
       (payload->'items'->0->'points'->>team_b::text)::int IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'incorrect recommendation or awarded item points: %', payload;
    END IF;
    IF ranking = 'ALL' AND (payload->'items'->0->'standings'->0->>'organisation_id')::uuid IS DISTINCT FROM team_b THEN
      RAISE EXCEPTION 'expected Team B to lead after the points tie break';
    END IF;
    SELECT jsonb_agg(to_jsonb(row) ORDER BY row.organisation_id) INTO expected
    FROM public.smart_announcer_project_leaderboard(tenant, festival, item) row;
    BEGIN
      -- Simulate the existing bulk Publish payload on disposable rows only.
      UPDATE public.results SET public_visible = true, published_at = statement_timestamp()
      WHERE festival_id = festival AND item_id = item;
      SELECT jsonb_agg(to_jsonb(row) ORDER BY row.organisation_id) INTO actual
      FROM public.get_public_leaderboard_unmasked(tenant, festival) row;
      IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'projection differs from public leaderboard in % mode', ranking; END IF;
      UPDATE public.results SET public_visible = false WHERE festival_id = festival AND item_id = item;
      IF NOT EXISTS (SELECT 1 FROM public.smart_announcer_queue q WHERE q.item_id = item AND q.announced_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Hide changed announcement status';
      END IF;
      RAISE SQLSTATE 'P7701';
    EXCEPTION WHEN SQLSTATE 'P7701' THEN NULL;
    END;
    IF NOT EXISTS (SELECT 1 FROM public.results WHERE id = result_b AND points_awarded = 2 AND public_visible IS FALSE) THEN
      RAISE EXCEPTION 'projection modified results';
    END IF;
  END LOOP;
END $$;
ROLLBACK;
