-- Permit a request while assignments are locked; the separate substitution
-- switch, admin approval and competition-history guards continue to apply.
BEGIN;
DO $migration$
DECLARE
  v_definition text;
  v_guard constant text := E'  IF public.team_leader_program_assignment_is_locked(v_entry.festival_id, v_entry.item_id) THEN\n    RAISE EXCEPTION ''Team Leader group assignment changes are locked.'' USING ERRCODE = ''42501'';\n  END IF;\n';
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.team_leader_request_group_substitution(uuid,uuid,uuid,text)'::regprocedure)
    INTO v_definition;
  IF (length(v_definition) - length(replace(v_definition, v_guard, ''))) / length(v_guard) <> 1 THEN
    RAISE EXCEPTION 'Group substitution function differs from expected; migration stopped.';
  END IF;
  EXECUTE replace(v_definition, v_guard, '');
END;
$migration$;
COMMIT;
