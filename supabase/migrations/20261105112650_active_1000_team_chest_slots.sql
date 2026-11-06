BEGIN;

-- The active-team-only allocation rule is intentionally limited to the
-- 1000-number team model. The existing 100-number model keeps its prior
-- archived-team slot and participant behavior.
CREATE OR REPLACE FUNCTION public.ensure_festival_team_chest_slots(p_festival_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_root_id uuid;
  v_range integer;
  v_last_slot integer;
  v_offset integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_festival_id::text),
    pg_catalog.hashtext('participant-chest-number')
  );

  SELECT t.organisation_id, f.chest_number_category_range
  INTO v_root_id, v_range
  FROM public.festival_calendar f
  JOIN public.tenants t ON t.id = f.tenant_id
  WHERE f.id = p_festival_id;
  IF v_root_id IS NULL THEN
    RAISE EXCEPTION 'Festival owner organisation is missing.';
  END IF;

  IF v_range = 1000 THEN
    DELETE FROM public.festival_team_chest_slots s
    USING public.organisations o
    WHERE s.festival_id = p_festival_id
      AND o.id = s.organisation_id
      AND (o.parent_id IS DISTINCT FROM v_root_id OR o.archived_at IS NOT NULL);
  END IF;

  SELECT COALESCE(pg_catalog.max(slot_number), 0)
  INTO v_last_slot
  FROM public.festival_team_chest_slots
  WHERE festival_id = p_festival_id;

  INSERT INTO public.festival_team_chest_slots(festival_id, organisation_id, slot_number)
  SELECT p_festival_id, o.id,
    v_last_slot + pg_catalog.row_number() OVER (ORDER BY o.created_at, o.id)
  FROM public.organisations o
  WHERE o.parent_id = v_root_id
    AND (v_range IS DISTINCT FROM 1000 OR o.archived_at IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.festival_team_chest_slots s
      WHERE s.festival_id = p_festival_id AND s.organisation_id = o.id
    );

  IF v_range = 1000 THEN
    SELECT COALESCE(pg_catalog.max(slot_number), 0)
    INTO v_last_slot
    FROM public.festival_team_chest_slots
    WHERE festival_id = p_festival_id;

    IF EXISTS (
      SELECT 1
      FROM (
        SELECT s.slot_number,
          pg_catalog.row_number() OVER (ORDER BY s.slot_number, o.created_at, o.id)::integer AS expected_slot
        FROM public.festival_team_chest_slots s
        JOIN public.organisations o ON o.id = s.organisation_id
        WHERE s.festival_id = p_festival_id
      ) ordered_slots
      WHERE ordered_slots.slot_number IS DISTINCT FROM ordered_slots.expected_slot
    ) THEN
      -- Move every slot above the current range first so the unique slot index
      -- never sees an intermediate collision while compacting to 1..N.
      v_offset := v_last_slot;
      UPDATE public.festival_team_chest_slots
      SET slot_number = slot_number + v_offset
      WHERE festival_id = p_festival_id;

      WITH ordered_slots AS (
        SELECT s.organisation_id,
          pg_catalog.row_number() OVER (ORDER BY s.slot_number, o.created_at, o.id)::integer AS expected_slot
        FROM public.festival_team_chest_slots s
        JOIN public.organisations o ON o.id = s.organisation_id
        WHERE s.festival_id = p_festival_id
      )
      UPDATE public.festival_team_chest_slots s
      SET slot_number = ordered_slots.expected_slot
      FROM ordered_slots
      WHERE s.festival_id = p_festival_id
        AND s.organisation_id = ordered_slots.organisation_id;
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_festival_chest_order(p_festival_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.assert_festival_chest_admin(p_festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_festival_id::text),
    pg_catalog.hashtext('participant-chest-number')
  );

  SELECT pg_catalog.jsonb_build_object(
    'festival_id', f.id,
    'template', f.chest_number_template,
    'range', f.chest_number_category_range,
    'locked', COALESCE(c.locked, false),
    'revision', COALESCE(c.revision, 0),
    'category_order_enabled', COALESCE(c.category_order_enabled, false),
    'categories', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'code', codes.code,
          'name', COALESCE(fc.name, codes.code),
          'total', COALESCE(pc.total, 0)
        ) ORDER BY pg_catalog.array_position(c.category_order, codes.code) NULLS LAST,
          fc.sort_order NULLS LAST, codes.code
      )
      FROM (
        SELECT pg_catalog.lower(pg_catalog.btrim(x.code)) AS code
        FROM public.festival_categories x
        WHERE x.festival_id = f.id AND pg_catalog.btrim(COALESCE(x.code, '')) <> ''
        UNION
        SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code))
        FROM public.participants p
        WHERE p.festival_id = f.id AND pg_catalog.btrim(COALESCE(p.category_code, '')) <> ''
      ) codes
      LEFT JOIN LATERAL (
        SELECT x.name, x.sort_order
        FROM public.festival_categories x
        WHERE x.festival_id = f.id
          AND pg_catalog.lower(pg_catalog.btrim(x.code)) = codes.code
        ORDER BY x.sort_order NULLS LAST, x.id
        LIMIT 1
      ) fc ON true
      LEFT JOIN LATERAL (
        SELECT pg_catalog.count(*)::integer AS total
        FROM public.participants p
        WHERE p.festival_id = p_festival_id
          AND pg_catalog.lower(pg_catalog.btrim(p.category_code)) = codes.code
      ) pc ON true
    ), '[]'::jsonb),
    'teams', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'archived_at', r.archived_at,
          'slot_number', r.slot_number,
          'total', r.total,
          'numeric', r.numeric
        ) ORDER BY r.slot_number NULLS LAST, r.created_at, r.id
      )
      FROM (
        SELECT o.id, o.name, o.archived_at, o.created_at, s.slot_number,
          COALESCE(p.total, 0) AS total,
          COALESCE(p.numeric, 0) AS numeric
        FROM public.tenants t
        JOIN public.organisations o ON o.parent_id = t.organisation_id
        LEFT JOIN public.festival_team_chest_slots s
          ON s.festival_id = f.id AND s.organisation_id = o.id
        LEFT JOIN (
          SELECT p.organisation_id,
            pg_catalog.count(*) AS total,
            pg_catalog.count(*) FILTER (WHERE p.chest_number ~ '^[0-9]+$') AS numeric
          FROM public.participants p
          WHERE p.festival_id = p_festival_id
          GROUP BY p.organisation_id
        ) p ON p.organisation_id = o.id
        WHERE t.id = f.tenant_id
          AND (f.chest_number_category_range IS DISTINCT FROM 1000 OR o.archived_at IS NULL)
      ) r
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.festival_calendar f
  LEFT JOIN public.festival_chest_number_controls c ON c.festival_id = f.id
  WHERE f.id = p_festival_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.regenerate_festival_chest_numbers_internal(
  p_festival_id uuid,
  p_actor_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(participant_count integer, category_range integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_root_id uuid;
  v_range integer;
  v_template text;
  v_active_only boolean;
  v_locked boolean;
  v_category_order_enabled boolean;
  v_category_order text[];
  v_invalid_count integer;
  v_oversized_key text;
  v_count integer;
  v_expected_count integer;
  v_category text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_festival_id::text),
    pg_catalog.hashtext('participant-chest-number')
  );

  SELECT tenant_id, chest_number_category_range, chest_number_template
  INTO v_tenant_id, v_range, v_template
  FROM public.festival_calendar
  WHERE id = p_festival_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Festival not found.'; END IF;

  v_active_only := v_template = 'team' AND v_range = 1000;
  SELECT COALESCE(c.locked, false)
  INTO v_locked
  FROM public.festival_calendar f
  LEFT JOIN public.festival_chest_number_controls c ON c.festival_id = f.id
  WHERE f.id = p_festival_id;
  IF v_active_only AND COALESCE(v_locked, false) THEN
    RAISE EXCEPTION 'Chest numbers are finally locked. Unlock with the tenant ID before changing them.'
      USING ERRCODE = '55000';
  END IF;

  IF v_active_only THEN
    SELECT organisation_id INTO v_root_id
    FROM public.tenants
    WHERE id = v_tenant_id;
    IF v_root_id IS NULL THEN RAISE EXCEPTION 'Festival owner organisation is missing.'; END IF;
  END IF;

  SELECT COALESCE(c.category_order_enabled, false), COALESCE(c.category_order, '{}'::text[])
  INTO v_category_order_enabled, v_category_order
  FROM public.festival_chest_number_controls c
  WHERE c.festival_id = p_festival_id;
  v_category_order_enabled := COALESCE(v_category_order_enabled, false);
  v_category_order := COALESCE(v_category_order, '{}'::text[]);

  IF v_template = 'team' THEN
    PERFORM public.ensure_festival_team_chest_slots(p_festival_id);

    SELECT pg_catalog.count(*)::integer INTO v_invalid_count
    FROM public.participants p
    WHERE p.festival_id = p_festival_id
      AND NOT EXISTS (
        SELECT 1 FROM public.festival_team_chest_slots s
        WHERE s.festival_id = p_festival_id AND s.organisation_id = p.organisation_id
      )
      AND NOT (
        v_active_only AND EXISTS (
          SELECT 1 FROM public.organisations o
          WHERE o.id = p.organisation_id
            AND o.parent_id = v_root_id
            AND o.archived_at IS NOT NULL
        )
      );
    IF v_invalid_count > 0 THEN
      IF v_active_only THEN
        RAISE EXCEPTION 'Cannot regenerate: % participant(s) are not assigned to a valid active team under this festival organisation.', v_invalid_count;
      ELSE
        RAISE EXCEPTION 'Cannot regenerate: % participant(s) are not assigned to a team under this festival organisation.', v_invalid_count;
      END IF;
    END IF;

    SELECT s.organisation_id::text INTO v_oversized_key
    FROM public.participants p
    JOIN public.festival_team_chest_slots s
      ON s.festival_id = p_festival_id AND s.organisation_id = p.organisation_id
    WHERE p.festival_id = p_festival_id
      AND (NOT v_active_only OR EXISTS (
        SELECT 1 FROM public.organisations o
        WHERE o.id = p.organisation_id
          AND o.parent_id = v_root_id
          AND o.archived_at IS NULL
      ))
    GROUP BY s.organisation_id
    HAVING pg_catalog.count(*) > v_range
    LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN
      RAISE EXCEPTION 'Team % exceeds the configured chest-number capacity (%).', v_oversized_key, v_range;
    END IF;
  ELSE
    SELECT pg_catalog.count(*)::integer INTO v_invalid_count
    FROM public.participants p
    WHERE p.festival_id = p_festival_id
      AND (p.category_code IS NULL OR pg_catalog.btrim(p.category_code) = '');
    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot regenerate: % participant(s) do not have a category.', v_invalid_count;
    END IF;

    SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code)) INTO v_oversized_key
    FROM public.participants p
    WHERE p.festival_id = p_festival_id
    GROUP BY pg_catalog.lower(pg_catalog.btrim(p.category_code))
    HAVING pg_catalog.count(*) > v_range
    LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN
      RAISE EXCEPTION 'Category % exceeds the configured chest-number capacity (%).', v_oversized_key, v_range;
    END IF;
  END IF;

  IF v_template = 'team' AND v_range = 1000 THEN
    FOR v_category IN
      SELECT pg_catalog.lower(pg_catalog.btrim(fc.code))
      FROM public.festival_categories fc
      WHERE fc.festival_id = p_festival_id AND pg_catalog.btrim(COALESCE(fc.code, '')) <> ''
      UNION
      SELECT DISTINCT pg_catalog.lower(pg_catalog.btrim(p.category_code))
      FROM public.participants p
      WHERE p.festival_id = p_festival_id
    LOOP
      PERFORM public.festival_team_category_chest_slot(p_festival_id, v_category);
    END LOOP;

    SELECT p.organisation_id::text || ':' || pg_catalog.lower(pg_catalog.btrim(p.category_code))
    INTO v_oversized_key
    FROM public.participants p
    WHERE p.festival_id = p_festival_id
      AND (NOT v_active_only OR EXISTS (
        SELECT 1 FROM public.organisations o
        WHERE o.id = p.organisation_id
          AND o.parent_id = v_root_id
          AND o.archived_at IS NULL
      ))
    GROUP BY p.organisation_id, pg_catalog.lower(pg_catalog.btrim(p.category_code))
    HAVING pg_catalog.count(*) > 100
    LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN
      RAISE EXCEPTION 'Team/category % exceeds 100 participants.', v_oversized_key;
    END IF;
  END IF;

  DROP TABLE IF EXISTS pg_temp.chest_number_plan;
  CREATE TEMP TABLE pg_temp.chest_number_plan(
    participant_id uuid PRIMARY KEY,
    new_chest_number text NOT NULL UNIQUE
  ) ON COMMIT DROP;

  IF v_template = 'team' THEN
    INSERT INTO pg_temp.chest_number_plan(participant_id, new_chest_number)
    SELECT p.id,
      ((s.slot_number * v_range)
        + CASE WHEN v_range = 1000 THEN cs.slot_number * 100 ELSE 0 END
        + pg_catalog.row_number() OVER (
          PARTITION BY p.organisation_id,
            CASE WHEN v_range = 1000 THEN pg_catalog.lower(pg_catalog.btrim(p.category_code)) ELSE '' END
          ORDER BY
            CASE WHEN v_category_order_enabled
              THEN pg_catalog.array_position(v_category_order, pg_catalog.lower(pg_catalog.btrim(p.category_code)))
            END NULLS LAST,
            CASE WHEN v_category_order_enabled THEN fc.sort_order END NULLS LAST,
            CASE WHEN v_category_order_enabled THEN pg_catalog.lower(pg_catalog.btrim(p.category_code)) END NULLS LAST,
            NULLIF(pg_catalog.regexp_replace(COALESCE(p.chest_number, ''), '[^0-9]', '', 'g'), '')::numeric NULLS LAST,
            pg_catalog.lower(p.name), p.id
        ) - 1
      )::text
    FROM public.participants p
    JOIN public.festival_team_chest_slots s
      ON s.festival_id = p_festival_id AND s.organisation_id = p.organisation_id
    LEFT JOIN public.festival_team_category_chest_slots cs
      ON v_range = 1000 AND cs.festival_id = p_festival_id
      AND cs.category_code = pg_catalog.lower(pg_catalog.btrim(p.category_code))
    LEFT JOIN LATERAL (
      SELECT pg_catalog.min(x.sort_order) AS sort_order
      FROM public.festival_categories x
      WHERE x.festival_id = p_festival_id
        AND pg_catalog.lower(pg_catalog.btrim(x.code)) = pg_catalog.lower(pg_catalog.btrim(p.category_code))
    ) fc ON true
    WHERE p.festival_id = p_festival_id
      AND (NOT v_active_only OR EXISTS (
        SELECT 1 FROM public.organisations o
        WHERE o.id = p.organisation_id
          AND o.parent_id = v_root_id
          AND o.archived_at IS NULL
      ));
  ELSE
    INSERT INTO pg_temp.chest_number_plan(participant_id, new_chest_number)
    WITH category_codes AS (
      SELECT pg_catalog.lower(pg_catalog.btrim(fc.code)) AS category_code
      FROM public.festival_categories fc
      WHERE fc.festival_id = p_festival_id AND pg_catalog.btrim(COALESCE(fc.code, '')) <> ''
      UNION
      SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code))
      FROM public.participants p
      WHERE p.festival_id = p_festival_id
    ), category_order AS (
      SELECT codes.category_code,
        pg_catalog.row_number() OVER (ORDER BY fc.sort_order NULLS LAST, codes.category_code) AS category_position
      FROM category_codes codes
      LEFT JOIN LATERAL (
        SELECT pg_catalog.min(fc.sort_order) AS sort_order
        FROM public.festival_categories fc
        WHERE fc.festival_id = p_festival_id
          AND pg_catalog.lower(pg_catalog.btrim(fc.code)) = codes.category_code
      ) fc ON true
    )
    SELECT p.id,
      ((co.category_position * v_range)
        + pg_catalog.row_number() OVER (
          PARTITION BY pg_catalog.lower(pg_catalog.btrim(p.category_code))
          ORDER BY
            NULLIF(pg_catalog.regexp_replace(COALESCE(p.chest_number, ''), '[^0-9]', '', 'g'), '')::numeric NULLS LAST,
            pg_catalog.lower(p.name), p.id
        ) - 1
      )::text
    FROM public.participants p
    JOIN category_order co ON co.category_code = pg_catalog.lower(pg_catalog.btrim(p.category_code))
    WHERE p.festival_id = p_festival_id;
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_expected_count
  FROM public.participants p
  WHERE p.festival_id = p_festival_id
    AND (NOT v_active_only OR EXISTS (
      SELECT 1 FROM public.festival_team_chest_slots s
      WHERE s.festival_id = p_festival_id AND s.organisation_id = p.organisation_id
    ));
  SELECT pg_catalog.count(*)::integer INTO v_count FROM pg_temp.chest_number_plan;
  IF v_count IS DISTINCT FROM v_expected_count THEN
    IF v_active_only THEN
      RAISE EXCEPTION 'Cannot regenerate: the numbering plan does not cover every eligible participant (% of %).', v_count, v_expected_count;
    ELSE
      RAISE EXCEPTION 'Cannot regenerate: the numbering plan does not cover every participant (% of %).', v_count, v_expected_count;
    END IF;
  END IF;

  UPDATE public.participants p
  SET chest_number = CASE
    WHEN v_active_only AND NOT EXISTS (
      SELECT 1 FROM public.festival_team_chest_slots s
      WHERE s.festival_id = p_festival_id AND s.organisation_id = p.organisation_id
    ) THEN NULL
    ELSE '__regen__' || p.id::text
  END
  WHERE p.festival_id = p_festival_id;

  UPDATE public.participants p
  SET chest_number = plan.new_chest_number
  FROM pg_temp.chest_number_plan plan
  WHERE p.id = plan.participant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count IS DISTINCT FROM v_expected_count THEN
    IF v_active_only THEN
      RAISE EXCEPTION 'Cannot regenerate: only % of % eligible participants were updated.', v_count, v_expected_count;
    ELSE
      RAISE EXCEPTION 'Cannot regenerate: only % of % participants were updated.', v_count, v_expected_count;
    END IF;
  END IF;

  INSERT INTO public.chest_number_regeneration_audits(
    tenant_id, festival_id, category_range, participant_count, regenerated_by, chest_number_template
  ) VALUES (v_tenant_id, p_festival_id, v_range, v_count, p_actor_id, v_template);

  RETURN QUERY SELECT v_count, v_range;
