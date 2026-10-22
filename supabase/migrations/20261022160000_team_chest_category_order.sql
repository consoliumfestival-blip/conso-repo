-- Team chest numbers may optionally be grouped by one festival-wide category order.
-- Disabled by default: existing teams, numbers, and category-template behaviour remain unchanged.
ALTER TABLE public.festival_chest_number_controls
  ADD COLUMN category_order_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN category_order text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.get_festival_chest_order(p_festival_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.assert_festival_chest_admin(p_festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  SELECT pg_catalog.jsonb_build_object(
    'festival_id',f.id,'template',f.chest_number_template,'range',f.chest_number_category_range,
    'locked',COALESCE(c.locked,false),'revision',COALESCE(c.revision,0),
    'category_order_enabled',COALESCE(c.category_order_enabled,false),
    'categories',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code',codes.code,'name',COALESCE(fc.name,codes.code),'total',COALESCE(pc.total,0))
        ORDER BY pg_catalog.array_position(c.category_order,codes.code) NULLS LAST,fc.sort_order NULLS LAST,codes.code)
      FROM (
        SELECT pg_catalog.lower(pg_catalog.btrim(x.code)) AS code FROM public.festival_categories x
        WHERE x.festival_id=f.id AND pg_catalog.btrim(COALESCE(x.code,''))<>''
        UNION
        SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code)) FROM public.participants p
        WHERE p.festival_id=f.id AND pg_catalog.btrim(COALESCE(p.category_code,''))<>''
      ) codes
      LEFT JOIN LATERAL (
        SELECT x.name,x.sort_order FROM public.festival_categories x
        WHERE x.festival_id=f.id AND pg_catalog.lower(pg_catalog.btrim(x.code))=codes.code
        ORDER BY x.sort_order NULLS LAST,x.id LIMIT 1
      ) fc ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::integer AS total FROM public.participants p
        WHERE p.festival_id=f.id AND pg_catalog.lower(pg_catalog.btrim(p.category_code))=codes.code
      ) pc ON true
    ),'[]'::jsonb),
    'teams',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',r.id,'name',r.name,'archived_at',r.archived_at,
        'slot_number',r.slot_number,'total',r.total,'numeric',r.numeric)
        ORDER BY r.slot_number NULLS LAST,r.created_at,r.id)
      FROM (
        SELECT o.id,o.name,o.archived_at,o.created_at,s.slot_number,
          COALESCE(p.total,0) AS total,COALESCE(p.numeric,0) AS numeric
        FROM public.tenants t JOIN public.organisations o ON o.parent_id=t.organisation_id
        LEFT JOIN public.festival_team_chest_slots s ON s.festival_id=f.id AND s.organisation_id=o.id
        LEFT JOIN (
          SELECT p.organisation_id,count(*) AS total,
            count(*) FILTER (WHERE p.chest_number ~ '^[0-9]+$') AS numeric
          FROM public.participants p WHERE p.festival_id=p_festival_id GROUP BY p.organisation_id
        ) p ON p.organisation_id=o.id WHERE t.id=f.tenant_id
      ) r
    ),'[]'::jsonb)) INTO v_result
  FROM public.festival_calendar f
  LEFT JOIN public.festival_chest_number_controls c ON c.festival_id=f.id
  WHERE f.id=p_festival_id;
  RETURN v_result;
END $function$;

