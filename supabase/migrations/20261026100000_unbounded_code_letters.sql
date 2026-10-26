-- Extend code-letter draws and manual edits beyond A-Z while preserving the
-- existing secure RPC checks, transaction boundaries, and audit behavior.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION code_letter_private.index_of(value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path TO ''
AS $function$
DECLARE
  result numeric := 0;
  char_index integer;
  character_code integer;
BEGIN
  IF value !~ '^[A-Z]+$' THEN
    RAISE EXCEPTION 'Code letter must contain one or more uppercase letters.' USING ERRCODE = '22023';
  END IF;
  FOR char_index IN 1..pg_catalog.char_length(value) LOOP
    character_code := pg_catalog.ascii(pg_catalog.substr(value, char_index, 1)) - 64;
    result := result * 26 + character_code;
  END LOOP;
  RETURN result - 1;
END;
$function$;
ALTER FUNCTION code_letter_private.index_of(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION code_letter_private.index_of(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION code_letter_private.code_at(code_index bigint)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path TO ''
AS $function$
DECLARE
  numeric_value bigint;
  result text := '';
BEGIN
  IF code_index < 0 OR code_index = 9223372036854775807 THEN
    RAISE EXCEPTION 'Code letter index is outside the supported range.' USING ERRCODE = '22003';
  END IF;
  numeric_value := code_index + 1;
  WHILE numeric_value > 0 LOOP
    result := pg_catalog.chr(65 + ((numeric_value - 1) % 26)::integer) || result;
    numeric_value := (numeric_value - 1) / 26;
  END LOOP;
  RETURN result;
END;
$function$;
ALTER FUNCTION code_letter_private.code_at(bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION code_letter_private.code_at(bigint) FROM PUBLIC, anon, authenticated, service_role;

-- Use an iterative augmenting-path search. Recursive matching works for small
-- rosters, but can exceed PostgreSQL's stack limit when a large redraw moves
-- a long chain of existing assignments.
CREATE OR REPLACE FUNCTION code_letter_private.match_entry(entry text, choices jsonb, matching jsonb, seen text[])
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE queue text[] := ARRAY[entry]; visited_entries text[] := ARRAY[entry];
  visited_letters text[] := ARRAY[]::text[]; parent jsonb := '{}'::jsonb;
  queue_index integer := 1; current_entry text; letter text; occupant text;
  free_letter text; path_letter text; parent_entry text; old_letter text;
BEGIN
  WHILE queue_index <= pg_catalog.cardinality(queue) LOOP
    current_entry := queue[queue_index];
    queue_index := queue_index + 1;
    FOR letter IN SELECT pg_catalog.jsonb_array_elements_text(choices->current_entry) LOOP
      IF letter = ANY(visited_letters) THEN CONTINUE; END IF;
      visited_letters := pg_catalog.array_append(visited_letters, letter);
      parent := parent || pg_catalog.jsonb_build_object(letter, current_entry);
      occupant := matching->>letter;
      IF occupant IS NULL THEN
        free_letter := letter;
        EXIT;
      ELSIF NOT occupant = ANY(visited_entries) THEN
        visited_entries := pg_catalog.array_append(visited_entries, occupant);
        queue := pg_catalog.array_append(queue, occupant);
      END IF;
    END LOOP;
    IF free_letter IS NOT NULL THEN EXIT; END IF;
  END LOOP;

  IF free_letter IS NULL THEN RETURN NULL; END IF;
  path_letter := free_letter;
  LOOP
    parent_entry := parent->>path_letter;
    SELECT key INTO old_letter FROM pg_catalog.jsonb_each_text(matching)
      WHERE value = parent_entry LIMIT 1;
    IF old_letter IS NOT NULL THEN matching := matching - old_letter; END IF;
    matching := matching || pg_catalog.jsonb_build_object(path_letter, parent_entry);
    IF old_letter IS NULL THEN EXIT; END IF;
    path_letter := old_letter;
  END LOOP;
  RETURN matching;
END;
$function$;
ALTER FUNCTION code_letter_private.match_entry(text, jsonb, jsonb, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION code_letter_private.match_entry(text, jsonb, jsonb, text[]) FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.registrations DROP CONSTRAINT registrations_fixed_letter_valid;
ALTER TABLE public.registrations ADD CONSTRAINT registrations_fixed_letter_valid
  CHECK (NOT code_letter_fixed OR (code_letter IS NOT NULL AND code_letter ~ '^[A-Z]+$'));

CREATE OR REPLACE FUNCTION code_letter_private.edit(tenant uuid, schedule uuid, registration uuid, letter text, expected_letter text, expected_swap uuid, portal boolean, venue uuid DEFAULT NULL::uuid, festival uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE s public.schedules; source public.registrations; target public.registrations;
  targets integer; before_rows jsonb; changed jsonb;
BEGIN
  IF letter IS NULL OR pg_catalog.upper(pg_catalog.btrim(letter)) !~ '^[A-Z]+$' THEN
    RAISE EXCEPTION 'Enter one or more letters from A to Z.' USING ERRCODE = '22023'; END IF;
  letter := pg_catalog.upper(pg_catalog.btrim(letter));
  s := code_letter_private.lock_schedule(tenant, schedule);
  IF portal AND (s.venue_id IS DISTINCT FROM venue OR s.festival_id IS DISTINCT FROM festival) THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO source FROM code_letter_private.entries(s, portal) r WHERE r.id = registration;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration is outside the current schedule scope.' USING ERRCODE = '42501'; END IF;
  IF source.status = 'rejected' OR source.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified active entries can receive code letters.' USING ERRCODE = '22023'; END IF;
  IF source.code_letter IS DISTINCT FROM expected_letter THEN
    RAISE EXCEPTION 'Code letters changed. Refresh and review the edit again.' USING ERRCODE = '40001'; END IF;
  SELECT count(*) INTO targets FROM code_letter_private.entries(s, portal) r
    WHERE r.id <> registration AND r.status <> 'rejected' AND r.is_verified IS TRUE AND r.code_letter = letter;
  IF targets > 1 THEN RAISE EXCEPTION 'Duplicate existing letters must be resolved before swapping.' USING ERRCODE = '23505'; END IF;
  SELECT * INTO target FROM code_letter_private.entries(s, portal) r
    WHERE r.id <> registration AND r.status <> 'rejected' AND r.is_verified IS TRUE AND r.code_letter = letter;
  IF target.id IS DISTINCT FROM expected_swap THEN
    RAISE EXCEPTION 'The target letter changed. Refresh and review the swap again.' USING ERRCODE = '40001'; END IF;
  IF target.id IS NOT NULL AND (source.code_letter IS NULL OR source.code_letter !~ '^[A-Z]+$') THEN
    RAISE EXCEPTION 'This entry has no letter to swap. Choose an unused letter.' USING ERRCODE = '22023'; END IF;
  IF target.id IS NOT NULL AND EXISTS (SELECT 1 FROM code_letter_private.entries(s, portal) r
    WHERE r.id NOT IN (source.id, target.id) AND r.status <> 'rejected' AND r.is_verified IS TRUE
      AND r.code_letter = source.code_letter) THEN
    RAISE EXCEPTION 'Duplicate existing letters must be resolved before swapping.' USING ERRCODE = '23505'; END IF;
  IF NOT EXISTS (SELECT 1 FROM code_letter_private.people(source.id)) OR
    (target.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM code_letter_private.people(target.id))) THEN
    RAISE EXCEPTION 'The entry has no participant roster; letters cannot be assigned safely.' USING ERRCODE = '22023'; END IF;
  IF letter = ANY(code_letter_private.conflicts(s, source.id, portal)) OR
    (target.id IS NOT NULL AND source.code_letter = ANY(code_letter_private.conflicts(s, target.id, portal))) THEN
    RAISE EXCEPTION 'The new letter conflicts with an overlapping event for one of these entries.' USING ERRCODE = '22023'; END IF;

  SELECT pg_catalog.jsonb_agg(to_jsonb(r)) INTO before_rows
    FROM public.registrations r WHERE r.id IN (source.id, target.id);

  IF target.id IS NULL THEN
    UPDATE public.registrations r SET code_letter = letter, code_letter_fixed = true WHERE r.id = source.id;
  ELSE
    UPDATE public.registrations r SET code_letter = NULL, code_letter_fixed = false
      WHERE r.id IN (source.id, target.id);
    UPDATE public.registrations r
      SET code_letter = CASE WHEN r.id = source.id THEN letter ELSE source.code_letter END,
          code_letter_fixed = true
      WHERE r.id IN (source.id, target.id);
  END IF;

  SELECT pg_catalog.jsonb_agg(to_jsonb(r)) INTO changed
    FROM public.registrations r WHERE r.id IN (source.id, target.id);
  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    SELECT tenant, auth.uid(), CASE WHEN target.id IS NULL THEN 'code_letter_manual_assign' ELSE 'code_letter_swap' END,
      'registrations', (old_row->>'id')::uuid, old_row || pg_catalog.jsonb_build_object('schedule_id', schedule),
      new_row || pg_catalog.jsonb_build_object('schedule_id', schedule)
    FROM pg_catalog.jsonb_array_elements(before_rows) old_row
    JOIN pg_catalog.jsonb_array_elements(changed) new_row ON old_row->>'id' = new_row->>'id';
  RETURN pg_catalog.jsonb_build_object('changed', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', row->'id', 'code_letter', row->'code_letter', 'code_letter_fixed', row->'code_letter_fixed'))
    FROM pg_catalog.jsonb_array_elements(changed) row), 'swapped', target.id IS NOT NULL);
END $function$;
ALTER FUNCTION code_letter_private.edit(uuid, uuid, uuid, text, text, uuid, boolean, uuid, uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION code_letter_private.draw(tenant uuid, schedule uuid, overwrite boolean, portal boolean, venue uuid DEFAULT NULL::uuid, festival uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE s public.schedules; current_entry public.registrations; used text[]; pool text[]; blocked text[];
  choices jsonb := '{}'::jsonb; matching jsonb := '{}'::jsonb; candidates jsonb; before_rows jsonb;
  remaining bigint; eligible bigint; total_fixed bigint; entry text; conflict_fallback boolean := false;
BEGIN
  s := code_letter_private.lock_schedule(tenant, schedule);
  IF portal AND (s.venue_id IS DISTINCT FROM venue OR s.festival_id IS DISTINCT FROM festival) THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  SELECT count(*), count(*) FILTER (WHERE code_letter_fixed) INTO eligible, total_fixed
    FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE;
  IF eligible = 0 THEN RAISE EXCEPTION 'No verified active entries are available for the draw.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE
    AND r.code_letter IS NOT NULL AND (r.code_letter_fixed OR NOT overwrite)
    GROUP BY r.code_letter HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate preserved letters must be resolved before drawing.' USING ERRCODE = '23505'; END IF;
  SELECT COALESCE(pg_catalog.array_agg(r.code_letter), ARRAY[]::text[]) INTO used
    FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE
      AND r.code_letter IS NOT NULL AND (r.code_letter_fixed OR NOT overwrite);
  SELECT pg_catalog.jsonb_agg(to_jsonb(r)), count(*) INTO before_rows, remaining
    FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE
      AND NOT r.code_letter_fixed AND (overwrite OR r.code_letter IS NULL);
  IF remaining = 0 THEN RETURN pg_catalog.jsonb_build_object('assigned', 0, 'fixed', total_fixed); END IF;

  SELECT pg_catalog.array_agg(code_letter_private.code_at(candidate_index) ORDER BY candidate_index) INTO pool
    FROM (
      SELECT candidate_index
      FROM pg_catalog.generate_series(0::bigint, remaining + pg_catalog.cardinality(used)::bigint - 1)
        AS candidates(candidate_index)
      WHERE code_letter_private.code_at(candidate_index) <> ALL (used)
      ORDER BY candidate_index
      LIMIT remaining
    ) available;

  FOR current_entry IN SELECT e.* FROM code_letter_private.entries(s, portal) e WHERE e.status <> 'rejected' AND e.is_verified IS TRUE
    AND NOT e.code_letter_fixed AND (overwrite OR e.code_letter IS NULL) LOOP
    IF NOT EXISTS (SELECT 1 FROM code_letter_private.people(current_entry.id)) THEN
      RAISE EXCEPTION 'The entry has no participant roster; letters cannot be drawn safely.' USING ERRCODE = '22023'; END IF;
    blocked := code_letter_private.conflicts(s, current_entry.id, portal);
    SELECT COALESCE(pg_catalog.jsonb_agg(letter ORDER BY (SELECT pg_catalog.min(
        pg_catalog.abs(code_letter_private.index_of(letter) - code_letter_private.index_of(conflict)))
      FROM pg_catalog.unnest(blocked) conflict WHERE conflict ~ '^[A-Z]+$') DESC NULLS FIRST, pg_catalog.random()), '[]'::jsonb) INTO candidates
      FROM pg_catalog.unnest(pool) letter WHERE NOT letter = ANY(blocked);
    choices := choices || pg_catalog.jsonb_build_object(current_entry.id::text, candidates);
  END LOOP;
  FOR entry IN SELECT key FROM pg_catalog.jsonb_each(choices) ORDER BY pg_catalog.jsonb_array_length(value), key LOOP
    matching := code_letter_private.match_entry(entry, choices, matching, ARRAY[]::text[]);
    IF matching IS NULL THEN conflict_fallback := true; EXIT; END IF;
  END LOOP;
  IF conflict_fallback THEN
    matching := '{}'::jsonb;
    FOR entry IN SELECT key FROM pg_catalog.jsonb_each(choices) ORDER BY pg_catalog.jsonb_array_length(value), key LOOP
      candidates := choices->entry;
      SELECT COALESCE(pg_catalog.jsonb_agg(letter ORDER BY pg_catalog.random()), '[]'::jsonb) INTO candidates
        FROM pg_catalog.unnest(pool) letter WHERE NOT matching ? letter
        AND candidates ? letter;
      IF pg_catalog.jsonb_array_length(candidates) = 0 THEN
        SELECT pg_catalog.jsonb_agg(letter ORDER BY pg_catalog.random()) INTO candidates
          FROM pg_catalog.unnest(pool) letter WHERE NOT matching ? letter;
      END IF;
      matching := matching || pg_catalog.jsonb_build_object(candidates->>0, entry);
    END LOOP;
  END IF;

  UPDATE public.registrations r SET code_letter = NULL, code_letter_fixed = false
    WHERE r.code_letter IS NOT NULL AND r.id IN (
      SELECT allocation.value::uuid FROM pg_catalog.jsonb_each_text(matching) allocation
    );
  UPDATE public.registrations r SET code_letter = allocation.key, code_letter_fixed = false
    FROM pg_catalog.jsonb_each_text(matching) allocation WHERE r.id = allocation.value::uuid;
  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    SELECT tenant, auth.uid(), 'code_letter_draw', 'registrations', r.id,
      old_row || pg_catalog.jsonb_build_object('schedule_id', schedule),
      to_jsonb(r) || pg_catalog.jsonb_build_object('schedule_id', schedule)
    FROM pg_catalog.jsonb_array_elements(before_rows) old_row JOIN public.registrations r ON r.id = (old_row->>'id')::uuid;
  RETURN pg_catalog.jsonb_build_object('assigned', remaining, 'fixed', total_fixed, 'conflictsUnavoidable', conflict_fallback);
END $function$;
ALTER FUNCTION code_letter_private.draw(uuid, uuid, boolean, boolean, uuid, uuid) OWNER TO postgres;

-- Chest changes invalidate only the affected Judge Portal label subscriptions.
-- Empty broadcast payloads contain no participant information.
CREATE OR REPLACE FUNCTION code_letter_private.notify_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE s record; changed record;
BEGIN
  -- One hint per event per SQL statement, including a full multi-row draw.
  FOR changed IN SELECT DISTINCT n.festival_id, n.item_id FROM code_letter_new n JOIN code_letter_old o ON o.id = n.id
    WHERE n.code_letter IS DISTINCT FROM o.code_letter OR n.code_letter_fixed IS DISTINCT FROM o.code_letter_fixed LOOP
    PERFORM realtime.send('{}'::jsonb, 'changed', 'code-letters:festival:' || changed.festival_id::text, false);
    FOR s IN SELECT id, venue_id FROM public.schedules
      WHERE festival_id = changed.festival_id AND item_id = changed.item_id LOOP
      PERFORM realtime.send('{}'::jsonb, 'changed', 'code-letters:schedule:' || s.id::text, false);
      PERFORM realtime.send('{}'::jsonb, 'changed', 'judge-labels:schedule:' || s.id::text, false);
      IF s.venue_id IS NOT NULL THEN
        PERFORM realtime.send('{}'::jsonb, 'changed', 'code-letters:venue:' || s.venue_id::text, false);
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $function$;
ALTER FUNCTION code_letter_private.notify_change() OWNER TO postgres;

CREATE OR REPLACE FUNCTION code_letter_private.notify_judge_registration_chest_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE affected_schedule record;
BEGIN
  FOR affected_schedule IN
    SELECT DISTINCT s.id
    FROM judge_registration_new n
    JOIN judge_registration_old o ON o.id = n.id
    JOIN public.schedules s ON s.festival_id = n.festival_id AND s.item_id = n.item_id
    WHERE n.code_letter IS NOT NULL AND n.status IS DISTINCT FROM 'rejected'
      AND (n.entry_chest_number IS DISTINCT FROM o.entry_chest_number
        OR n.group_leader_participant_id IS DISTINCT FROM o.group_leader_participant_id)
  LOOP
    PERFORM realtime.send('{}'::jsonb, 'changed', 'judge-labels:schedule:' || affected_schedule.id::text, false);
  END LOOP;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION code_letter_private.notify_judge_registration_chest_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION code_letter_private.notify_judge_registration_chest_change() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER registrations_notify_judge_chest
AFTER UPDATE ON public.registrations
REFERENCING OLD TABLE AS judge_registration_old NEW TABLE AS judge_registration_new
FOR EACH STATEMENT EXECUTE FUNCTION code_letter_private.notify_judge_registration_chest_change();

CREATE OR REPLACE FUNCTION code_letter_private.notify_judge_participant_chest_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE affected_schedule record;
BEGIN
  FOR affected_schedule IN
    WITH changed AS MATERIALIZED (
      SELECT n.id FROM judge_participant_new n JOIN judge_participant_old o ON o.id = n.id
      WHERE n.chest_number IS DISTINCT FROM o.chest_number
    ), affected_items AS (
      SELECT r.festival_id, r.item_id FROM public.registrations r
      JOIN changed p ON p.id = r.participant_id
      WHERE r.code_letter IS NOT NULL AND r.status IS DISTINCT FROM 'rejected'
      UNION
      SELECT r.festival_id, r.item_id FROM public.registrations r
      JOIN changed p ON p.id = r.group_leader_participant_id
      WHERE r.code_letter IS NOT NULL AND r.status IS DISTINCT FROM 'rejected'
    )
    SELECT DISTINCT s.id FROM public.schedules s
    JOIN affected_items a ON a.festival_id = s.festival_id AND a.item_id = s.item_id
  LOOP
    PERFORM realtime.send('{}'::jsonb, 'changed', 'judge-labels:schedule:' || affected_schedule.id::text, false);
  END LOOP;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION code_letter_private.notify_judge_participant_chest_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION code_letter_private.notify_judge_participant_chest_change() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER participants_notify_judge_chest
AFTER UPDATE ON public.participants
REFERENCING OLD TABLE AS judge_participant_old NEW TABLE AS judge_participant_new
FOR EACH STATEMENT EXECUTE FUNCTION code_letter_private.notify_judge_participant_chest_change();

COMMIT;
