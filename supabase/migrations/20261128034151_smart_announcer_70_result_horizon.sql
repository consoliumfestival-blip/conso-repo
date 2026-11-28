BEGIN;
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.smart_announcer_team_strategy_v2(uuid,uuid,uuid,integer,text,text,uuid[])'::regprocedure)
    INTO definition;
  IF position('v_open_slots, 50)' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected planner definition: expected 50-result horizon';
  END IF;
  definition := replace(definition, 'v_open_slots, 50)', 'v_open_slots, 70)');
  definition := replace(definition, 'speculative depth at 50', 'speculative depth at 70');
  EXECUTE definition;
END $migration$;
ALTER FUNCTION public.smart_announcer_team_strategy_v2(uuid,uuid,uuid,integer,text,text,uuid[]) SET statement_timeout = '13s';
ALTER FUNCTION public.smart_announcer_batch_preview_v2(uuid,uuid,uuid,integer,text,text,uuid[]) SET statement_timeout = '13s';
ALTER FUNCTION public.smart_announcer_send_batch_v2(uuid,uuid,uuid,uuid[],integer,text,text,boolean) SET statement_timeout = '13s';
NOTIFY pgrst, 'reload schema';
COMMIT;
