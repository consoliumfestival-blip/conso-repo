BEGIN;

-- The stage field already exists on items; constrain it to the values consumed
-- by the scheduling/public-result UI. Existing NULL values stay unchanged.
ALTER TABLE public.items
  ADD CONSTRAINT items_item_type_stage_check
  CHECK (item_type IS NULL OR item_type IN ('stage', 'offstage'));

ALTER TABLE public.items
  ADD COLUMN max_participants_per_team integer;

ALTER TABLE public.items
  ADD CONSTRAINT items_max_participants_per_team_check
  CHECK (max_participants_per_team IS NULL OR max_participants_per_team > 0);

ALTER TABLE public.items
  ADD CONSTRAINT items_max_participants_per_team_individual_check
  CHECK (max_participants_per_team IS NULL OR lower(COALESCE(participation_type, '')) = 'individual');

COMMENT ON COLUMN public.items.max_participants_per_team IS
  'Maximum active individual-item registrations per organisation; NULL means no limit. Group-item roster limits remain in group_min_members/group_max_members.';

CREATE INDEX registrations_item_team_limit_lookup
  ON public.registrations (festival_id, item_id, organisation_id)
  WHERE entry_kind = 'participant';

-- Preserve the old RPC signature for older app versions. The new overload
-- updates stage/limit settings in the same transaction as the existing
-- concurrency-checked item metadata update.
CREATE FUNCTION public.update_competition_item(
  p_festival_id uuid,
  p_item_id uuid,
  p_item_name_ml text,
  p_category_codes text[],
  p_group_member_count integer,
  p_item_type text,
  p_max_participants_per_team integer,
  p_expected_updated_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, scoring_private
AS $$
DECLARE
  v_participation_type text;
BEGIN
  IF p_item_type IS NOT NULL AND p_item_type NOT IN ('stage', 'offstage') THEN
    RAISE EXCEPTION 'Choose On Stage or Off Stage.';
  END IF;
  IF p_max_participants_per_team IS NOT NULL AND p_max_participants_per_team < 1 THEN
    RAISE EXCEPTION 'Enter a positive participant limit.';
  END IF;

  PERFORM public.update_competition_item(
    p_festival_id,
    p_item_id,
    p_item_name_ml,
    p_category_codes,
    p_group_member_count,
    p_expected_updated_at
  );

  SELECT lower(btrim(participation_type))
    INTO v_participation_type
  FROM public.items
  WHERE id = p_item_id AND festival_id = p_festival_id;
  IF v_participation_type = 'group' AND p_max_participants_per_team IS NOT NULL THEN
    RAISE EXCEPTION 'Participant limit is only available for individual items.';
  END IF;

  UPDATE public.items
  SET item_type = p_item_type,
      max_participants_per_team = p_max_participants_per_team,
      updated_at = clock_timestamp()
  WHERE id = p_item_id
    AND festival_id = p_festival_id
    AND tenant_id = (SELECT tenant_id FROM public.festival_calendar WHERE id = p_festival_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_competition_item(uuid, uuid, text, text[], integer, text, integer, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_competition_item(uuid, uuid, text, text[], integer, text, integer, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.update_competition_item(uuid, uuid, text, text[], integer, text, integer, timestamptz) IS
  'Updates tenant-owned item metadata with optimistic concurrency, stage type, and an optional per-team individual participant limit. NULL means no limit.';

-- Persist stage/limit fields for newly created tenant-owned custom items too.
CREATE OR REPLACE FUNCTION public.apply_competition_item_changes(
  p_festival_id uuid,
  p_activate_codes text[],
  p_deactivate_codes text[],
  p_records jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, scoring_private
AS $$
DECLARE
  owner uuid;
  code text;
  rec jsonb;
  rec_limit integer;
  rec_type text;
  rec_participation text;
BEGIN
  SELECT tenant_id INTO owner
  FROM public.festival_calendar
  WHERE id = p_festival_id;
  IF owner IS NULL THEN RAISE EXCEPTION 'Festival not found.'; END IF;
  PERFORM scoring_private.assert_admin(owner);

  IF p_activate_codes IS NULL OR p_deactivate_codes IS NULL
     OR COALESCE(jsonb_typeof(p_records), '') <> 'array'
     OR (SELECT count(DISTINCT c) FROM unnest(p_activate_codes) AS c) <> cardinality(p_activate_codes)
     OR (SELECT count(DISTINCT c) FROM unnest(p_deactivate_codes) AS c) <> cardinality(p_deactivate_codes)
     OR EXISTS (SELECT 1 FROM unnest(p_activate_codes || p_deactivate_codes) AS c WHERE c IS NULL OR btrim(c) = '')
     OR p_activate_codes && p_deactivate_codes
  THEN RAISE EXCEPTION 'Invalid competition item changes.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text, 0));
  UPDATE public.items
  SET is_active = false
  WHERE festival_id = p_festival_id AND tenant_id = owner
    AND item_code = ANY(p_deactivate_codes) AND is_active;
  UPDATE public.items
  SET is_active = true
  WHERE festival_id = p_festival_id AND tenant_id = owner
    AND item_code = ANY(p_activate_codes) AND NOT is_active;

  FOREACH code IN ARRAY p_activate_codes LOOP
    IF EXISTS (
      SELECT 1 FROM public.items
      WHERE festival_id = p_festival_id AND tenant_id = owner AND item_code = code
    ) THEN CONTINUE; END IF;

    SELECT value INTO rec
    FROM jsonb_array_elements(p_records)
    WHERE value->>'item_code' = code
    LIMIT 1;
    IF rec IS NULL OR nullif(btrim(rec->>'item_name_ml'), '') IS NULL
       OR COALESCE(jsonb_typeof(rec->'category_codes'), '') <> 'array'
    THEN RAISE EXCEPTION 'A complete single-category competition is required.'; END IF;
    IF jsonb_array_length(rec->'category_codes') <> 1 THEN
      RAISE EXCEPTION 'A complete single-category competition is required.';
    END IF;

    rec_type := nullif(rec->>'item_type', '');
    rec_participation := lower(COALESCE(rec->>'participation_type', ''));
    rec_limit := nullif(rec->>'max_participants_per_team', '')::integer;
    IF rec_type IS NOT NULL AND rec_type NOT IN ('stage', 'offstage') THEN
      RAISE EXCEPTION 'Choose On Stage or Off Stage.';
    END IF;
    IF rec_limit IS NOT NULL AND rec_limit < 1 THEN
      RAISE EXCEPTION 'Enter a positive participant limit.';
    END IF;
    IF rec_limit IS NOT NULL AND rec_participation <> 'individual' THEN
      RAISE EXCEPTION 'Participant limit is only available for individual items.';
    END IF;

    INSERT INTO public.items (
      tenant_id, festival_id, item_code, item_name_ml, item_name_en,
      category_codes, participation_type, source, is_active,
      duration_minutes, group_min_members, group_max_members, item_type,
      max_participants_per_team
    ) VALUES (
      owner, p_festival_id, code, rec->>'item_name_ml',
      COALESCE(rec->>'item_name_en', rec->>'item_name_ml'),
      ARRAY(SELECT jsonb_array_elements_text(rec->'category_codes')),
      rec->>'participation_type', COALESCE(rec->>'source', 'custom'), true,
      (rec->>'duration_minutes')::integer,
      (rec->>'group_min_members')::integer,
      (rec->>'group_max_members')::integer,
      rec_type,
      rec_limit
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_competition_item_changes(uuid, text[], text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_competition_item_changes(uuid, text[], text[], jsonb) TO authenticated;

-- One team-scoped read lets the Team Leader UI show remaining capacity without
-- issuing a count request for each item.
CREATE FUNCTION public.get_team_leader_item_limit_status()
RETURNS TABLE (
  item_id uuid,
  participant_count integer,
  max_participants_per_team integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_context record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.id,
         count(r.id)::integer,
         i.max_participants_per_team
  FROM public.items i
  LEFT JOIN public.registrations r
    ON r.festival_id = v_context.festival_id
   AND r.item_id = i.id
   AND r.organisation_id = v_context.organisation_id
   AND r.entry_kind = 'participant'
   AND COALESCE(r.status, 'pending') NOT IN ('rejected', 'cancelled')
  WHERE i.festival_id = v_context.festival_id
    AND (i.tenant_id IS NULL OR i.tenant_id = v_context.parent_tenant_id)
    AND i.is_active IS TRUE
    AND lower(COALESCE(i.participation_type, '')) = 'individual'
  GROUP BY i.id, i.max_participants_per_team;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_item_limit_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_item_limit_status() TO authenticated;

-- Enforce the cap in the database so Admin, Team Leader, bulk assignment and
-- any future registration path cannot bypass the same-team limit. Existing
-- assignments are retained; only new active registrations beyond the cap fail.
CREATE OR REPLACE FUNCTION scoring_private.enforce_item_team_participant_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, scoring_private
AS $$
DECLARE
  v_participation_type text;
  v_limit integer;
  v_existing_count integer;
BEGIN
  IF NEW.item_id IS NULL OR NEW.festival_id IS NULL OR NEW.organisation_id IS NULL
     OR COALESCE(NEW.entry_kind, 'participant') <> 'participant'
     OR COALESCE(NEW.status, 'pending') IN ('rejected', 'cancelled')
  THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.item_id IS NOT DISTINCT FROM NEW.item_id
     AND OLD.festival_id IS NOT DISTINCT FROM NEW.festival_id
     AND OLD.organisation_id IS NOT DISTINCT FROM NEW.organisation_id
     AND OLD.entry_kind IS NOT DISTINCT FROM NEW.entry_kind
     AND COALESCE(OLD.status, 'pending') NOT IN ('rejected', 'cancelled')
     AND COALESCE(NEW.status, 'pending') NOT IN ('rejected', 'cancelled')
  THEN RETURN NEW; END IF;

  SELECT lower(COALESCE(i.participation_type, '')), i.max_participants_per_team
    INTO v_participation_type, v_limit
  FROM public.items i
  WHERE i.id = NEW.item_id AND i.festival_id = NEW.festival_id
  FOR SHARE;

  IF NOT FOUND OR v_participation_type <> 'individual' OR v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.festival_id::text || ':' || NEW.item_id::text || ':' || NEW.organisation_id::text,
    0
  ));

  SELECT count(*)::integer INTO v_existing_count
  FROM public.registrations r
  WHERE r.festival_id = NEW.festival_id
    AND r.item_id = NEW.item_id
    AND r.organisation_id = NEW.organisation_id
    AND r.entry_kind = 'participant'
    AND COALESCE(r.status, 'pending') NOT IN ('rejected', 'cancelled')
    AND r.id IS DISTINCT FROM NEW.id;

  IF v_existing_count >= v_limit THEN
    RAISE EXCEPTION 'This team has reached the participant limit of % for this item.', v_limit
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION scoring_private.enforce_item_team_participant_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS registrations_enforce_item_team_participant_limit ON public.registrations;
CREATE TRIGGER registrations_enforce_item_team_participant_limit
BEFORE INSERT OR UPDATE OF item_id, festival_id, organisation_id, entry_kind, status
ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION scoring_private.enforce_item_team_participant_limit();

NOTIFY pgrst, 'reload schema';
COMMIT;
