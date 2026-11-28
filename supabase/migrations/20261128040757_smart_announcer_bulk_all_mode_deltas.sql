BEGIN;
DO $migration$
DECLARE definition text; bulk_sql text;
BEGIN
  SELECT pg_get_functiondef('public.smart_announcer_team_strategy_v2(uuid,uuid,uuid,integer,text,text,uuid[])'::regprocedure)
    INTO definition;
  bulk_sql := $bulk$
  IF coalesce(v_settings_mode, 'ALL') = 'ALL' THEN
    -- The public baseline already includes grace marks. In ALL mode each
    -- unpublished item's delta is additive; dedupe and attribute once in bulk.
    WITH deduped AS (
      SELECT DISTINCT ON (coalesce(r.registration_id,r.id),r.item_id)
        r.id,r.item_id,r.registration_id,r.points_awarded,r.rank,r.grade
      FROM public.results r
      LEFT JOIN public.registrations reg ON reg.id=r.registration_id
      WHERE r.festival_id=p_festival_id AND r.item_id=ANY(v_candidates)
        AND r.published IS TRUE AND r.result_status='published'
        AND reg.status IS DISTINCT FROM 'rejected'
      -- Canonical projection gives every result of an unpublished item the
      -- same publication timestamp, so duplicate resolution uses result ID.
      ORDER BY coalesce(r.registration_id,r.id),r.item_id,r.id DESC
    ), teams AS (
      SELECT r.item_id,o.id AS organisation_id,max(o.name) AS organisation_name,
        coalesce(sum(r.points_awarded),0)::bigint AS total_points,
        count(*) FILTER(WHERE r.rank=1) AS first_place_count,
        count(*) FILTER(WHERE r.rank=2) AS second_place_count,
        count(*) FILTER(WHERE r.rank=3) AS third_place_count,
        count(*) FILTER(WHERE r.grade='A+') AS grade_a_plus_count,
        count(*) FILTER(WHERE r.grade='A') AS grade_a_count,
        count(*) FILTER(WHERE r.grade='B') AS grade_b_count,
        count(*) FILTER(WHERE r.grade='C') AS grade_c_count,count(*) AS result_count
      FROM deduped r
      LEFT JOIN public.result_team_awards award ON award.result_id=r.id
      LEFT JOIN public.registrations reg ON reg.id=r.registration_id
      LEFT JOIN public.participants participant ON participant.id=reg.participant_id
      JOIN public.organisations o ON o.id=coalesce(award.organisation_id,reg.organisation_id,participant.organisation_id)
      WHERE o.tenant_id=p_tenant_id OR o.parent_id IN
        (SELECT id FROM public.organisations WHERE tenant_id=p_tenant_id)
        OR o.tenant_id IN (SELECT parent.tenant_id FROM public.organisations parent
          WHERE parent.id=o.parent_id AND parent.tenant_id=p_tenant_id)
      GROUP BY r.item_id,o.id
    ), effects AS (
      SELECT item_id,jsonb_agg(to_jsonb(teams)-'item_id' ORDER BY organisation_id) AS deltas
      FROM teams GROUP BY item_id
    )
    SELECT coalesce(jsonb_object_agg(item_id::text,deltas),'{}'::jsonb) INTO v_effects FROM effects;
  ELSE
  FOREACH v_candidate IN ARRAY v_candidates LOOP
  $bulk$;
  IF position('FOREACH v_candidate IN ARRAY v_candidates LOOP' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected planner definition';
  END IF;
  definition:=replace(definition,'FOREACH v_candidate IN ARRAY v_candidates LOOP',bulk_sql);
  definition:=replace(definition,E'  v_states := ARRAY[jsonb_build_object(',E'  END IF;\n  v_states := ARRAY[jsonb_build_object(');
  EXECUTE definition;
END $migration$;
NOTIFY pgrst, 'reload schema';
COMMIT;
