-- Allow schedules without a venue while preserving existing item, festival, tenant, duplicate, time, and venue ownership checks.
-- CREATE OR REPLACE preserves each function's existing owner, grants, SECURITY DEFINER and search_path.

CREATE OR REPLACE FUNCTION "public"."bulk_create_schedules"("p_festival_id" "uuid", "p_schedules" "jsonb") RETURNS SETOF "public"."schedules"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_row jsonb;
  v_item_id uuid;
  v_venue_id uuid;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_status text;
  v_buffer_minutes integer;
  v_expected_judge_count integer;
  v_break_context jsonb;
  v_schedule public.schedules%ROWTYPE;
  v_seen_items uuid[] := ARRAY[]::uuid[];
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF p_schedules IS NULL OR jsonb_typeof(p_schedules) <> 'array'
     OR jsonb_array_length(p_schedules) = 0 THEN
    RAISE EXCEPTION 'At least one schedule is required.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_schedules) > 200 THEN
    RAISE EXCEPTION 'Bulk schedule creation is limited to 200 items per request.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.festival_calendar f
    WHERE f.id = p_festival_id
      AND f.tenant_id = v_tenant_id
      AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The requested festival is not active for this tenant.'
      USING ERRCODE = '42501';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_schedules)
  LOOP
    v_item_id := NULLIF(v_row ->> 'item_id', '')::uuid;
    v_venue_id := NULLIF(v_row ->> 'venue_id', '')::uuid;
    v_start_time := NULLIF(v_row ->> 'start_time', '')::timestamptz;
    v_end_time := NULLIF(v_row ->> 'end_time', '')::timestamptz;
    v_status := COALESCE(NULLIF(v_row ->> 'status', ''), 'scheduled');
    v_buffer_minutes := GREATEST(0, COALESCE(NULLIF(v_row ->> 'buffer_minutes', '')::integer, 0));
    v_expected_judge_count := COALESCE(NULLIF(v_row ->> 'expected_judge_count', '')::integer, 3);
    v_break_context := v_row -> 'bulk_break_context';

    IF v_item_id IS NULL OR v_start_time IS NULL OR v_end_time IS NULL THEN
      RAISE EXCEPTION 'Every bulk schedule requires item, start time, and end time.'
        USING ERRCODE = '22023';
    END IF;

    IF v_end_time <= v_start_time THEN
      RAISE EXCEPTION 'Schedule end time must be later than start time.'
        USING ERRCODE = '22023';
    END IF;

    IF v_expected_judge_count < 1 OR v_expected_judge_count > 5 THEN
      RAISE EXCEPTION 'Expected judge count must be between 1 and 5.'
        USING ERRCODE = '22023';
    END IF;

    IF v_break_context IS NOT NULL AND jsonb_typeof(v_break_context) <> 'array' THEN
      RAISE EXCEPTION 'Break context must be an array.'
        USING ERRCODE = '22023';
    END IF;

    IF v_item_id = ANY(v_seen_items) THEN
      RAISE EXCEPTION 'The same competition item cannot be added twice in one bulk request.'
        USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.schedules s
      WHERE s.tenant_id = v_tenant_id
        AND s.festival_id = p_festival_id
        AND s.item_id = v_item_id
    ) THEN
      RAISE EXCEPTION 'This competition item is already scheduled in the selected festival.'
        USING ERRCODE = '23505';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.items i
      WHERE i.id = v_item_id
        AND COALESCE(i.is_active, true) IS TRUE
        AND (i.tenant_id = v_tenant_id OR i.tenant_id IS NULL)
        AND (i.festival_id = p_festival_id OR i.festival_id IS NULL)
    ) THEN
      RAISE EXCEPTION 'The selected competition item is invalid for this festival.'
        USING ERRCODE = '42501';
    END IF;

    IF v_venue_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.id = v_venue_id
        AND v.tenant_id = v_tenant_id
        AND (
          v.festival_id = p_festival_id
          OR (
            v.festival_id IS NULL
            AND (
              SELECT count(*)
              FROM public.festival_calendar legacy_festival
              WHERE legacy_festival.tenant_id = v_tenant_id
                AND legacy_festival.is_active IS TRUE
            ) = 1
          )
        )
    ) THEN
      RAISE EXCEPTION 'The selected venue is invalid for this festival.'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.schedules (
      tenant_id,
      festival_id,
      item_id,
      venue_id,
      start_time,
      end_time,
      status,
      buffer_minutes,
      expected_judge_count,
      bulk_break_context
    ) VALUES (
      v_tenant_id,
      p_festival_id,
      v_item_id,
      v_venue_id,
      v_start_time,
      v_end_time,
      v_status,
      v_buffer_minutes,
      v_expected_judge_count,
      v_break_context
    )
    RETURNING * INTO v_schedule;

    v_seen_items := array_append(v_seen_items, v_item_id);
    RETURN NEXT v_schedule;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."execute_schedule_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_schedules" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_schedule jsonb;
  v_category text;
  v_venue_name text;
  v_item_name text;
  v_item_code text;
  v_section text;
  v_date text;
  v_start_str text;
  v_end_str text;
  v_duration int;
  v_stage_order int;
  v_max_parts int;
  v_status text;

  v_item_id uuid;
  v_db_item_name text;
  v_item_categories text[];
  v_venue_id uuid;

  v_start_time timestamptz;
  v_end_time timestamptz;

  v_imported_count int := 0;
  v_skipped_count int := 0;
  v_conflict_count int := 0;
  v_invalid_count int := 0;

  v_errors jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_db_overlap_item text;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- 1. Scoped Advisory Lock to prevent concurrent scheduling operations
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_festival_id::text || 'schedules'));

  FOR v_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    v_category := v_schedule->>'category';
    v_venue_name := v_schedule->>'venue';
    v_item_name := v_schedule->>'item_name';
    v_item_code := v_schedule->>'item_code';
    v_section := v_schedule->>'section';
    v_date := v_schedule->>'date';
    v_start_str := v_schedule->>'start_time';
    v_end_str := v_schedule->>'end_time';
    v_duration := (v_schedule->>'duration_minutes')::int;
    v_stage_order := (v_schedule->>'stage_order')::int;
    v_max_parts := (v_schedule->>'max_participants')::int;
    v_status := COALESCE(v_schedule->>'status', 'scheduled');

    -- Validate Item Code & Category (festival-scoped)
    SELECT id, item_name_en, category_codes INTO v_item_id, v_db_item_name, v_item_categories
    FROM public.items
    WHERE festival_id = p_festival_id AND item_code = v_item_code AND is_active = true
    LIMIT 1;

    IF v_item_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'error', 'Item code not found in active festival items'
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END IF;

    -- Validate Item Name matches exactly (English)
    IF LOWER(TRIM(v_db_item_name)) <> LOWER(TRIM(v_item_name)) THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'error', 'Item name mismatch. DB expects: ' || v_db_item_name
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END IF;

    -- Validate Category matches
    IF NOT (v_category = ANY(v_item_categories) OR v_category = 'GENERAL' OR 'GN' = ANY(v_item_categories)) THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'error', 'Category mismatch. Item expects: ' || array_to_string(v_item_categories, ', ')
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END IF;

    -- Validate Venue when one is supplied (still scoped to the tenant and festival).
    v_venue_id := NULL;
    IF NULLIF(TRIM(v_venue_name), '') IS NOT NULL THEN
      SELECT id INTO v_venue_id
      FROM public.venues
      WHERE festival_id = p_festival_id AND tenant_id = p_tenant_id
        AND LOWER(TRIM(name)) = LOWER(TRIM(v_venue_name))
      LIMIT 1;

      IF v_venue_id IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'item_code', v_item_code,
          'venue', v_venue_name,
          'error', 'Venue not found in active festival. Please create venue first.'
        );
        v_invalid_count := v_invalid_count + 1;
        CONTINUE;
      END IF;
    END IF;

    -- Parse timestamps safely
    BEGIN
      v_start_time := to_timestamp(v_date || ' ' || v_start_str, 'YYYY-MM-DD HH:12:MI AM');
      v_end_time := to_timestamp(v_date || ' ' || v_end_str, 'YYYY-MM-DD HH:12:MI AM');
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'error', 'Invalid date or time format. Expected YYYY-MM-DD and HH:MM AM/PM'
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END;

    -- Check database overlaps/conflicts (same venue + overlapping time range)
    IF v_venue_id IS NULL THEN
      v_db_overlap_item := NULL;
    ELSE
    SELECT i.item_name_en INTO v_db_overlap_item
    FROM public.schedules s
    JOIN public.items i ON i.id = s.item_id
    WHERE s.festival_id = p_festival_id
      AND s.venue_id = v_venue_id
      AND s.start_time < v_end_time
      AND s.end_time > v_start_time
      AND s.item_id <> v_item_id -- exclude same item reschedule if identical
    LIMIT 1;
    END IF;

    IF v_db_overlap_item IS NOT NULL THEN
      v_conflicts := v_conflicts || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'venue', v_venue_name,
        'conflict_with', v_db_overlap_item,
        'start_time', v_start_str,
        'end_time', v_end_str,
        'error', 'Overlap detected with already scheduled item: ' || v_db_overlap_item
      );
      v_conflict_count := v_conflict_count + 1;
      CONTINUE; -- Block conflicting row
    END IF;

    IF v_venue_id IS NULL AND EXISTS (
      SELECT 1 FROM public.schedules s
      WHERE s.festival_id = p_festival_id AND s.venue_id IS NULL AND s.item_id = v_item_id
        AND s.start_time = v_start_time AND s.end_time = v_end_time
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;
    -- Safe Insert schedule slot
    INSERT INTO public.schedules (
      tenant_id, festival_id, item_id, venue_id, start_time, end_time, status
    ) VALUES (
      p_tenant_id, p_festival_id, v_item_id, v_venue_id, v_start_time, v_end_time, v_status
    )
    ON CONFLICT (festival_id, venue_id, item_id, start_time, end_time) DO NOTHING;

    IF FOUND THEN
      v_imported_count := v_imported_count + 1;
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'imported_count', v_imported_count,
    'skipped_count', v_skipped_count,
    'conflict_count', v_conflict_count,
    'invalid_count', v_invalid_count,
    'errors', v_errors,
    'conflicts', v_conflicts
  );
