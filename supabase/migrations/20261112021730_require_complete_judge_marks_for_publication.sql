-- Keep the schedule's configured judge count consistent across readiness,
-- previews, and publication. Explicit zero marks are valid final entries;
-- a missing required judge entry is never synthesized.
BEGIN;

CREATE OR REPLACE FUNCTION scoring_private.prepare_results(
  p_schedule uuid,
  p_expected_version integer,
  p_entries jsonb,
  p_mode text,
  p_bracket text,
  p_size integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public, scoring_private
AS $$
DECLARE
  s public.schedules;
  item public.items;
  c public.points_config;
  reg public.registrations;
  entry jsonb;
  input jsonb;
  inputs jsonb := '[]';
  scores jsonb := '{}';
  pct numeric;
  raw numeric;
  maximum numeric;
  total numeric;
  count_entries integer;
  expected_judges integer;
  assigned_judges integer;
  judge_slot integer;
  judge_slots integer[];
  has_slot_metadata boolean;
  has_legacy_slot_data boolean;
  teams integer;
  size integer;
  grade text;
  placement integer;
  row record;
  calc jsonb;
BEGIN
  SELECT * INTO s
  FROM public.schedules
  WHERE id = p_schedule
  FOR SHARE;

  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Schedule was not found.';
  END IF;

  PERFORM scoring_private.assert_admin(s.tenant_id);

  SELECT * INTO c
  FROM public.points_config
  WHERE festival_id = s.festival_id AND tenant_id = s.tenant_id
  FOR SHARE;

  IF c.id IS NULL THEN
    RAISE EXCEPTION 'Configure points before publishing results.';
  END IF;
  IF c.config_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Configuration changed. Refresh the preview.' USING ERRCODE = '40001';
  END IF;
  PERFORM scoring_private.validate_config(to_jsonb(c));

  SELECT * INTO item
  FROM public.items
  WHERE id = s.item_id AND festival_id = s.festival_id AND tenant_id = s.tenant_id;

  IF item.id IS NULL OR cardinality(item.category_codes) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Resolve this competition to one owned item/category before publishing.';
  END IF;
  IF p_mode NOT IN ('judges', 'manual') OR p_mode IS NULL OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid results entry mode.';
  END IF;

  expected_judges := COALESCE(s.expected_judge_count, 3);
  IF p_mode = 'judges' THEN
    -- Hold assignment rows stable while validating and reading the final marks.
    PERFORM 1
    FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = s.id AND a.tenant_id = s.tenant_id AND a.status = 'active'
    ORDER BY a.judge_id
    FOR SHARE;

    SELECT count(DISTINCT a.judge_id)::integer INTO assigned_judges
    FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = s.id AND a.tenant_id = s.tenant_id AND a.status = 'active';

    IF assigned_judges IS DISTINCT FROM expected_judges THEN
      RAISE EXCEPTION 'This schedule requires % active judge assignments; found %.', expected_judges, assigned_judges;
    END IF;
  END IF;

  SELECT count(*) INTO teams FROM scoring_private.eligible(s);
  IF teams = 0 OR jsonb_array_length(p_entries) <> teams OR
     (SELECT count(DISTINCT value ->> 'registration_id') FROM jsonb_array_elements(p_entries)) <> teams THEN
    RAISE EXCEPTION 'Every eligible registration must be included exactly once.';
  END IF;

  SELECT greatest(1, COALESCE(max(
    CASE WHEN jsonb_typeof(r.raw_group_members) = 'array' AND jsonb_array_length(r.raw_group_members) > 0
      THEN jsonb_array_length(r.raw_group_members)
      ELSE 1 + (SELECT count(*) FROM public.group_members g WHERE g.registration_id = r.id)
    END
  ), 1))::integer INTO size
  FROM scoring_private.eligible(s) r;

  IF item.participation_type <> 'group' THEN
    size := 1;
  ELSIF item.source = 'custom' AND item.group_min_members > 0 AND item.group_min_members = item.group_max_members THEN
    size := item.group_min_members;
  END IF;

  IF p_size IS NOT NULL THEN
    IF NOT c.member_brackets_enabled THEN
      RAISE EXCEPTION 'Member-based scoring is disabled for this festival.';
    END IF;
    IF item.source = 'custom' AND item.participation_type = 'group'
       AND item.group_min_members > 0 AND item.group_min_members = item.group_max_members THEN
      RAISE EXCEPTION 'This competition already has a configured group size.';
    END IF;
    IF NOT (item.category_codes && ARRAY['GN', 'GENERAL']) OR p_size < 1 THEN
      RAISE EXCEPTION 'Only a General competition permits a manual group-size override.';
    END IF;
    size := p_size;
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    SELECT * INTO reg
    FROM scoring_private.eligible(s)
    WHERE id = (entry ->> 'registration_id')::uuid;

    IF reg.id IS NULL THEN
      RAISE EXCEPTION 'Registration is outside this event or is ineligible.';
    END IF;

    pct := 0;
    raw := 0;
    count_entries := 0;
    inputs := '[]';

    IF p_mode = 'manual' THEN
      IF jsonb_typeof(entry -> 'raw_marks') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Enter one mark for each of the % required judge slots for registration %.',
          expected_judges, reg.code_letter;
      END IF;
      IF jsonb_array_length(entry -> 'raw_marks') <> expected_judges THEN
        RAISE EXCEPTION 'Enter one mark for each of the % required judge slots for registration %.',
          expected_judges, reg.code_letter;
      END IF;

      judge_slots := ARRAY[]::integer[];
      has_slot_metadata := false;
      has_legacy_slot_data := false;
      FOR input IN SELECT value FROM jsonb_array_elements(entry -> 'raw_marks') LOOP
        IF input ? 'judge_slot' THEN
          has_slot_metadata := true;
          IF jsonb_typeof(input -> 'judge_slot') IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'Invalid judge slot for registration %.', reg.code_letter;
          END IF;
          IF (input ->> 'judge_slot')::numeric <> trunc((input ->> 'judge_slot')::numeric) THEN
            RAISE EXCEPTION 'Judge slot must be a whole number for registration %.', reg.code_letter;
          END IF;
          judge_slot := (input ->> 'judge_slot')::integer;
          IF judge_slot < 1 OR judge_slot > expected_judges OR judge_slot = ANY(judge_slots) THEN
            RAISE EXCEPTION 'Judge slots must be unique and cover 1 through % for registration %.',
              expected_judges, reg.code_letter;
          END IF;
          judge_slots := array_append(judge_slots, judge_slot);
        ELSE
          has_legacy_slot_data := true;
        END IF;

        IF jsonb_typeof(input -> 'total') IS DISTINCT FROM 'number'
           OR jsonb_typeof(input -> 'maximum') IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION 'Invalid raw marks.';
        END IF;
        total := (input ->> 'total')::numeric;
        maximum := (input ->> 'maximum')::numeric;
        IF maximum <= 0 OR total < 0 OR total > maximum THEN
          RAISE EXCEPTION 'Marks must be within their recorded maximum.';
        END IF;
        pct := pct + total / maximum * 100;
        raw := raw + total;
        count_entries := count_entries + 1;
        -- Keep the published results' historical inputs shape unchanged.
        inputs := inputs || jsonb_build_array(input - 'judge_slot');
      END LOOP;
      IF has_slot_metadata AND has_legacy_slot_data THEN
        RAISE EXCEPTION 'Judge slot data must be provided for every mark or for none.';
      END IF;
      IF has_slot_metadata AND cardinality(judge_slots) <> expected_judges THEN
        RAISE EXCEPTION 'Judge slots must cover 1 through % for registration %.',
          expected_judges, reg.code_letter;
      END IF;
    ELSE
      FOR row IN
        SELECT m.*
        FROM public.mark_entries m
        WHERE m.schedule_id = s.id
          AND m.registration_id = reg.id
          AND m.tenant_id = s.tenant_id
          AND m.is_final IS TRUE
          AND EXISTS (
            SELECT 1 FROM public.schedule_judge_assignments a
            WHERE a.schedule_id = s.id
              AND a.judge_id = m.judge_id
              AND a.tenant_id = s.tenant_id
              AND a.status = 'active'
          )
        ORDER BY m.judge_id
        FOR SHARE OF m
      LOOP
        IF row.total_mark IS NULL OR row.max_mark_snapshot IS NULL OR row.max_mark_snapshot <= 0
           OR row.total_mark < 0 OR row.total_mark > row.max_mark_snapshot THEN
          RAISE EXCEPTION 'A final mark has no valid maximum snapshot. An administrator must review it.';
        END IF;
        pct := pct + row.total_mark / row.max_mark_snapshot * 100;
        raw := raw + row.total_mark;
        count_entries := count_entries + 1;
        inputs := inputs || jsonb_build_array(jsonb_build_object(
          'mark_id', row.id,
          'total', row.total_mark,
          'maximum', row.max_mark_snapshot
        ));
      END LOOP;

      IF count_entries <> expected_judges THEN
        RAISE EXCEPTION 'Registration % has final marks from % of % required judges.',
          reg.code_letter, count_entries, expected_judges;
      END IF;
    END IF;

    IF count_entries = 0 THEN
      RAISE EXCEPTION 'No final marks exist for an eligible registration.';
    END IF;

    pct := pct / count_entries;
    raw := round(raw / count_entries, 2);
    SELECT key INTO grade
    FROM jsonb_each(c.grade_thresholds)
    WHERE pct >= value::text::numeric
    ORDER BY value::text::numeric DESC
    LIMIT 1;
    grade := CASE grade WHEN 'a_plus' THEN 'A+' WHEN 'a' THEN 'A' WHEN 'b' THEN 'B' WHEN 'c' THEN 'C' ELSE NULL END;
    scores := scores || jsonb_build_object(reg.id::text, jsonb_build_object(
      'percentage', pct, 'total_score', raw, 'grade', grade, 'inputs', inputs
    ));
  END LOOP;

  FOR row IN
    SELECT key, value, rank() OVER (ORDER BY (value ->> 'percentage')::numeric DESC)::integer AS position
    FROM jsonb_each(scores)
  LOOP
    placement := CASE WHEN (row.value ->> 'percentage')::numeric > 0 AND row.position <= 5 THEN row.position ELSE NULL END;
    calc := scoring_private.award(to_jsonb(c), item.id, row.value ->> 'grade', placement, size, teams, item.participation_type = 'group', p_bracket);
    scores := jsonb_set(scores, ARRAY[row.key], row.value || jsonb_build_object('rank', placement, 'calculation', calc));
  END LOOP;

  RETURN jsonb_build_object(
    'results', scores,
    'config_version', c.config_version,
    'tenant_id', s.tenant_id,
    'festival_id', s.festival_id,
    'item_id', item.id
  );
END
$$;

COMMIT;