-- Preserve the existing two-phase, festival-wide unique-number swap and audit.
CREATE OR REPLACE FUNCTION public.regenerate_festival_chest_numbers_internal(p_festival_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(participant_count integer, category_range integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_tenant_id uuid; v_range integer; v_template text; v_category_order_enabled boolean;
  v_category_order text[]; v_invalid_count integer; v_oversized_key text;
  v_count integer; v_expected_count integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT tenant_id,chest_number_category_range,chest_number_template
    INTO v_tenant_id,v_range,v_template FROM public.festival_calendar WHERE id=p_festival_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Festival not found.'; END IF;
  SELECT COALESCE(c.category_order_enabled,false),COALESCE(c.category_order,'{}'::text[])
    INTO v_category_order_enabled,v_category_order
    FROM public.festival_chest_number_controls c WHERE c.festival_id=p_festival_id;
  v_category_order_enabled:=COALESCE(v_category_order_enabled,false);
  v_category_order:=COALESCE(v_category_order,'{}'::text[]);

  IF v_template='team' THEN
    PERFORM public.ensure_festival_team_chest_slots(p_festival_id);
    SELECT count(*) INTO v_invalid_count FROM public.participants p
    WHERE p.festival_id=p_festival_id AND NOT EXISTS (
      SELECT 1 FROM public.festival_team_chest_slots s
      WHERE s.festival_id=p_festival_id AND s.organisation_id=p.organisation_id);
    IF v_invalid_count>0 THEN
      RAISE EXCEPTION 'Cannot regenerate: % participant(s) are not assigned to a team under this festival organisation.',v_invalid_count;
    END IF;
    SELECT s.organisation_id::text INTO v_oversized_key
    FROM public.participants p JOIN public.festival_team_chest_slots s
      ON s.festival_id=p_festival_id AND s.organisation_id=p.organisation_id
    WHERE p.festival_id=p_festival_id GROUP BY s.organisation_id HAVING count(*)>v_range LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN RAISE EXCEPTION 'Team % exceeds the configured chest-number capacity (%).',v_oversized_key,v_range; END IF;
  ELSE
    SELECT count(*) INTO v_invalid_count FROM public.participants p
    WHERE p.festival_id=p_festival_id AND (p.category_code IS NULL OR pg_catalog.btrim(p.category_code)='');
    IF v_invalid_count>0 THEN RAISE EXCEPTION 'Cannot regenerate: % participant(s) do not have a category.',v_invalid_count; END IF;
    SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code)) INTO v_oversized_key
    FROM public.participants p WHERE p.festival_id=p_festival_id
    GROUP BY pg_catalog.lower(pg_catalog.btrim(p.category_code)) HAVING count(*)>v_range LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN RAISE EXCEPTION 'Category % exceeds the configured chest-number capacity (%).',v_oversized_key,v_range; END IF;
  END IF;

  DROP TABLE IF EXISTS pg_temp.chest_number_plan;
  CREATE TEMP TABLE chest_number_plan(participant_id uuid PRIMARY KEY,new_chest_number text NOT NULL UNIQUE) ON COMMIT DROP;
  IF v_template='team' THEN
    INSERT INTO pg_temp.chest_number_plan(participant_id,new_chest_number)
    SELECT p.id,((s.slot_number*v_range)+row_number() OVER (
      PARTITION BY p.organisation_id ORDER BY
        CASE WHEN v_category_order_enabled THEN
          pg_catalog.array_position(v_category_order,pg_catalog.lower(pg_catalog.btrim(p.category_code)))
        END NULLS LAST,
        CASE WHEN v_category_order_enabled THEN fc.sort_order END NULLS LAST,
        CASE WHEN v_category_order_enabled THEN pg_catalog.lower(pg_catalog.btrim(p.category_code)) END NULLS LAST,
        NULLIF(pg_catalog.regexp_replace(COALESCE(p.chest_number,''),'[^0-9]','','g'),'')::numeric NULLS LAST,
        pg_catalog.lower(p.name),p.id
    )-1)::text
    FROM public.participants p JOIN public.festival_team_chest_slots s
      ON s.festival_id=p_festival_id AND s.organisation_id=p.organisation_id
    LEFT JOIN LATERAL (
      SELECT min(x.sort_order) AS sort_order FROM public.festival_categories x
      WHERE x.festival_id=p_festival_id AND pg_catalog.lower(pg_catalog.btrim(x.code))=pg_catalog.lower(pg_catalog.btrim(p.category_code))
    ) fc ON true
    WHERE p.festival_id=p_festival_id;
  ELSE
    INSERT INTO pg_temp.chest_number_plan(participant_id,new_chest_number)
    WITH category_codes AS (
      SELECT pg_catalog.lower(pg_catalog.btrim(fc.code)) AS category_code FROM public.festival_categories fc
      WHERE fc.festival_id=p_festival_id AND pg_catalog.btrim(COALESCE(fc.code,''))<>''
      UNION SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code)) FROM public.participants p WHERE p.festival_id=p_festival_id
    ),category_order AS (
      SELECT codes.category_code,row_number() OVER (ORDER BY fc.sort_order NULLS LAST,codes.category_code) AS category_position
      FROM category_codes codes LEFT JOIN LATERAL (
        SELECT min(fc.sort_order) AS sort_order FROM public.festival_categories fc
        WHERE fc.festival_id=p_festival_id AND pg_catalog.lower(pg_catalog.btrim(fc.code))=codes.category_code
      ) fc ON true
    )
    SELECT p.id,((co.category_position*v_range)+row_number() OVER (
      PARTITION BY pg_catalog.lower(pg_catalog.btrim(p.category_code)) ORDER BY
        NULLIF(pg_catalog.regexp_replace(COALESCE(p.chest_number,''),'[^0-9]','','g'),'')::numeric NULLS LAST,
        pg_catalog.lower(p.name),p.id
    )-1)::text
    FROM public.participants p JOIN category_order co
      ON co.category_code=pg_catalog.lower(pg_catalog.btrim(p.category_code)) WHERE p.festival_id=p_festival_id;
  END IF;
  SELECT count(*) INTO v_expected_count FROM public.participants p WHERE p.festival_id=p_festival_id;
  SELECT count(*) INTO v_count FROM pg_temp.chest_number_plan;
  IF v_count IS DISTINCT FROM v_expected_count THEN
    RAISE EXCEPTION 'Cannot regenerate: the numbering plan does not cover every participant (% of %).',v_count,v_expected_count;
  END IF;
  UPDATE public.participants p SET chest_number='__regen__'||p.id::text WHERE p.festival_id=p_festival_id;
  UPDATE public.participants p SET chest_number=plan.new_chest_number FROM pg_temp.chest_number_plan plan WHERE p.id=plan.participant_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count IS DISTINCT FROM v_expected_count THEN RAISE EXCEPTION 'Cannot regenerate: only % of % participants were updated.',v_count,v_expected_count; END IF;
  INSERT INTO public.chest_number_regeneration_audits(tenant_id,festival_id,category_range,participant_count,regenerated_by,chest_number_template)
  VALUES(v_tenant_id,p_festival_id,v_range,v_count,p_actor_id,v_template);
  RETURN QUERY SELECT v_count,v_range;
