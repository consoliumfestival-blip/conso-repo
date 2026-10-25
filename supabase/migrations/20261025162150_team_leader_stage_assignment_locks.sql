-- Independent, per-stage locks for Team Leader program assignments.
-- Defaults preserve the existing writable behavior.
BEGIN;

ALTER TABLE public.festival_calendar
  ADD COLUMN IF NOT EXISTS team_leader_on_stage_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS team_leader_off_stage_locked boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_team_leader_programs_for_team_with_locks()
RETURNS TABLE (
  item_id uuid,
  item_code text,
  item_name_en text,
  item_name_ml text,
  category_codes text[],
  gender text,
  participation_type text,
  group_min_members integer,
  group_max_members integer,
  entry_kind text,
  is_assigned boolean,
  is_eligible boolean,
  team_entry_count integer,
  eligible_participant_ids uuid[],
  assigned_participant_ids uuid[],
  item_type text,
  assignment_locked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT program.item_id,
         program.item_code,
         program.item_name_en,
         program.item_name_ml,
         program.category_codes,
         program.gender,
         program.participation_type,
         program.group_min_members,
         program.group_max_members,
         program.entry_kind,
         program.is_assigned,
         program.is_eligible,
         program.team_entry_count,
         program.eligible_participant_ids,
         program.assigned_participant_ids,
         COALESCE(NULLIF(btrim(item.item_type), ''), 'stage'),
         CASE lower(COALESCE(NULLIF(btrim(item.item_type), ''), 'stage'))
           WHEN 'stage' THEN festival.team_leader_on_stage_locked
           WHEN 'offstage' THEN festival.team_leader_off_stage_locked
           ELSE festival.team_leader_on_stage_locked OR festival.team_leader_off_stage_locked
         END
  FROM public.get_team_leader_programs_for_team() AS program
  JOIN public.items AS item ON item.id = program.item_id
  CROSS JOIN LATERAL public.get_team_leader_context() AS context
  JOIN public.festival_calendar AS festival
    ON festival.id = context.festival_id
   AND festival.tenant_id = context.parent_tenant_id;
$$;

ALTER FUNCTION public.get_team_leader_programs_for_team_with_locks() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_team_leader_programs_for_team_with_locks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_programs_for_team_with_locks() TO authenticated;

CREATE OR REPLACE FUNCTION public.team_leader_program_assignment_is_locked(
  p_festival_id uuid,
  p_item_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_item_type text;
  v_on_stage_locked boolean;
  v_off_stage_locked boolean;
BEGIN
  SELECT COALESCE(NULLIF(btrim(item.item_type), ''), 'stage'),
         festival.team_leader_on_stage_locked,
         festival.team_leader_off_stage_locked
    INTO v_item_type, v_on_stage_locked, v_off_stage_locked
  FROM public.items AS item
  JOIN public.festival_calendar AS festival
    ON festival.id = p_festival_id
   AND festival.id = item.festival_id
  WHERE item.id = p_item_id
  FOR SHARE OF item, festival;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  RETURN CASE lower(v_item_type)
    WHEN 'stage' THEN v_on_stage_locked
    WHEN 'offstage' THEN v_off_stage_locked
    ELSE v_on_stage_locked OR v_off_stage_locked
  END;
END;
$$;

ALTER FUNCTION public.team_leader_program_assignment_is_locked(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.team_leader_program_assignment_is_locked(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_team_leader_program_assignment_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role text;
  v_item_type text;
  v_festival_id uuid;
  v_item_id uuid;
  v_locked boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT profile.role INTO v_role
  FROM public.profiles profile
  WHERE profile.id = auth.uid();
  IF v_role IS DISTINCT FROM 'team_leader' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_festival_id := OLD.festival_id;
    v_item_id := OLD.item_id;
    SELECT COALESCE(NULLIF(btrim(item.item_type), ''), 'stage')
      INTO v_item_type FROM public.items item WHERE item.id = v_item_id;
    v_locked := public.team_leader_program_assignment_is_locked(v_festival_id, v_item_id);
    IF COALESCE(v_locked, false) THEN
      RAISE EXCEPTION 'Team Leader assignment changes are locked for this % item.',
        CASE lower(v_item_type) WHEN 'offstage' THEN 'Off Stage' ELSE 'On Stage' END
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_festival_id := NEW.festival_id;
    v_item_id := NEW.item_id;
    SELECT COALESCE(NULLIF(btrim(item.item_type), ''), 'stage')
      INTO v_item_type FROM public.items item WHERE item.id = v_item_id;
    v_locked := public.team_leader_program_assignment_is_locked(v_festival_id, v_item_id);
    IF COALESCE(v_locked, false) THEN
      RAISE EXCEPTION 'Team Leader assignment changes are locked for this % item.',
        CASE lower(v_item_type) WHEN 'offstage' THEN 'Off Stage' ELSE 'On Stage' END
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

ALTER FUNCTION public.guard_team_leader_program_assignment_lock() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_team_leader_program_assignment_lock() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_team_leader_group_member_assignment_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role text;
  v_registration public.registrations%ROWTYPE;
  v_locked boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT profile.role INTO v_role
  FROM public.profiles profile
  WHERE profile.id = auth.uid();
  IF v_role IS DISTINCT FROM 'team_leader' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT * INTO v_registration FROM public.registrations registration
    WHERE registration.id = OLD.registration_id;
    IF NOT FOUND AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Group assignment entry was not found.' USING ERRCODE = '42501'; END IF;
    v_locked := public.team_leader_program_assignment_is_locked(v_registration.festival_id, v_registration.item_id);
    IF COALESCE(v_locked, true) THEN
      RAISE EXCEPTION 'Team Leader group assignment changes are locked.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT * INTO v_registration FROM public.registrations registration
    WHERE registration.id = NEW.registration_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Group assignment entry was not found.' USING ERRCODE = '42501'; END IF;
    v_locked := public.team_leader_program_assignment_is_locked(v_registration.festival_id, v_registration.item_id);
    IF COALESCE(v_locked, true) THEN
      RAISE EXCEPTION 'Team Leader group assignment changes are locked.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

ALTER FUNCTION public.guard_team_leader_group_member_assignment_lock() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_team_leader_group_member_assignment_lock() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_team_leader_program_completion_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role text;
  v_locked boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT profile.role INTO v_role
  FROM public.profiles profile
  WHERE profile.id = auth.uid();
  IF v_role IS DISTINCT FROM 'team_leader' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_locked := public.team_leader_program_assignment_is_locked(OLD.festival_id, OLD.item_id);
    IF COALESCE(v_locked, true) THEN
      RAISE EXCEPTION 'Team Leader program changes are locked.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_locked := public.team_leader_program_assignment_is_locked(NEW.festival_id, NEW.item_id);
    IF COALESCE(v_locked, true) THEN
      RAISE EXCEPTION 'Team Leader program changes are locked.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

ALTER FUNCTION public.guard_team_leader_program_completion_lock() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_team_leader_program_completion_lock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_team_leader_program_assignment_lock ON public.registrations;
CREATE TRIGGER guard_team_leader_program_assignment_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.guard_team_leader_program_assignment_lock();

DROP TRIGGER IF EXISTS guard_team_leader_group_member_assignment_lock ON public.group_members;
CREATE TRIGGER guard_team_leader_group_member_assignment_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_team_leader_group_member_assignment_lock();

DROP TRIGGER IF EXISTS guard_team_leader_program_completion_lock ON public.team_leader_program_completions;
CREATE TRIGGER guard_team_leader_program_completion_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.team_leader_program_completions
  FOR EACH ROW EXECUTE FUNCTION public.guard_team_leader_program_completion_lock();

COMMIT;
