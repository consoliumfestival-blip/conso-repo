-- Capped items belong to the festival owner tenant, while each registration
-- belongs to the participant's team tenant. Validate those scopes separately.
-- Preserve the existing per-team cap, lock, and rejected/cancelled behavior.

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
  v_item_festival uuid;
  v_item_tenant uuid;
BEGIN
  IF NEW.item_id IS NULL
     OR COALESCE(NEW.entry_kind, 'participant') <> 'participant'
     OR COALESCE(NEW.status, 'pending') IN ('rejected', 'cancelled')
  THEN RETURN NEW; END IF;

  SELECT lower(COALESCE(i.participation_type, '')), i.max_participants_per_team,
         i.festival_id, i.tenant_id
    INTO v_participation_type, v_limit, v_item_festival, v_item_tenant
  FROM public.items i
  WHERE i.id = NEW.item_id
  FOR SHARE;

  IF NOT FOUND OR v_participation_type <> 'individual' OR v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.festival_id IS DISTINCT FROM v_item_festival
     OR NEW.organisation_id IS NULL OR NEW.participant_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.festival_calendar f
       WHERE f.id = NEW.festival_id
         AND f.tenant_id IS NOT DISTINCT FROM v_item_tenant
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.participants p
       WHERE p.id = NEW.participant_id
         AND p.festival_id = NEW.festival_id
         AND p.tenant_id = NEW.tenant_id
         AND p.organisation_id = NEW.organisation_id
     )
  THEN
    RAISE EXCEPTION 'A capped individual registration requires a participant in the same festival and team.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.item_id IS NOT DISTINCT FROM NEW.item_id
     AND OLD.festival_id IS NOT DISTINCT FROM NEW.festival_id
     AND OLD.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
     AND OLD.organisation_id IS NOT DISTINCT FROM NEW.organisation_id
     AND OLD.participant_id IS NOT DISTINCT FROM NEW.participant_id
     AND OLD.entry_kind IS NOT DISTINCT FROM NEW.entry_kind
     AND COALESCE(OLD.status, 'pending') NOT IN ('rejected', 'cancelled')
     AND COALESCE(NEW.status, 'pending') NOT IN ('rejected', 'cancelled')
  THEN RETURN NEW; END IF;

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
