-- When p_priority = 'team' and the target team cannot yet reach 1st within
-- v_batch_size (batch_target_first = false), do not let auto batch_spread or
-- batch_mode_violation override first_step / team_rank / leader_gap.
BEGIN;
DO $migration$
DECLARE
  definition text;
  before_step text;
BEGIN
  SELECT pg_get_functiondef('public.smart_announcer_team_strategy_v2(uuid,uuid,uuid,integer,text,text,uuid[])'::regprocedure)
    INTO definition;
  definition := replace(definition, chr(13), '');

  before_step := definition;
  definition := regexp_replace(
    definition,
    'CASE WHEN p_mode = ''auto'' THEN \(selected\.value->>''batch_spread''\)::bigint ELSE 0 END ASC,\s*\(selected\.value->>''batch_mode_violation''\)::bigint\s+ASC,',
    'CASE WHEN (selected.value->>''batch_target_first'')::boolean AND p_mode = ''auto'' THEN (selected.value->>''batch_spread'')::bigint ELSE 0 END ASC,' || chr(10) ||
    '      CASE WHEN (selected.value->>''batch_target_first'')::boolean OR p_priority = ''spread'' THEN (selected.value->>''batch_mode_violation'')::bigint ELSE 0 END ASC,',
    'g'
  );
  IF definition = before_step THEN
    RAISE EXCEPTION 'Unexpected selected auto spread definition; no changes applied';
  END IF;

  before_step := definition;
  definition := regexp_replace(
    definition,
    'CASE WHEN p_mode = ''auto'' THEN \(u\.value->>''batch_spread''\)::bigint ELSE 0 END ASC,\s*\(u\.value->>''batch_mode_violation''\)::bigint\s+ASC,',
    'CASE WHEN (u.value->>''batch_target_first'')::boolean AND p_mode = ''auto'' THEN (u.value->>''batch_spread'')::bigint ELSE 0 END ASC,' || chr(10) ||
    '      CASE WHEN (u.value->>''batch_target_first'')::boolean OR p_priority = ''spread'' THEN (u.value->>''batch_mode_violation'')::bigint ELSE 0 END ASC,',
    'g'
  );
  IF definition = before_step THEN
    RAISE EXCEPTION 'Unexpected beam/best auto spread definition; no changes applied';
  END IF;

  EXECUTE definition;
END $migration$;
NOTIFY pgrst, 'reload schema';
COMMIT;
