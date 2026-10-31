-- Sub-stages are an optional schedule snapshot. Existing schedules keep the
-- original single-stage workflow. The latest edited snapshot for a category
-- supplies defaults only to schedules created later.
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS substage_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS substage_config_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS substage_checkin_started_at timestamptz;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS checkin_cancelled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.schedule_substage_submissions (
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  stage_id text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, stage_id)
);
ALTER TABLE public.schedule_substage_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schedule_substage_submissions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_schedule_substages()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_item public.items%ROWTYPE;
  v_stage jsonb;
  v_range jsonb;
  v_from bigint;
  v_to bigint;
  v_ranges int8range[] := ARRAY[]::int8range[];
  v_existing int8range;
  v_ids text[] := ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(NEW.substage_config) <> 'array' THEN
    RAISE EXCEPTION 'Sub-stage configuration must be an array.' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.substage_config IS NOT DISTINCT FROM OLD.substage_config
      AND NEW.item_id IS NOT DISTINCT FROM OLD.item_id
      AND NEW.festival_id IS NOT DISTINCT FROM OLD.festival_id
      AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN
      RETURN NEW;
    END IF;
    IF OLD.substage_checkin_started_at IS NOT NULL OR coalesce(OLD.is_shuffle_locked, false)
      OR EXISTS (SELECT 1 FROM public.registrations r WHERE r.festival_id = OLD.festival_id
        AND r.item_id = OLD.item_id AND (r.is_verified OR r.code_letter IS NOT NULL)) THEN
      RAISE EXCEPTION 'Sub-stages cannot change after check-in or code letters begin.' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF jsonb_array_length(NEW.substage_config) = 0 THEN
    NEW.substage_config_updated_at := now();
    RETURN NEW;
  END IF;
  SELECT * INTO v_item FROM public.items WHERE id = NEW.item_id
    AND festival_id = NEW.festival_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND OR lower(coalesce(v_item.participation_type, '')) <> 'individual'
      OR cardinality(coalesce(v_item.category_codes, ARRAY[]::text[])) <> 1
      OR EXISTS (SELECT 1 FROM unnest(coalesce(v_item.category_codes, ARRAY[]::text[])) code
        WHERE upper(btrim(code)) IN ('GN', 'GENERAL')) THEN
    RAISE EXCEPTION 'Sub-stages are only available for category individual competitions.' USING ERRCODE = '22023';
  END IF;
  FOR v_stage IN SELECT value FROM jsonb_array_elements(NEW.substage_config) LOOP
    IF nullif(btrim(v_stage->>'id'), '') IS NULL OR nullif(btrim(v_stage->>'name'), '') IS NULL
       OR v_stage->>'id' = ANY(v_ids) OR jsonb_typeof(v_stage->'ranges') <> 'array'
       OR jsonb_array_length(v_stage->'ranges') = 0 THEN
      RAISE EXCEPTION 'Each sub-stage needs a unique ID, name and ranges.' USING ERRCODE = '22023';
    END IF;
    v_ids := array_append(v_ids, v_stage->>'id');
    FOR v_range IN SELECT value FROM jsonb_array_elements(v_stage->'ranges') LOOP
      IF jsonb_typeof(v_range) <> 'object' OR (v_range->>'from') IS NULL
         OR (v_range->>'to') IS NULL OR (v_range->>'from') !~ '^[0-9]+$'
         OR (v_range->>'to') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Chest-number ranges must contain whole numbers.' USING ERRCODE = '22023';
      END IF;
      v_from := (v_range->>'from')::bigint;
      v_to := (v_range->>'to')::bigint;
      IF v_from > v_to OR v_to = 9223372036854775807 THEN
        RAISE EXCEPTION 'Invalid chest-number range.' USING ERRCODE = '22023';
      END IF;
      FOREACH v_existing IN ARRAY v_ranges LOOP
        IF v_existing && int8range(v_from, v_to + 1, '[)') THEN
          RAISE EXCEPTION 'Sub-stage chest-number ranges overlap.' USING ERRCODE = '22023';
        END IF;
      END LOOP;
      v_ranges := array_append(v_ranges, int8range(v_from, v_to + 1, '[)'));
    END LOOP;
  END LOOP;
  NEW.substage_config_updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_schedule_substages_trigger ON public.schedules;