END;
$$;

-- Scope inline schedule assignment to venues available to the schedule's tenant and festival.
CREATE OR REPLACE FUNCTION public.update_schedule_assignment_scoped(
  p_schedule_id uuid,
  p_venue_id uuid,
  p_update_substages boolean,
  p_substage_config jsonb
) RETURNS SETOF public.schedules
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_schedule public.schedules%ROWTYPE;
BEGIN
  IF p_update_substages IS NULL THEN
    RAISE EXCEPTION 'Sub-stage update flag is required.' USING ERRCODE = '22023';
  END IF;
  IF p_update_substages AND (p_substage_config IS NULL OR jsonb_typeof(p_substage_config) <> 'array') THEN
    RAISE EXCEPTION 'Sub-stage configuration must be an array.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_schedule
  FROM public.schedules
  WHERE id = p_schedule_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule was not found or is not available to this account.' USING ERRCODE = '42501';
  END IF;

  IF p_venue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE v.id = p_venue_id
      AND v.tenant_id = v_schedule.tenant_id
      AND (
        v.festival_id = v_schedule.festival_id
        OR (
          v.festival_id IS NULL
          AND (
            SELECT count(*)
            FROM public.festival_calendar active_festival
            WHERE active_festival.tenant_id = v_schedule.tenant_id
              AND active_festival.is_active IS TRUE
          ) = 1
        )
      )
  ) THEN
    RAISE EXCEPTION 'The selected venue is invalid for this festival.' USING ERRCODE = '42501';
  END IF;

  IF p_update_substages THEN
    IF p_venue_id IS DISTINCT FROM v_schedule.venue_id THEN
      UPDATE public.schedules
      SET venue_id = p_venue_id, substage_config = p_substage_config
      WHERE id = p_schedule_id
      RETURNING * INTO v_schedule;
    ELSE
      UPDATE public.schedules
      SET substage_config = p_substage_config
      WHERE id = p_schedule_id
      RETURNING * INTO v_schedule;
    END IF;
  ELSIF p_venue_id IS DISTINCT FROM v_schedule.venue_id THEN
    UPDATE public.schedules
    SET venue_id = p_venue_id
    WHERE id = p_schedule_id
    RETURNING * INTO v_schedule;
  END IF;

  RETURN NEXT v_schedule;
END;
$$;

REVOKE ALL ON FUNCTION public.update_schedule_assignment_scoped(uuid, uuid, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_schedule_assignment_scoped(uuid, uuid, boolean, jsonb) TO authenticated;
