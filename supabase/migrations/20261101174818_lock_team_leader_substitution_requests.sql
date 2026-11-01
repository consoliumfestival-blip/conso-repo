-- Give each festival an Admin-controlled switch for new Team Leader substitution
-- requests. Existing requests remain available to the Admin approval workflow.
BEGIN;

ALTER TABLE public.festival_calendar
  ADD COLUMN IF NOT EXISTS team_leader_substitution_locked boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION team_substitution_private.enforce_substitution_requests_unlocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_locked boolean;
BEGIN
  SELECT festival.team_leader_substitution_locked
    INTO v_locked
  FROM public.festival_calendar AS festival
  WHERE festival.id = NEW.festival_id
  FOR SHARE;

  IF NOT FOUND OR v_locked IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'New Team Leader substitution requests are locked by an administrator.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION team_substitution_private.enforce_substitution_requests_unlocked() OWNER TO postgres;
REVOKE ALL ON FUNCTION team_substitution_private.enforce_substitution_requests_unlocked() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_substitution_requests_unlocked ON team_substitution_private.requests;
CREATE TRIGGER enforce_substitution_requests_unlocked
  BEFORE INSERT ON team_substitution_private.requests
  FOR EACH ROW
  EXECUTE FUNCTION team_substitution_private.enforce_substitution_requests_unlocked();

COMMIT;