CREATE TRIGGER validate_schedule_substages_trigger
BEFORE INSERT OR UPDATE OF substage_config, item_id, festival_id, tenant_id ON public.schedules
FOR EACH ROW EXECUTE FUNCTION public.validate_schedule_substages();

CREATE OR REPLACE FUNCTION public.mark_substage_checkin_started()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.is_verified IS TRUE AND OLD.is_verified IS DISTINCT FROM TRUE THEN
    IF EXISTS (SELECT 1 FROM public.schedules s
      JOIN public.registrations r ON r.festival_id = s.festival_id AND r.item_id = s.item_id
      LEFT JOIN public.participants p ON p.id = r.participant_id
      WHERE s.festival_id = NEW.festival_id AND s.item_id = NEW.item_id
        AND pg_catalog.jsonb_array_length(s.substage_config) > 0 AND r.status <> 'rejected'
        AND public.schedule_substage_for_chest(s.substage_config, p.chest_number) IS NULL) THEN
      RAISE EXCEPTION 'Assign every registered chest number to a sub-stage before check-in.' USING ERRCODE = '55000';
    END IF;
    UPDATE public.schedules s SET substage_checkin_started_at = now()
    WHERE s.festival_id = NEW.festival_id AND s.item_id = NEW.item_id
      AND s.substage_checkin_started_at IS NULL
      AND jsonb_array_length(s.substage_config) > 0;
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    DELETE FROM public.schedule_substage_submissions sub
    WHERE EXISTS (SELECT 1 FROM public.schedules s
      LEFT JOIN public.participants p ON p.id = NEW.participant_id
      WHERE sub.schedule_id = s.id AND s.festival_id = NEW.festival_id AND s.item_id = NEW.item_id
        AND sub.stage_id = coalesce(public.schedule_substage_for_chest(s.substage_config, p.chest_number), ''));
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.clear_checkin_cancellation_on_verify()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.is_verified IS TRUE THEN NEW.checkin_cancelled := false; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clear_checkin_cancellation_on_verify_trigger ON public.registrations;
CREATE TRIGGER clear_checkin_cancellation_on_verify_trigger
BEFORE UPDATE OF is_verified ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.clear_checkin_cancellation_on_verify();
DROP TRIGGER IF EXISTS mark_substage_checkin_started_trigger ON public.registrations;
CREATE TRIGGER mark_substage_checkin_started_trigger
AFTER UPDATE OF is_verified ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.mark_substage_checkin_started();

CREATE OR REPLACE FUNCTION public.prevent_checked_in_substage_chest_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.chest_number IS DISTINCT FROM OLD.chest_number AND EXISTS (
    SELECT 1 FROM public.registrations r
    JOIN public.schedules s ON s.festival_id = r.festival_id AND s.item_id = r.item_id
    WHERE r.participant_id = OLD.id AND s.substage_checkin_started_at IS NOT NULL
      AND jsonb_array_length(s.substage_config) > 0
  ) THEN
    RAISE EXCEPTION 'Chest number cannot change after check-in begins for a sub-stage competition.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prevent_checked_in_substage_chest_change_trigger ON public.participants;
CREATE TRIGGER prevent_checked_in_substage_chest_change_trigger
BEFORE UPDATE OF chest_number ON public.participants
FOR EACH ROW EXECUTE FUNCTION public.prevent_checked_in_substage_chest_change();

CREATE OR REPLACE FUNCTION public.prevent_late_substage_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.festival_id, NEW.item_id, NEW.participant_id) IS NOT DISTINCT FROM
       (OLD.festival_id, OLD.item_id, OLD.participant_id) THEN RETURN NEW; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedules s
    WHERE s.festival_id = NEW.festival_id AND s.item_id = NEW.item_id
      AND s.substage_checkin_started_at IS NOT NULL
      AND pg_catalog.jsonb_array_length(s.substage_config) > 0) THEN
    RAISE EXCEPTION 'Competition entry cannot change after sub-stage check-in begins.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prevent_late_substage_entry_trigger ON public.registrations;
CREATE TRIGGER prevent_late_substage_entry_trigger
BEFORE INSERT OR UPDATE OF festival_id, item_id, participant_id ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.prevent_late_substage_entry();