END $function$;

-- New endpoint saves both orders together; the old team-only endpoint stays callable.
CREATE FUNCTION public.save_festival_chest_order_with_categories(
  p_festival_id uuid,p_team_ids uuid[],p_expected_team_ids uuid[],p_expected_revision integer,p_expected_range integer,
  p_expected_category_codes text[],p_category_codes text[],p_category_order_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_state jsonb; v_current text[];
BEGIN
  PERFORM public.assert_festival_chest_admin(p_festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  v_state:=public.get_festival_chest_order(p_festival_id);
  IF v_state->>'template'<>'team' OR (v_state->>'locked')::boolean THEN
    RAISE EXCEPTION 'Unlock team chest numbers before changing their order.' USING ERRCODE='55000';
  END IF;
  SELECT COALESCE(array_agg(e.value->>'code' ORDER BY e.ordinality),'{}'::text[])
    INTO v_current FROM pg_catalog.jsonb_array_elements(v_state->'categories') WITH ORDINALITY AS e(value,ordinality);
  IF (v_state->>'revision')::integer IS DISTINCT FROM p_expected_revision OR
    (v_state->>'range')::integer IS DISTINCT FROM p_expected_range OR
    v_current IS DISTINCT FROM p_expected_category_codes THEN
    RAISE EXCEPTION 'Chest-number settings or categories changed. Reload before saving.' USING ERRCODE='40001';
  END IF;
  IF p_category_order_enabled IS NULL OR p_category_codes IS NULL OR
     pg_catalog.cardinality(p_category_codes)<>pg_catalog.cardinality(v_current) OR
     (SELECT count(DISTINCT x.code) FROM pg_catalog.unnest(p_category_codes) AS x(code))<>pg_catalog.cardinality(v_current) OR
     EXISTS(SELECT 1 FROM pg_catalog.unnest(p_category_codes) AS x(code) WHERE x.code IS NULL OR NOT x.code=ANY(v_current)) THEN
    RAISE EXCEPTION 'Include every festival category exactly once.';
  END IF;
  INSERT INTO public.festival_chest_number_controls(festival_id,category_order_enabled,category_order,updated_by)
  VALUES(p_festival_id,p_category_order_enabled,p_category_codes,auth.uid())
  ON CONFLICT(festival_id) DO UPDATE SET
    category_order_enabled=EXCLUDED.category_order_enabled,category_order=EXCLUDED.category_order,
    updated_by=auth.uid(),updated_at=now();
  RETURN public.save_festival_chest_order(p_festival_id,p_team_ids,p_expected_team_ids,p_expected_revision,p_expected_range);
END $function$;
REVOKE ALL ON FUNCTION public.save_festival_chest_order_with_categories(uuid,uuid[],uuid[],integer,integer,text[],text[],boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_festival_chest_order_with_categories(uuid,uuid[],uuid[],integer,integer,text[],text[],boolean) TO authenticated,service_role;

-- Direct creates and category/team edits must continue to honour the saved order.
CREATE FUNCTION public.renumber_team_chest_categories_after_participant_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_festival uuid; v_locked boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    FOR v_festival IN SELECT DISTINCT r.festival_id FROM inserted_rows r WHERE r.festival_id IS NOT NULL ORDER BY r.festival_id LOOP
      SELECT c.locked INTO v_locked
      FROM public.festival_calendar f JOIN public.festival_chest_number_controls c ON c.festival_id=f.id
      WHERE f.id=v_festival AND f.chest_number_template='team' AND c.category_order_enabled;
      IF FOUND THEN
        IF v_locked THEN
          RAISE EXCEPTION 'Unlock chest numbers with the tenant ID before adding or changing participants.' USING ERRCODE='55000';
        END IF;
        PERFORM public.regenerate_festival_chest_numbers_internal(v_festival,auth.uid());
      END IF;
    END LOOP;
  ELSE
    FOR v_festival IN
      SELECT DISTINCT n.festival_id FROM updated_rows n JOIN old_rows o ON o.id=n.id
      WHERE n.festival_id IS NOT NULL AND
        (n.category_code IS DISTINCT FROM o.category_code OR n.organisation_id IS DISTINCT FROM o.organisation_id)
      ORDER BY n.festival_id
    LOOP
      SELECT c.locked INTO v_locked
      FROM public.festival_calendar f JOIN public.festival_chest_number_controls c ON c.festival_id=f.id
      WHERE f.id=v_festival AND f.chest_number_template='team' AND c.category_order_enabled;
      IF FOUND THEN
        IF v_locked THEN
          RAISE EXCEPTION 'Unlock chest numbers with the tenant ID before adding or changing participants.' USING ERRCODE='55000';
        END IF;
        PERFORM public.regenerate_festival_chest_numbers_internal(v_festival,auth.uid());
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.renumber_team_chest_categories_after_participant_change() FROM PUBLIC;
CREATE TRIGGER renumber_team_chest_categories_after_insert
AFTER INSERT ON public.participants REFERENCING NEW TABLE AS inserted_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.renumber_team_chest_categories_after_participant_change();
CREATE TRIGGER renumber_team_chest_categories_after_update
AFTER UPDATE ON public.participants REFERENCING OLD TABLE AS old_rows NEW TABLE AS updated_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.renumber_team_chest_categories_after_participant_change();

-- INSERT RETURNING observes the pre-AFTER-trigger tuple. Re-read the final
-- number so participant creation returns the number actually stored.
CREATE OR REPLACE FUNCTION public.create_participant_with_chest_number(
  p_tenant_id uuid,p_festival_id uuid,p_organisation_id uuid,p_name text,p_category_code text,
  p_status text,p_age integer,p_class_std text,p_dob date,p_gender text,
  p_public_profile_enabled boolean,p_show_organisation_public boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_actor public.profiles%ROWTYPE; v_festival_tenant uuid; v_organisation_tenant uuid;
  v_template text; v_range integer; v_position integer; v_ordinal integer;
  v_candidate text; v_constraint_name text; v_participant public.participants%ROWTYPE;
BEGIN
  IF p_festival_id IS NULL OR p_category_code IS NULL OR pg_catalog.btrim(p_category_code)='' THEN
    RAISE EXCEPTION 'Festival and category are required to create a participant.';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  SELECT tenant_id,chest_number_category_range,chest_number_template
    INTO v_festival_tenant,v_range,v_template FROM public.festival_calendar WHERE id=p_festival_id;
  IF NOT FOUND OR v_actor.id IS NULL THEN RAISE EXCEPTION 'Festival not found or authentication is required.'; END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND
     (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'Only the owning tenant admin can create participants.';
  END IF;
  SELECT tenant_id INTO v_organisation_tenant FROM public.organisations WHERE id=p_organisation_id;
  IF NOT FOUND OR v_organisation_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'Participant organisation does not match its tenant.';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND NOT public.is_org_visible(p_organisation_id) THEN
    RAISE EXCEPTION 'You cannot create participants in this organisation.';
  END IF;
  IF v_template='team' THEN
    v_position:=public.festival_team_chest_slot(p_festival_id,p_organisation_id);
  ELSE
    WITH category_codes AS (
      SELECT pg_catalog.lower(pg_catalog.btrim(fc.code)) AS category_code FROM public.festival_categories fc
      WHERE fc.festival_id=p_festival_id AND pg_catalog.btrim(COALESCE(fc.code,''))<>''
      UNION SELECT DISTINCT pg_catalog.lower(pg_catalog.btrim(p.category_code)) FROM public.participants p
      WHERE p.festival_id=p_festival_id AND pg_catalog.btrim(COALESCE(p.category_code,''))<>''
      UNION SELECT pg_catalog.lower(pg_catalog.btrim(p_category_code))
    ),ordered_categories AS (
      SELECT codes.category_code,row_number() OVER (ORDER BY fc.sort_order NULLS LAST,codes.category_code) AS position
      FROM category_codes codes LEFT JOIN LATERAL (
        SELECT min(fc.sort_order) AS sort_order FROM public.festival_categories fc
        WHERE fc.festival_id=p_festival_id AND pg_catalog.lower(pg_catalog.btrim(fc.code))=codes.category_code
      ) fc ON true
    )
    SELECT position INTO v_position FROM ordered_categories
    WHERE category_code=pg_catalog.lower(pg_catalog.btrim(p_category_code));
    IF v_position IS NULL THEN RAISE EXCEPTION 'Unable to resolve the participant category position.'; END IF;
  END IF;
  FOR v_ordinal IN 1..v_range LOOP
    v_candidate:=((v_position*v_range)+v_ordinal-1)::text;
    BEGIN
      INSERT INTO public.participants(
        tenant_id,festival_id,organisation_id,name,category_code,chest_number,
        status,age,class_std,dob,gender,public_profile_enabled,show_organisation_public
      ) VALUES (
        p_tenant_id,p_festival_id,p_organisation_id,p_name,p_category_code,v_candidate,
        p_status,p_age,NULLIF(pg_catalog.btrim(p_class_std),'')::integer,p_dob,p_gender,
        p_public_profile_enabled,p_show_organisation_public
      ) RETURNING * INTO v_participant;
      SELECT * INTO v_participant FROM public.participants WHERE id=v_participant.id;
      RETURN pg_catalog.to_jsonb(v_participant);
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name=CONSTRAINT_NAME;
      IF v_constraint_name IS DISTINCT FROM 'unique_active_chest_number' THEN RAISE; END IF;
    END;
  END LOOP;
  IF v_template='team' THEN RAISE EXCEPTION 'Team chest-number capacity (%) reached.',v_range; END IF;
  RAISE EXCEPTION 'Category capacity (%) reached. Change the festival range to Under 1000.',v_range;
END $function$;
