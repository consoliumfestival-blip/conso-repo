-- Keep legacy general and official gn item codes behaviorally equivalent.
-- Validation changes only: item codes, registrations, marks, and results are untouched.
BEGIN;

CREATE OR REPLACE FUNCTION group_entry_private.is_general_category_code(p_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT pg_catalog.upper(pg_catalog.btrim(COALESCE(p_code, ''))) IN ('GN', 'GENERAL');
$function$;
REVOKE ALL ON FUNCTION group_entry_private.is_general_category_code(text) FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
BEGIN
  -- Case-insensitive open-category eligibility in group rosters.
  SELECT pg_catalog.pg_get_functiondef(
    'group_entry_private.validate_roster(uuid,uuid,uuid,uuid[])'::regprocedure
  ) INTO v_definition;
  v_patched := pg_catalog.regexp_replace(
    v_definition,
    'v_item\.category_codes\s*&&\s*ARRAY\[\s*''GN''\s*,\s*''GENERAL''\s*\]',
    'EXISTS (SELECT 1 FROM pg_catalog.unnest(v_item.category_codes) AS category_codes(code) WHERE group_entry_private.is_general_category_code(category_codes.code))',
    'g'
  );
  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'Expected General check not found in validate_roster; aborting migration.';
  END IF;
  EXECUTE v_patched;

  -- Apply the same case-insensitive check to group-entry creation and its toggle.
  SELECT pg_catalog.pg_get_functiondef(
    'group_entry_private.create_entry(uuid,uuid,uuid,uuid[])'::regprocedure
  ) INTO v_definition;
  v_patched := pg_catalog.regexp_replace(
    v_definition,
    'v_item\.category_codes\s*&&\s*ARRAY\[\s*''GN''\s*,\s*''GENERAL''\s*\]',
    'EXISTS (SELECT 1 FROM pg_catalog.unnest(v_item.category_codes) AS category_codes(code) WHERE group_entry_private.is_general_category_code(category_codes.code))',
    'g'
  );
  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'Expected General check not found in group create_entry; aborting migration.';
  END IF;
  EXECUTE v_patched;

  -- Make the General group-size override recognize both aliases in any casing.
  SELECT pg_catalog.pg_get_functiondef(
    'scoring_private.prepare_results(uuid,integer,jsonb,text,text,integer)'::regprocedure
  ) INTO v_definition;
  v_patched := pg_catalog.regexp_replace(
    v_definition,
    'item\.category_codes\s*&&\s*ARRAY\[\s*''GN''\s*,\s*''GENERAL''\s*\]',
    'EXISTS (SELECT 1 FROM pg_catalog.unnest(item.category_codes) AS category_codes(code) WHERE group_entry_private.is_general_category_code(category_codes.code))',
    'g'
  );
  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'Expected General group-size check not found in prepare_results; aborting migration.';
  END IF;
  EXECUTE v_patched;

  -- The Team Leader program list must not offer new General assignments when
  -- disabled. Existing assigned rows remain visible through the existing RPC.
  SELECT pg_catalog.pg_get_functiondef(
    'public.get_team_leader_programs(uuid)'::regprocedure
  ) INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');
  -- The existing group-item toggle used array overlap, which is case-sensitive.
  v_old := 'AND NOT (v_is_post_hs_religious IS TRUE AND EXISTS';
  v_new := 'AND (NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(COALESCE(i.category_codes, ARRAY[]::text[])) AS category_codes(code) WHERE group_entry_private.is_general_category_code(category_codes.code)) OR v_festival.general_category_enabled IS TRUE)' || E'\n                 ' || v_old;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected Team Leader eligibility gate not found; aborting migration.';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);

  -- Enforce the same toggle in the Team Leader write RPC, not only its UI/list.
  SELECT pg_catalog.pg_get_functiondef(
    'public.team_leader_assign_program(uuid,uuid)'::regprocedure
  ) INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');
  v_old := $old$IF NOT FOUND THEN
    RAISE EXCEPTION 'This program is unavailable.' USING ERRCODE = '22023';
  END IF;$old$;
  v_new := $new$IF NOT FOUND THEN
    RAISE EXCEPTION 'This program is unavailable.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(COALESCE(v_item.category_codes, ARRAY[]::text[])) AS category_codes(code)
    WHERE group_entry_private.is_general_category_code(category_codes.code)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.festival_calendar f
    WHERE f.id = v_context.festival_id
      AND f.tenant_id = v_context.parent_tenant_id
      AND f.general_category_enabled IS TRUE
  ) THEN
    RAISE EXCEPTION 'General category is disabled for this festival.' USING ERRCODE = '23514';
  END IF;

  $new$ || E'\n  SELECT EXISTS';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected item validation block not found in team_leader_assign_program; aborting migration.';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);

  -- Admin registration writes obey the toggle. Updates to existing registration
  -- identity remain available to history/check-in workflows while disabled.
  SELECT pg_catalog.pg_get_functiondef(
    'public.validate_registration_category_compatibility()'::regprocedure
  ) INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');
  v_old := $old$  IF EXISTS (
    SELECT 1 FROM unnest(v_item_categories) AS category_code
    WHERE upper(btrim(category_code)) = 'GN' OR upper(btrim(category_code)) = 'GENERAL'
  ) THEN
    RETURN NEW;
  END IF;$old$;
  v_new := $new$  IF EXISTS (
    SELECT 1 FROM unnest(v_item_categories) AS category_code
    WHERE group_entry_private.is_general_category_code(category_code)
  ) THEN
    IF (TG_OP = 'INSERT' OR NEW.festival_id IS DISTINCT FROM OLD.festival_id
        OR NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.participant_id IS DISTINCT FROM OLD.participant_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.festival_calendar f
         WHERE f.id = NEW.festival_id AND f.general_category_enabled IS TRUE
       ) THEN
      RAISE EXCEPTION 'General category is disabled for this festival.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;$new$;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected open-category registration block not found; aborting migration.';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$migration$;

COMMIT;