-- Scoped detail reads avoid widening the existing stage schedule RPC return
-- types, which are shared by dashboard and legacy check-in consumers.
CREATE OR REPLACE FUNCTION public.get_admin_schedule_substages(p_schedule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_tenant uuid;
  v_config jsonb;
BEGIN
  v_tenant := public.stage_assert_admin_access();
  SELECT s.substage_config INTO v_config FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside the current tenant.' USING ERRCODE = '42501'; END IF;
  RETURN v_config;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_schedule_substages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_schedule_substages(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_venue_schedule_substages(p_venue_id uuid, p_pin text, p_schedule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_error text;
  v_config jsonb;
BEGIN
  v_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_error IS NOT NULL THEN RAISE EXCEPTION 'Invalid stage access.' USING ERRCODE = '42501'; END IF;
  SELECT s.substage_config INTO v_config FROM public.schedules s
  JOIN public.venues v ON v.id = s.venue_id AND v.tenant_id = s.tenant_id AND v.festival_id = s.festival_id
  WHERE s.id = p_schedule_id AND s.venue_id = p_venue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  RETURN v_config;
END;
$$;
REVOKE ALL ON FUNCTION public.get_venue_schedule_substages(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_schedule_substages(uuid, text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.schedule_substage_for_chest(p_config jsonb, p_chest text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT stage->>'id'
  FROM pg_catalog.jsonb_array_elements(p_config) AS stages(stage)
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(stage->'ranges') AS ranges(range)
  WHERE (CASE WHEN p_chest ~ '^[0-9]+$' THEN p_chest::numeric END)
    BETWEEN (range->>'from')::numeric AND (range->>'to')::numeric
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION stage_portal_private.checkin_state(p_schedule_id uuid, p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_schedule public.schedules%ROWTYPE;
BEGIN
  SELECT * INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  RETURN pg_catalog.jsonb_build_object(
    'cancelled_ids', COALESCE((SELECT pg_catalog.jsonb_agg(r.id) FROM public.registrations r
      WHERE r.festival_id = v_schedule.festival_id AND r.item_id = v_schedule.item_id
        AND r.checkin_cancelled IS TRUE AND r.status <> 'rejected'
        AND (r.tenant_id = p_tenant_id OR r.organisation_id IN
          (SELECT visible.id FROM public.get_visible_organisations(p_tenant_id) visible))), '[]'::jsonb),
    'submitted_stage_ids', COALESCE((SELECT pg_catalog.jsonb_agg(sub.stage_id)
      FROM public.schedule_substage_submissions sub WHERE sub.schedule_id = p_schedule_id), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION stage_portal_private.checkin_state(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_admin_schedule_checkin_state(p_schedule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.stage_assert_admin_access();
  RETURN stage_portal_private.checkin_state(p_schedule_id, v_tenant);
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_schedule_checkin_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_schedule_checkin_state(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_venue_schedule_checkin_state(p_venue_id uuid, p_pin text, p_schedule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_error text; v_tenant uuid;
BEGIN
  v_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_error IS NOT NULL THEN RAISE EXCEPTION 'Invalid stage access.' USING ERRCODE = '42501'; END IF;
  SELECT v.tenant_id INTO v_tenant FROM public.venues v
  JOIN public.schedules s ON s.venue_id = v.id AND s.festival_id = v.festival_id
    AND s.tenant_id = v.tenant_id WHERE v.id = p_venue_id AND s.id = p_schedule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  RETURN stage_portal_private.checkin_state(p_schedule_id, v_tenant);
END;
$$;
REVOKE ALL ON FUNCTION public.get_venue_schedule_checkin_state(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_schedule_checkin_state(uuid, text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION stage_portal_private.apply_checkin_action(
  p_schedule_id uuid, p_tenant_id uuid, p_stage_id text, p_action text, p_registration_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_schedule public.schedules%ROWTYPE;
  v_stage_id text := coalesce(p_stage_id, '');
  v_count integer := 0;
BEGIN
  SELECT * INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF coalesce(v_schedule.is_shuffle_locked, false) THEN
    RAISE EXCEPTION 'This event is locked.' USING ERRCODE = '55000';
  END IF;
  IF pg_catalog.jsonb_array_length(v_schedule.substage_config) = 0 THEN
    IF v_stage_id <> '' THEN RAISE EXCEPTION 'This schedule has no sub-stages.' USING ERRCODE = '22023'; END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_schedule.substage_config) stage
    WHERE stage->>'id' = v_stage_id) THEN
    RAISE EXCEPTION 'Unknown sub-stage.' USING ERRCODE = '22023';
  END IF;
  IF p_action NOT IN ('cancel_one', 'cancel_remaining', 'submit') THEN
    RAISE EXCEPTION 'Unsupported check-in action.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_array_length(v_schedule.substage_config) > 0 AND EXISTS (
    SELECT 1 FROM public.registrations r LEFT JOIN public.participants p ON p.id = r.participant_id
    WHERE r.festival_id = v_schedule.festival_id AND r.item_id = v_schedule.item_id
      AND r.status <> 'rejected'
      AND public.schedule_substage_for_chest(v_schedule.substage_config, p.chest_number) IS NULL
  ) THEN
    RAISE EXCEPTION 'Assign every registered chest number to a sub-stage before check-in.' USING ERRCODE = '55000';
  END IF;
  IF p_action = 'cancel_one' AND p_registration_id IS NULL THEN
    RAISE EXCEPTION 'Registration is required.' USING ERRCODE = '22023';
  END IF;

  IF p_action IN ('cancel_one', 'cancel_remaining') THEN
    UPDATE public.registrations r SET checkin_cancelled = true
    WHERE r.festival_id = v_schedule.festival_id
      AND r.item_id = v_schedule.item_id AND r.status <> 'rejected'
      AND r.is_verified IS NOT TRUE AND r.checkin_cancelled IS NOT TRUE
      AND (p_action = 'cancel_remaining' OR r.id = p_registration_id)
      AND (r.tenant_id = p_tenant_id OR r.organisation_id IN
        (SELECT visible.id FROM public.get_visible_organisations(p_tenant_id) visible))
      AND (v_stage_id = '' OR EXISTS (SELECT 1 FROM public.participants participant
        WHERE participant.id = r.participant_id AND public.schedule_substage_for_chest(v_schedule.substage_config, participant.chest_number) = v_stage_id));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF p_action = 'cancel_one' AND v_count = 0 THEN
      RAISE EXCEPTION 'Entry is already verified, cancelled or outside this sub-stage.' USING ERRCODE = '55000';
    END IF;
    IF v_count > 0 AND pg_catalog.jsonb_array_length(v_schedule.substage_config) > 0 THEN
      UPDATE public.schedules SET substage_checkin_started_at = coalesce(substage_checkin_started_at, now())
      WHERE id = p_schedule_id;
    END IF;
    DELETE FROM public.schedule_substage_submissions
    WHERE schedule_id = p_schedule_id AND stage_id = v_stage_id AND v_count > 0;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.festival_id = v_schedule.festival_id AND r.item_id = v_schedule.item_id
        AND r.status <> 'rejected' AND r.is_verified IS NOT TRUE AND r.checkin_cancelled IS NOT TRUE
        AND (r.tenant_id = p_tenant_id OR r.organisation_id IN
          (SELECT visible.id FROM public.get_visible_organisations(p_tenant_id) visible))
        AND (v_stage_id = '' OR EXISTS (SELECT 1 FROM public.participants participant
          WHERE participant.id = r.participant_id AND public.schedule_substage_for_chest(v_schedule.substage_config, participant.chest_number) = v_stage_id))
    ) THEN
      RAISE EXCEPTION 'Verify or cancel the remaining entries before submitting this sub-stage.' USING ERRCODE = '55000';
    END IF;
    INSERT INTO public.schedule_substage_submissions(schedule_id, stage_id)
    VALUES (p_schedule_id, v_stage_id)
    ON CONFLICT (schedule_id, stage_id) DO NOTHING;
    IF pg_catalog.jsonb_array_length(v_schedule.substage_config) > 0 THEN
      UPDATE public.schedules SET substage_checkin_started_at = coalesce(substage_checkin_started_at, now())
      WHERE id = p_schedule_id;
    END IF;
  END IF;
  RETURN pg_catalog.jsonb_build_object('changed', v_count, 'action', p_action, 'stage_id', v_stage_id);
END;
$$;
REVOKE ALL ON FUNCTION stage_portal_private.apply_checkin_action(uuid, uuid, text, text, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_schedule_checkin_action(
  p_schedule_id uuid, p_stage_id text, p_action text, p_registration_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.stage_assert_admin_access();
  RETURN stage_portal_private.apply_checkin_action(p_schedule_id, v_tenant, p_stage_id, p_action, p_registration_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_schedule_checkin_action(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_schedule_checkin_action(uuid, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.venue_schedule_checkin_action(
  p_venue_id uuid, p_pin text, p_schedule_id uuid, p_stage_id text, p_action text, p_registration_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_error text; v_tenant uuid;
BEGIN
  v_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_error IS NOT NULL THEN RAISE EXCEPTION 'Invalid stage access.' USING ERRCODE = '42501'; END IF;
  SELECT v.tenant_id INTO v_tenant FROM public.venues v JOIN public.schedules s
    ON s.venue_id = v.id AND s.festival_id = v.festival_id AND s.tenant_id = v.tenant_id
  WHERE v.id = p_venue_id AND s.id = p_schedule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  RETURN stage_portal_private.apply_checkin_action(p_schedule_id, v_tenant, p_stage_id, p_action, p_registration_id);
END;
$$;
REVOKE ALL ON FUNCTION public.venue_schedule_checkin_action(uuid, text, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_schedule_checkin_action(uuid, text, uuid, text, text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.require_substage_submissions_before_codes()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_schedule public.schedules%ROWTYPE;
BEGIN
  IF NEW.code_letter IS NULL OR NEW.code_letter IS NOT DISTINCT FROM OLD.code_letter THEN RETURN NEW; END IF;
  SELECT * INTO v_schedule FROM public.schedules s
  WHERE s.festival_id = NEW.festival_id AND s.item_id = NEW.item_id
    AND pg_catalog.jsonb_array_length(s.substage_config) > 0 LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.registrations r
    JOIN public.participants p ON p.id = r.participant_id
    WHERE r.festival_id = v_schedule.festival_id AND r.item_id = v_schedule.item_id
      AND r.status <> 'rejected'
      AND public.schedule_substage_for_chest(v_schedule.substage_config, p.chest_number) IS NULL) THEN
    RAISE EXCEPTION 'Every registered chest number must belong to a sub-stage before assigning code letters.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_schedule.substage_config) stage
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_substage_submissions sub
      WHERE sub.schedule_id = v_schedule.id AND sub.stage_id = stage->>'id')) THEN
    RAISE EXCEPTION 'Submit every sub-stage before assigning code letters.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS require_substage_submissions_before_codes_trigger ON public.registrations;
CREATE TRIGGER require_substage_submissions_before_codes_trigger
BEFORE UPDATE OF code_letter ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.require_substage_submissions_before_codes();

-- Retain the exact existing auth, PIN, tenant, lock and audit logic for verify
-- and unverify. Retire the check-in RPC's competition-level reject/restore
-- actions; Program management remains the owner of registration rejection.
DO $$
BEGIN
  IF to_regprocedure('public.stage_update_registration_checkin_legacy(uuid,uuid,text)') IS NULL THEN
    ALTER FUNCTION public.stage_update_registration(uuid, uuid, text)
      RENAME TO stage_update_registration_checkin_legacy;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.stage_update_registration_checkin_legacy(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.stage_update_registration(p_schedule_id uuid, p_registration_id uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_action NOT IN ('verify', 'unverify') THEN
    RAISE EXCEPTION 'Only verification actions are available in check-in.' USING ERRCODE = '22023';
  END IF;
  RETURN public.stage_update_registration_checkin_legacy(p_schedule_id, p_registration_id, p_action);
END;
$$;
REVOKE ALL ON FUNCTION public.stage_update_registration(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_update_registration(uuid, uuid, text) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.stage_venue_portal_update_registration_checkin_legacy(uuid,text,uuid,uuid,text)') IS NULL THEN
    ALTER FUNCTION public.stage_venue_portal_update_registration(uuid, text, uuid, uuid, text)
      RENAME TO stage_venue_portal_update_registration_checkin_legacy;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.stage_venue_portal_update_registration_checkin_legacy(uuid, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.stage_venue_portal_update_registration(
  p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_action NOT IN ('verify', 'unverify') THEN
    RAISE EXCEPTION 'Only verification actions are available in check-in.' USING ERRCODE = '22023';
  END IF;
  RETURN public.stage_venue_portal_update_registration_checkin_legacy(
    p_venue_id, p_pin, p_schedule_id, p_registration_id, p_action);
END;
$$;
REVOKE ALL ON FUNCTION public.stage_venue_portal_update_registration(uuid, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_update_registration(uuid, text, uuid, uuid, text)
  TO anon, authenticated, service_role;