END;
$function$;

-- Take the same festival locks as ordering/regeneration before the archive RPC
-- obtains a row lock. This preserves a consistent lock order and honors final
-- chest-number locks for the 1000-number model.
CREATE OR REPLACE FUNCTION public._lock_active_1000_team_chest_numbers_for_org(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_festival_id uuid;
  v_locked boolean;
BEGIN
  SELECT o.tenant_id INTO v_tenant_id
  FROM public.organisations o
  WHERE o.id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found.'; END IF;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  FOR v_festival_id IN
    SELECT f.id
    FROM public.festival_calendar f
    WHERE f.tenant_id = v_tenant_id
      AND f.chest_number_template = 'team'
      AND f.chest_number_category_range = 1000
    ORDER BY f.id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(v_festival_id::text),
      pg_catalog.hashtext('participant-chest-number')
    );
    SELECT COALESCE(c.locked, false) INTO v_locked
    FROM public.festival_calendar f
    LEFT JOIN public.festival_chest_number_controls c ON c.festival_id = f.id
    WHERE f.id = v_festival_id;
    IF COALESCE(v_locked, false) THEN
      RAISE EXCEPTION 'Chest numbers are finally locked. Unlock with the tenant ID before archiving or restoring this team.'
        USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$function$;
ALTER FUNCTION public._lock_active_1000_team_chest_numbers_for_org(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._lock_active_1000_team_chest_numbers_for_org(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._regenerate_active_1000_team_chest_numbers_for_org(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_festival_id uuid;
BEGIN
  SELECT o.tenant_id INTO v_tenant_id
  FROM public.organisations o
  WHERE o.id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found.'; END IF;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  FOR v_festival_id IN
    SELECT f.id
    FROM public.festival_calendar f
    WHERE f.tenant_id = v_tenant_id
      AND f.chest_number_template = 'team'
      AND f.chest_number_category_range = 1000
    ORDER BY f.id
  LOOP
    PERFORM public.regenerate_festival_chest_numbers_internal(v_festival_id, auth.uid());
    INSERT INTO public.festival_chest_number_controls(festival_id, revision, updated_by)
    VALUES (v_festival_id, 1, auth.uid())
    ON CONFLICT (festival_id) DO UPDATE
      SET revision = festival_chest_number_controls.revision + 1,
          updated_by = auth.uid(),
          updated_at = now();
  END LOOP;
END;
$function$;
ALTER FUNCTION public._regenerate_active_1000_team_chest_numbers_for_org(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._regenerate_active_1000_team_chest_numbers_for_org(uuid) FROM PUBLIC, anon, authenticated;

-- The existing organisations UPDATE grant includes archived_at. For tenants
-- using this allocation model, require the ordered archive/restore RPC path
-- so raw updates cannot skip slot reconciliation or its advisory locks.
CREATE OR REPLACE FUNCTION public.guard_organisation_archive_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF OLD.archived_at IS NOT DISTINCT FROM NEW.archived_at THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.festival_calendar f
    WHERE f.tenant_id IN (OLD.tenant_id, NEW.tenant_id)
      AND f.chest_number_template = 'team'
      AND f.chest_number_category_range = 1000
  ) AND pg_catalog.current_setting('app.allow_organisation_archive_status_change', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use the archive or restore operation to change this team status so chest numbers can be reconciled safely.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.guard_organisation_archive_status_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_organisation_archive_status_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_organisation_archive_status_change
BEFORE UPDATE OF archived_at ON public.organisations
FOR EACH ROW
EXECUTE FUNCTION public.guard_organisation_archive_status_change();

CREATE OR REPLACE FUNCTION public.archive_child_organisation(p_org_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_current_tenant_id uuid;
  v_was_archived boolean;
  v_archived_at timestamptz;
BEGIN
  PERFORM public._assert_organisation_hierarchy_access(p_org_id);

  SELECT o.tenant_id, o.archived_at IS NOT NULL
  INTO v_tenant_id, v_was_archived
  FROM public.organisations o
  WHERE o.id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  IF v_was_archived THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'org_id', p_org_id, 'state', 'archived',
      'message', 'Organisation was already archived'
    );
  END IF;

  PERFORM public._lock_active_1000_team_chest_numbers_for_org(p_org_id);

  SELECT o.tenant_id, o.archived_at IS NOT NULL
  INTO v_current_tenant_id, v_was_archived
  FROM public.organisations o
  WHERE o.id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  IF v_current_tenant_id IS DISTINCT FROM v_tenant_id THEN
    RAISE EXCEPTION 'Organisation ownership changed. Retry the archive operation.' USING ERRCODE = '40001';
  END IF;
  IF v_was_archived THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'org_id', p_org_id, 'state', 'archived',
      'message', 'Organisation was already archived'
    );
  END IF;

  PERFORM pg_catalog.set_config('app.allow_organisation_archive_status_change', 'on', true);
  UPDATE public.organisations
  SET archived_at = now()
  WHERE id = p_org_id
  RETURNING archived_at INTO v_archived_at;

  PERFORM public._regenerate_active_1000_team_chest_numbers_for_org(p_org_id);

  INSERT INTO public.tenant_access_audit_logs(
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(),
    CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'tenant_admin' END,
    v_tenant_id, p_org_id,
    'child_organisation_archived', p_reason,
    pg_catalog.jsonb_build_object('archived_at', NULL),
    pg_catalog.jsonb_build_object('archived_at', v_archived_at),
    true
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'org_id', p_org_id,
    'state', 'archived',
    'message', 'Organisation archived. Participant, registration, result and festival history are preserved.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_child_organisation(p_org_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_current_tenant_id uuid;
  v_was_archived boolean;
BEGIN
  PERFORM public._assert_organisation_hierarchy_access(p_org_id);

  SELECT o.tenant_id, o.archived_at IS NOT NULL
  INTO v_tenant_id, v_was_archived
  FROM public.organisations o
  WHERE o.id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  IF NOT v_was_archived THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'org_id', p_org_id, 'state', 'active',
      'message', 'Organisation was not archived'
    );
  END IF;

  PERFORM public._lock_active_1000_team_chest_numbers_for_org(p_org_id);

  SELECT o.tenant_id, o.archived_at IS NOT NULL
  INTO v_current_tenant_id, v_was_archived
  FROM public.organisations o
  WHERE o.id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  IF v_current_tenant_id IS DISTINCT FROM v_tenant_id THEN
    RAISE EXCEPTION 'Organisation ownership changed. Retry the restore operation.' USING ERRCODE = '40001';
  END IF;
  IF NOT v_was_archived THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'org_id', p_org_id, 'state', 'active',
      'message', 'Organisation was not archived'
    );
  END IF;

  PERFORM pg_catalog.set_config('app.allow_organisation_archive_status_change', 'on', true);
  UPDATE public.organisations
  SET archived_at = NULL
  WHERE id = p_org_id;

  PERFORM public._regenerate_active_1000_team_chest_numbers_for_org(p_org_id);

  INSERT INTO public.tenant_access_audit_logs(
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(),
    CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'tenant_admin' END,
    v_tenant_id, p_org_id,
    'child_organisation_restored', p_reason,
    pg_catalog.jsonb_build_object('archived_at', v_was_archived),
    pg_catalog.jsonb_build_object('archived_at', NULL),
    true
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'org_id', p_org_id,
    'state', 'active',
    'message', 'Organisation restored and visible again.'
  );
END;
$function$;

-- Compact existing 1000-model assignments once. Chest-number changes are
-- audited by the existing regeneration audit table; the 100-number model is
-- intentionally excluded from this backfill.
DO $migration$
DECLARE
  v_festival_id uuid;
  v_locked_festival uuid;
BEGIN
  FOR v_festival_id IN
    SELECT f.id
    FROM public.festival_calendar f
    WHERE f.chest_number_template = 'team'
      AND f.chest_number_category_range = 1000
    ORDER BY f.id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(v_festival_id::text),
      pg_catalog.hashtext('participant-chest-number')
    );
  END LOOP;

  SELECT f.id INTO v_locked_festival
  FROM public.festival_calendar f
  JOIN public.tenants t ON t.id = f.tenant_id
  JOIN public.festival_chest_number_controls c ON c.festival_id = f.id AND c.locked
  WHERE f.chest_number_template = 'team'
    AND f.chest_number_category_range = 1000
    AND (
      EXISTS (
        SELECT 1
        FROM public.festival_team_chest_slots s
        JOIN public.organisations o ON o.id = s.organisation_id
        WHERE s.festival_id = f.id
          AND (o.parent_id IS DISTINCT FROM t.organisation_id OR o.archived_at IS NOT NULL)
      )
      OR EXISTS (
        SELECT 1
        FROM public.participants p
        JOIN public.organisations o ON o.id = p.organisation_id
        WHERE p.festival_id = f.id
          AND o.parent_id = t.organisation_id
          AND o.archived_at IS NOT NULL
          AND p.chest_number IS NOT NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public.organisations o
        WHERE o.parent_id = t.organisation_id
          AND o.archived_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.festival_team_chest_slots s
            WHERE s.festival_id = f.id AND s.organisation_id = o.id
          )
      )
      OR EXISTS (
        SELECT 1
        FROM (
          SELECT s.slot_number,
            pg_catalog.row_number() OVER (ORDER BY s.slot_number, o.created_at, o.id)::integer AS expected_slot
          FROM public.festival_team_chest_slots s
          JOIN public.organisations o ON o.id = s.organisation_id
          WHERE s.festival_id = f.id
            AND o.parent_id = t.organisation_id
            AND o.archived_at IS NULL
        ) active_slots
        WHERE active_slots.slot_number IS DISTINCT FROM active_slots.expected_slot
      )
    )
  ORDER BY f.id
  LIMIT 1;

  IF v_locked_festival IS NOT NULL THEN
    RAISE EXCEPTION 'Unlock 1000-model chest numbers for festival % before applying active-team chest allocation.', v_locked_festival
      USING ERRCODE = '55000';
  END IF;

  FOR v_festival_id IN
    SELECT f.id
    FROM public.festival_calendar f
    LEFT JOIN public.festival_chest_number_controls c ON c.festival_id = f.id
    WHERE f.chest_number_template = 'team'
      AND f.chest_number_category_range = 1000
      AND NOT COALESCE(c.locked, false)
    ORDER BY f.id
  LOOP
    PERFORM public.regenerate_festival_chest_numbers_internal(v_festival_id, NULL);
    INSERT INTO public.festival_chest_number_controls(festival_id, revision, updated_by)
    VALUES (v_festival_id, 1, NULL)
    ON CONFLICT (festival_id) DO UPDATE
      SET revision = festival_chest_number_controls.revision + 1,
          updated_by = NULL,
          updated_at = now();
  END LOOP;
END;
$migration$;

COMMIT;
