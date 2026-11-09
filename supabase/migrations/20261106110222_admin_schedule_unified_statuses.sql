CREATE OR REPLACE FUNCTION public.admin_schedule_overview_page(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_search text DEFAULT NULL,
  p_item_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_venue_id uuid DEFAULT NULL,
  p_date date DEFAULT NULL,
  p_workflow_status text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_timezone text DEFAULT 'Asia/Kolkata',
  p_as_of timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_category text := nullif(upper(btrim(coalesce(p_category, ''))), '');
  v_workflow text := nullif(lower(btrim(coalesce(p_workflow_status, ''))), '');
  v_timezone text := nullif(btrim(coalesce(p_timezone, '')), '');
  v_now timestamptz := coalesce(p_as_of, statement_timestamp());
  v_result jsonb;
BEGIN
  IF v_search = '' THEN v_search := NULL; END IF;
  IF v_category IN ('ALL', '') THEN v_category := NULL; END IF;
  IF v_workflow IN ('all', '') THEN v_workflow := NULL; END IF;
  IF v_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = v_timezone
  ) THEN
    RAISE EXCEPTION 'Invalid schedule timezone' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NULL OR p_tenant_id IS NULL OR p_festival_id IS NULL
    OR NOT (public.is_superadmin() OR p_tenant_id = public.get_my_tenant_id())
    OR NOT EXISTS (
      SELECT 1 FROM public.festival_calendar f
      WHERE f.id = p_festival_id AND f.tenant_id = p_tenant_id
    ) THEN
    RAISE EXCEPTION 'Festival unavailable' USING ERRCODE = '42501';
  END IF;

  IF v_workflow IS NOT NULL AND v_workflow NOT IN (
    'scheduled', 'ongoing', 'completed', 'checkin_pending', 'checkin_done',
    'codes_pending', 'codes_done', 'marks_pending', 'marks_done', 'published', 'postponed'
  ) THEN
    RAISE EXCEPTION 'Unsupported schedule workflow filter' USING ERRCODE = '22023';
  END IF;

  WITH scoped AS MATERIALIZED (
    SELECT s.id, s.tenant_id, s.festival_id, s.item_id, s.venue_id,
      s.start_time, s.end_time, s.status, coalesce(s.is_postponed, false) AS is_postponed, s.is_shuffle_locked,
      s.is_public_visible, s.expected_judge_count,
      v.name AS venue_name,
      i.item_code, i.item_name_en, i.item_name_ml, i.category_codes,
      CASE
        WHEN lower(btrim(coalesce(s.status, 'scheduled'))) IN ('scheduled', 'upcoming')
          AND (coalesce(s.is_postponed, false) OR s.start_time < v_now) THEN 1
        WHEN lower(btrim(coalesce(s.status, 'scheduled'))) IN ('ongoing', 'in_progress', 'live', 'started') THEN 2
        WHEN lower(btrim(coalesce(s.status, 'scheduled'))) IN ('scheduled', 'upcoming') THEN 3
        WHEN lower(btrim(coalesce(s.status, ''))) IN ('completed', 'complete', 'finished') THEN 4
        ELSE 5
      END AS relevance_bucket
    FROM public.schedules s
    LEFT JOIN public.items i ON i.id = s.item_id
      AND i.tenant_id = p_tenant_id AND i.festival_id = p_festival_id
    LEFT JOIN public.venues v ON v.id = s.venue_id
      AND v.tenant_id = p_tenant_id AND v.festival_id = p_festival_id
    WHERE s.tenant_id = p_tenant_id AND s.festival_id = p_festival_id
      AND (p_item_id IS NULL OR s.item_id = p_item_id)
      AND (p_venue_id IS NULL OR s.venue_id = p_venue_id)
      AND (p_date IS NULL OR (
        s.start_time >= (p_date::timestamp AT TIME ZONE v_timezone)
        AND s.start_time < ((p_date + 1)::timestamp AT TIME ZONE v_timezone)
      ))
      AND (v_search IS NULL OR
        strpos(lower(coalesce(i.item_name_en, '')), lower(v_search)) > 0 OR
        strpos(lower(coalesce(i.item_name_ml, '')), lower(v_search)) > 0 OR
        EXISTS (
          SELECT 1 FROM unnest(coalesce(i.category_codes, ARRAY[]::text[])) c(code)
          WHERE strpos(lower(c.code), lower(v_search)) > 0
        )
      )
      AND (v_category IS NULL OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(i.category_codes, ARRAY[]::text[])) c(code)
        WHERE upper(btrim(c.code)) = ANY (
          CASE v_category
            WHEN 'JUNIOR' THEN ARRAY['JUNIOR','JR']::text[]
            WHEN 'JR' THEN ARRAY['JUNIOR','JR']::text[]
            WHEN 'SENIOR' THEN ARRAY['SENIOR','SR']::text[]
            WHEN 'SR' THEN ARRAY['SENIOR','SR']::text[]
            WHEN 'CAMPUS' THEN ARRAY['CAMPUS','CA']::text[]
            WHEN 'CA' THEN ARRAY['CAMPUS','CA']::text[]
            WHEN 'GENERAL' THEN ARRAY['GENERAL','GN']::text[]
            WHEN 'GN' THEN ARRAY['GENERAL','GN']::text[]
            ELSE ARRAY[v_category]::text[]
          END
        )
      ))
      AND (
        v_workflow IS NULL
        OR v_workflow NOT IN ('scheduled','ongoing','completed','postponed')
        OR (
          v_workflow = 'postponed'
          AND lower(btrim(coalesce(s.status, 'scheduled'))) IN ('scheduled','upcoming')
          AND (
            coalesce(s.is_postponed, false) IS TRUE
            OR s.start_time < v_now
          )
        )
        OR (
          v_workflow = 'scheduled'
          AND lower(btrim(coalesce(s.status, 'scheduled'))) IN ('scheduled','upcoming')
          AND coalesce(s.is_postponed, false) IS FALSE
          AND s.start_time >= v_now
        )
        OR (
          v_workflow IN ('ongoing','completed')
          AND CASE
            WHEN lower(btrim(coalesce(s.status, 'scheduled'))) IN ('ongoing','in_progress','live','started') THEN 'ongoing'
            WHEN lower(btrim(coalesce(s.status, ''))) IN ('completed','complete','finished') THEN 'completed'
            ELSE NULL
          END = v_workflow
        )
      )
  ),
  scope_total AS MATERIALIZED (
    SELECT count(*)::bigint AS total_count
    FROM public.schedules s
    WHERE s.tenant_id = p_tenant_id AND s.festival_id = p_festival_id
  ),
  counted_base AS MATERIALIZED (
    SELECT scoped.*, count(*) OVER ()::bigint AS base_total
    FROM scoped
  ),
  candidates AS MATERIALIZED (
    SELECT b.* FROM counted_base b
    WHERE v_workflow IN ('checkin_pending','checkin_done','codes_pending','codes_done','marks_pending','marks_done','published')
    UNION ALL
    SELECT page_rows.* FROM (
      SELECT b.* FROM counted_base b
      WHERE v_workflow IS NULL OR v_workflow IN ('scheduled','ongoing','completed','postponed')
      ORDER BY b.relevance_bucket ASC,
        CASE WHEN b.relevance_bucket = 4 THEN b.start_time END DESC NULLS LAST,
        CASE WHEN b.relevance_bucket <> 4 THEN b.start_time END ASC NULLS LAST,
        b.id ASC
      OFFSET ((v_page::bigint - 1) * v_page_size)
      LIMIT v_page_size
    ) page_rows
  ),
  registration_counts AS MATERIALIZED (
    SELECT c.id AS schedule_id,
      count(r.id) FILTER (WHERE r.status IS DISTINCT FROM 'rejected')::bigint AS active_count,
      count(r.id) FILTER (WHERE r.status IS DISTINCT FROM 'rejected' AND r.is_verified)::bigint AS verified_count,
      count(r.id) FILTER (WHERE r.status IS DISTINCT FROM 'rejected' AND r.is_verified AND r.code_letter IS NOT NULL)::bigint AS coded_count,
      count(r.id) FILTER (WHERE r.status = 'rejected')::bigint AS rejected_count
    FROM candidates c
    LEFT JOIN public.registrations r ON r.item_id = c.item_id
      AND r.festival_id = c.festival_id AND r.tenant_id = p_tenant_id
    GROUP BY c.id
  ),
  assigned AS MATERIALIZED (
    SELECT DISTINCT c.id AS schedule_id, a.judge_id
    FROM candidates c
    JOIN public.schedule_judge_assignments a ON a.schedule_id = c.id
      AND a.tenant_id = p_tenant_id AND a.status = 'active'
    JOIN public.judges j ON j.id = a.judge_id
  ),
  eligible AS MATERIALIZED (
    SELECT c.id AS schedule_id, r.id AS registration_id
    FROM candidates c
    JOIN public.registrations r ON r.item_id = c.item_id
      AND r.festival_id = c.festival_id AND r.tenant_id = p_tenant_id
    WHERE r.status IS DISTINCT FROM 'rejected' AND r.is_verified
      AND coalesce(r.code_letter, '') <> ''
  ),
  eligible_counts AS MATERIALIZED (
    SELECT e.schedule_id, count(*)::bigint AS eligible_count
    FROM eligible e GROUP BY e.schedule_id
  ),
  judge_finals AS MATERIALIZED (
    SELECT a.schedule_id, a.judge_id, count(DISTINCT m.registration_id)::bigint AS final_count
    FROM assigned a
    JOIN public.mark_entries m ON m.schedule_id = a.schedule_id
      AND m.judge_id = a.judge_id AND m.is_final IS TRUE
    JOIN eligible e ON e.schedule_id = a.schedule_id AND e.registration_id = m.registration_id
    GROUP BY a.schedule_id, a.judge_id
  ),
  judge_counts AS MATERIALIZED (
    SELECT a.schedule_id, count(*)::bigint AS assigned_judges,
      count(*) FILTER (WHERE coalesce(f.final_count, 0) >= coalesce(ec.eligible_count, 0)
        AND coalesce(ec.eligible_count, 0) > 0)::bigint AS submitted_judges
    FROM assigned a
    LEFT JOIN eligible_counts ec ON ec.schedule_id = a.schedule_id
    LEFT JOIN judge_finals f ON f.schedule_id = a.schedule_id AND f.judge_id = a.judge_id
    GROUP BY a.schedule_id
  ),
  published AS MATERIALIZED (
    SELECT c.id AS schedule_id,
      bool_or(r.published IS TRUE OR r.result_status = 'published') AS has_published_result,
      bool_or(r.collection_method = 'manual' AND (r.published IS TRUE OR r.result_status = 'published')) AS has_manual_result
    FROM candidates c
    JOIN public.results r ON r.schedule_id = c.id
      AND r.tenant_id = p_tenant_id AND r.festival_id = p_festival_id
    GROUP BY c.id
  ),
  canonical_eligible AS MATERIALIZED (
    SELECT c.id AS schedule_id, r.id AS registration_id
    FROM candidates c
    JOIN public.registrations r ON r.item_id = c.item_id
      AND r.status IS DISTINCT FROM 'rejected' AND r.code_letter IS NOT NULL
  ),
  canonical_eligible_counts AS MATERIALIZED (
    SELECT c.id AS schedule_id, count(ce.registration_id)::bigint AS eligible_count
    FROM candidates c
    LEFT JOIN canonical_eligible ce ON ce.schedule_id = c.id
    GROUP BY c.id
  ),
  canonical_assignments AS MATERIALIZED (
    SELECT c.id AS schedule_id, a.judge_id
    FROM candidates c
    JOIN public.schedule_judge_assignments a ON a.schedule_id = c.id
      AND a.tenant_id = p_tenant_id AND a.status = 'active'
  ),
  canonical_judge_finals AS MATERIALIZED (
    SELECT a.schedule_id, a.judge_id,
      count(DISTINCT m.registration_id) FILTER (WHERE m.is_final IS TRUE)::bigint AS final_count
    FROM canonical_assignments a
    LEFT JOIN public.mark_entries m ON m.schedule_id = a.schedule_id
      AND m.judge_id = a.judge_id
      AND m.registration_id IN (
        SELECT ce.registration_id FROM canonical_eligible ce
        WHERE ce.schedule_id = a.schedule_id
      )
    GROUP BY a.schedule_id, a.judge_id
  ),
  canonical_panel_counts AS MATERIALIZED (
    SELECT c.id AS schedule_id,
      count(DISTINCT a.judge_id)::bigint AS assigned_count,
      count(DISTINCT f.judge_id) FILTER (
        WHERE f.final_count >= ec.eligible_count AND ec.eligible_count > 0
      )::bigint AS completed_judge_count
    FROM candidates c
    JOIN canonical_eligible_counts ec ON ec.schedule_id = c.id
    LEFT JOIN canonical_assignments a ON a.schedule_id = c.id
    LEFT JOIN canonical_judge_finals f ON f.schedule_id = a.schedule_id AND f.judge_id = a.judge_id
    GROUP BY c.id, ec.eligible_count
  ),
  canonical_marks AS MATERIALIZED (
    -- Match get_judge_management_status semantics while limiting this work to
    -- the candidate set (the current page, or the full set only for marks filters).
    SELECT c.id AS schedule_id,
      (
        c.status IN ('completed', 'published')
        OR (
          ec.eligible_count > 0
          AND coalesce(pc.assigned_count, 0) = c.expected_judge_count
          AND coalesce(pc.completed_judge_count, 0) >= c.expected_judge_count
        )
        OR EXISTS (
          SELECT 1 FROM public.results res
          WHERE res.item_id = c.item_id
            AND (res.published IS TRUE OR res.result_status = 'published')
        )
      ) AS marks_completed
    FROM candidates c
    JOIN canonical_eligible_counts ec ON ec.schedule_id = c.id
    LEFT JOIN canonical_panel_counts pc ON pc.schedule_id = c.id
  ),
  enriched AS MATERIALIZED (
    SELECT c.*,
      coalesce(rc.active_count, 0) AS active_count,
      coalesce(rc.verified_count, 0) AS verified_count,
      coalesce(rc.coded_count, 0) AS coded_count,
      coalesce(rc.rejected_count, 0) AS rejected_count,
      coalesce(jc.assigned_judges, 0) AS assigned_judges,
      coalesce(jc.submitted_judges, 0) AS submitted_judges,
      coalesce(cm.marks_completed, false) AS marks_completed,
      coalesce(pr.has_manual_result, false) AS has_manual_result,
      coalesce(pr.has_published_result, false) AS has_published_result,
      lower(btrim(coalesce(c.status, 'scheduled'))) IN ('scheduled','upcoming')
        AND c.start_time < v_now AS is_overdue_unstarted
    FROM candidates c
    LEFT JOIN registration_counts rc ON rc.schedule_id = c.id
    LEFT JOIN judge_counts jc ON jc.schedule_id = c.id
    LEFT JOIN canonical_marks cm ON cm.schedule_id = c.id
    LEFT JOIN published pr ON pr.schedule_id = c.id
  ),
  filtered AS MATERIALIZED (
    SELECT e.* FROM enriched e
    WHERE v_workflow IS NULL OR v_workflow IN ('scheduled','ongoing','completed','postponed') OR
      CASE v_workflow
        WHEN 'checkin_pending' THEN e.active_count > e.verified_count
        WHEN 'checkin_done' THEN e.active_count > 0 AND e.active_count = e.verified_count
        WHEN 'codes_pending' THEN e.verified_count > e.coded_count
        WHEN 'codes_done' THEN e.verified_count > 0 AND e.verified_count = e.coded_count
        WHEN 'marks_pending' THEN NOT (e.marks_completed OR e.has_published_result)
        WHEN 'marks_done' THEN e.marks_completed OR e.has_published_result
        WHEN 'published' THEN e.has_published_result
        ELSE false
      END
  ),
  result_count AS (
    SELECT CASE
      WHEN v_workflow IN ('checkin_pending','checkin_done','codes_pending','codes_done','marks_pending','marks_done','published')
        THEN count(*)::bigint
      ELSE coalesce((SELECT max(b.base_total) FROM counted_base b), 0)::bigint
    END AS total_count,
    (SELECT total_count FROM scope_total) AS festival_filter_count
    FROM filtered
  ),
  page_rows AS MATERIALIZED (
    SELECT f.* FROM filtered f
    ORDER BY f.relevance_bucket ASC,
      CASE WHEN f.relevance_bucket = 4 THEN f.start_time END DESC NULLS LAST,
      CASE WHEN f.relevance_bucket <> 4 THEN f.start_time END ASC NULLS LAST,
      f.id ASC
    OFFSET CASE WHEN v_workflow IN ('checkin_pending','checkin_done','codes_pending','codes_done','marks_pending','marks_done','published')
      THEN ((v_page::bigint - 1) * v_page_size) ELSE 0 END
    LIMIT v_page_size
  )
  SELECT jsonb_build_object(
    'total_count', rc.total_count,
    'festival_total_count', rc.festival_filter_count,
    'as_of', v_now,
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.relevance_bucket,
      CASE WHEN p.relevance_bucket = 4 THEN p.start_time END DESC NULLS LAST,
      CASE WHEN p.relevance_bucket <> 4 THEN p.start_time END ASC NULLS LAST,
      p.id) FROM page_rows p), '[]'::jsonb)
  ) INTO v_result
  FROM result_count rc;

  RETURN coalesce(v_result, jsonb_build_object('total_count', 0, 'festival_total_count', 0, 'rows', '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION stage_portal_private.mark_schedule_started_after_checkin(
  p_schedule_id uuid,
  p_tenant_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_schedule public.schedules%ROWTYPE;
  v_new jsonb;
BEGIN
  SELECT * INTO v_schedule
  FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The schedule is outside the current tenant scope.' USING ERRCODE = '42501';
  END IF;

  IF lower(btrim(coalesce(v_schedule.status, 'scheduled'))) IN ('scheduled', 'upcoming') THEN
    UPDATE public.schedules
    SET status = 'ongoing', is_postponed = false
    WHERE id = p_schedule_id AND tenant_id = p_tenant_id;
  ELSIF lower(btrim(coalesce(v_schedule.status, ''))) IN ('ongoing', 'in_progress', 'live', 'started')
      AND coalesce(v_schedule.is_postponed, false) THEN
    UPDATE public.schedules
    SET is_postponed = false
    WHERE id = p_schedule_id AND tenant_id = p_tenant_id;
  ELSE
    RETURN false;
  END IF;

  SELECT pg_catalog.to_jsonb(s) INTO v_new
  FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = p_tenant_id;

  IF v_new IS DISTINCT FROM pg_catalog.to_jsonb(v_schedule) THEN
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (p_tenant_id, auth.uid(), 'schedule_started_on_first_checkin', 'schedules', p_schedule_id,
      pg_catalog.to_jsonb(v_schedule), v_new);
    RETURN true;
  END IF;
  RETURN false;
END;
$function$;
ALTER FUNCTION stage_portal_private.mark_schedule_started_after_checkin(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION stage_portal_private.mark_schedule_started_after_checkin(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stage_update_registration(p_schedule_id uuid, p_registration_id uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_tenant_id uuid;
  v_result jsonb;
BEGIN
  IF p_action NOT IN ('verify', 'unverify') THEN
    RAISE EXCEPTION 'Only verification actions are available in check-in.' USING ERRCODE = '22023';
  END IF;
  v_tenant_id := public.stage_assert_admin_access();
  v_result := public.stage_update_registration_checkin_legacy(p_schedule_id, p_registration_id, p_action);
  IF p_action = 'verify' THEN
    PERFORM stage_portal_private.mark_schedule_started_after_checkin(p_schedule_id, v_tenant_id);
  END IF;
  RETURN v_result;
END;
$function$;
ALTER FUNCTION public.stage_update_registration(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.stage_update_registration(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_update_registration(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stage_venue_portal_update_registration(
  p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_result jsonb;
  v_tenant_id uuid;
BEGIN
  IF p_action NOT IN ('verify', 'unverify') THEN
    RAISE EXCEPTION 'Only verification actions are available in check-in.' USING ERRCODE = '22023';
  END IF;
  v_result := public.stage_venue_portal_update_registration_checkin_legacy(
    p_venue_id, p_pin, p_schedule_id, p_registration_id, p_action);
  IF p_action = 'verify' AND coalesce(v_result ? 'registration_id', false) THEN
    SELECT s.tenant_id INTO v_tenant_id
    FROM public.schedules s
    WHERE s.id = p_schedule_id AND s.venue_id = p_venue_id;
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501';
    END IF;
    PERFORM stage_portal_private.mark_schedule_started_after_checkin(p_schedule_id, v_tenant_id);
  END IF;
  RETURN v_result;
END;
$function$;
ALTER FUNCTION public.stage_venue_portal_update_registration(uuid, text, uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.stage_venue_portal_update_registration(uuid, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_update_registration(uuid, text, uuid, uuid, text)
  TO anon, authenticated, service_role;

-- Keep lifecycle state and the manual-postponement marker consistent when an
-- administrator or venue operator changes a schedule outside check-in.
CREATE OR REPLACE FUNCTION public.stage_set_schedule_status(
  p_schedule_id uuid,
  p_status text,
  p_expected_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_status text;
  v_schedule public.schedules%ROWTYPE;
  v_new jsonb;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  v_status := pg_catalog.lower(pg_catalog.btrim(p_status));
  IF v_status IS NULL OR v_status NOT IN ('scheduled', 'ongoing', 'completed') THEN
    RAISE EXCEPTION 'Unsupported event status.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_schedule
  FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The schedule is outside the current tenant scope.' USING ERRCODE = '42501';
  END IF;
  IF v_schedule.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'This schedule status changed elsewhere. Refresh and try again.' USING ERRCODE = '40001';
  END IF;

  IF pg_catalog.lower(pg_catalog.btrim(COALESCE(v_schedule.status, 'scheduled'))) = v_status
    AND (v_status = 'scheduled' OR coalesce(v_schedule.is_postponed, false) IS FALSE) THEN
    RETURN pg_catalog.jsonb_build_object('schedule_id', p_schedule_id, 'status', v_status, 'changed', false);
  END IF;

  UPDATE public.schedules
  SET status = v_status,
      is_postponed = CASE WHEN v_status IN ('ongoing', 'completed') THEN false ELSE is_postponed END
  WHERE id = p_schedule_id AND tenant_id = v_tenant_id;
  SELECT pg_catalog.to_jsonb(s) INTO v_new FROM public.schedules s WHERE s.id = p_schedule_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_tenant_id, auth.uid(), 'schedule_lifecycle_status_updated', 'schedules', p_schedule_id,
    pg_catalog.to_jsonb(v_schedule), v_new);

  RETURN pg_catalog.jsonb_build_object('schedule_id', p_schedule_id, 'status', v_status, 'changed', true);
END;
$function$;
ALTER FUNCTION public.stage_set_schedule_status(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.stage_set_schedule_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_set_schedule_status(uuid, text, text) TO authenticated, service_role, postgres;

CREATE OR REPLACE FUNCTION public.stage_venue_portal_set_schedule_status(
  p_venue_id uuid,
  p_pin text,
  p_schedule_id uuid,
  p_status text,
  p_expected_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_status text;
  v_pin_error text;
  v_new jsonb;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('error', v_pin_error);
  END IF;

  v_status := pg_catalog.lower(pg_catalog.btrim(p_status));
  IF v_status IS NULL OR v_status NOT IN ('scheduled', 'ongoing', 'completed') THEN
    RAISE EXCEPTION 'Unsupported event status.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  SELECT * INTO v_schedule
  FROM public.schedules s
  WHERE s.id = p_schedule_id
    AND s.venue_id = p_venue_id
    AND s.tenant_id = v_venue.tenant_id
    AND s.festival_id = v_venue.festival_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501';
  END IF;
  IF v_schedule.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'This schedule status changed elsewhere. Refresh and try again.' USING ERRCODE = '40001';
  END IF;

  IF pg_catalog.lower(pg_catalog.btrim(COALESCE(v_schedule.status, 'scheduled'))) = v_status
    AND (v_status = 'scheduled' OR coalesce(v_schedule.is_postponed, false) IS FALSE) THEN
    RETURN pg_catalog.jsonb_build_object('schedule_id', p_schedule_id, 'status', v_status, 'changed', false);
  END IF;

  UPDATE public.schedules
  SET status = v_status,
      is_postponed = CASE WHEN v_status IN ('ongoing', 'completed') THEN false ELSE is_postponed END
  WHERE id = p_schedule_id AND tenant_id = v_venue.tenant_id AND festival_id = v_venue.festival_id;
  SELECT pg_catalog.to_jsonb(s) INTO v_new FROM public.schedules s WHERE s.id = p_schedule_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_venue.tenant_id, auth.uid(), 'stage_venue_schedule_status_updated', 'schedules', p_schedule_id,
    pg_catalog.to_jsonb(v_schedule) || pg_catalog.jsonb_build_object('venue_id', p_venue_id),
    v_new || pg_catalog.jsonb_build_object('venue_id', p_venue_id));

  RETURN pg_catalog.jsonb_build_object('schedule_id', p_schedule_id, 'status', v_status, 'changed', true);
END;
$function$;
ALTER FUNCTION public.stage_venue_portal_set_schedule_status(uuid, text, uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.stage_venue_portal_set_schedule_status(uuid, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_set_schedule_status(uuid, text, uuid, text, text)
  TO anon, authenticated, service_role, postgres;

NOTIFY pgrst, 'reload schema';

NOTIFY pgrst, 'reload schema';
