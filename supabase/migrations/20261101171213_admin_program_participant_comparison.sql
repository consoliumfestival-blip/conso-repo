-- Read-only comparison add-on for the Programs page. It does not create,
-- update, or remove registrations, rosters, schedules, check-ins, or results.
BEGIN;

CREATE FUNCTION public.admin_program_comparison_options(
  p_tenant_id uuid,
  p_festival_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE result jsonb;
BEGIN
  PERFORM program_read_private.authorize(p_tenant_id, p_festival_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'item_id', item_id,
    'item_code', item_code,
    'item_name', item_name,
    'category', category,
    'kind', kind
  ) ORDER BY item_name, item_code, category, kind), '[]'::jsonb)
  INTO result
  FROM (
    SELECT i.id AS item_id,
      i.item_code,
      coalesce(i.item_name_en, i.item_code) AS item_name,
      program_read_private.category_code(category_code) AS category,
      CASE WHEN lower(btrim(coalesce(i.participation_type, ''))) = 'group'
        THEN 'group' ELSE 'individual' END AS kind
    FROM public.items i
    JOIN public.festival_calendar f ON f.id = i.festival_id AND f.tenant_id = i.tenant_id
    CROSS JOIN LATERAL unnest(coalesce(i.category_codes, ARRAY[]::text[])) AS category_code
    WHERE i.tenant_id = p_tenant_id
      AND i.festival_id = p_festival_id
      AND i.is_active IS TRUE
      AND (program_read_private.category_code(category_code) <> 'GENERAL' OR f.general_category_enabled IS TRUE)
  ) options;

  RETURN result;
END;
$function$;

CREATE FUNCTION public.admin_program_participant_comparison(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_programs jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE result jsonb;
BEGIN
  PERFORM program_read_private.authorize(p_tenant_id, p_festival_id);

  IF jsonb_typeof(p_programs) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_programs) < 2 THEN
    RAISE EXCEPTION 'Select at least two programs to compare.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_programs) > 100 THEN
    RAISE EXCEPTION 'Select at most 100 programs to compare.' USING ERRCODE = '22023';
  END IF;

  WITH selected_input AS MATERIALIZED (
    SELECT DISTINCT
      (entry ->> 'item_id')::uuid AS item_id,
      program_read_private.category_code(coalesce(entry ->> 'category', '')) AS category
    FROM jsonb_array_elements(p_programs) AS value(entry)
    WHERE nullif(entry ->> 'item_id', '') IS NOT NULL
      AND nullif(btrim(entry ->> 'category'), '') IS NOT NULL
  ), selected_programs AS MATERIALIZED (
    SELECT selection.item_id,
      selection.category,
      i.item_code,
      coalesce(i.item_name_en, i.item_code) AS item_name,
      CASE WHEN lower(btrim(coalesce(i.participation_type, ''))) = 'group'
        THEN 'group' ELSE 'individual' END AS kind
    FROM selected_input selection
    JOIN public.items i ON i.id = selection.item_id
      AND i.tenant_id = p_tenant_id
      AND i.festival_id = p_festival_id
      AND i.is_active IS TRUE
    JOIN public.festival_calendar f ON f.id = i.festival_id AND f.tenant_id = i.tenant_id
    WHERE EXISTS (
      SELECT 1 FROM unnest(coalesce(i.category_codes, ARRAY[]::text[])) AS category_code
      WHERE program_read_private.category_code(category_code) = selection.category
    )
      AND (selection.category <> 'GENERAL' OR f.general_category_enabled IS TRUE)
  ), visible_organisations AS MATERIALIZED (
    SELECT id FROM public.get_visible_organisations(p_tenant_id)
  ), direct_members AS (
    SELECT DISTINCT program.item_id, program.category, program.item_code, program.item_name, program.kind,
      person.id AS participant_id, person.name AS participant_name, person.chest_number, false AS group_member
    FROM selected_programs program
    JOIN public.registrations registration ON registration.item_id = program.item_id
      AND registration.festival_id = p_festival_id
      AND (registration.tenant_id = p_tenant_id OR registration.tenant_id IS NULL)
      AND registration.status IS DISTINCT FROM 'rejected'
      AND registration.status IS DISTINCT FROM 'cancelled'
      AND registration.participant_id IS NOT NULL
    JOIN public.participants person ON person.id = registration.participant_id
      AND person.festival_id = p_festival_id
      AND person.organisation_id IN (SELECT id FROM visible_organisations)
    WHERE program_read_private.matches_category(person.category_code, program.category, person.is_post_hs_religious)
  ), group_members AS (
    SELECT DISTINCT program.item_id, program.category, program.item_code, program.item_name, program.kind,
      person.id AS participant_id, person.name AS participant_name, person.chest_number, true AS group_member
    FROM selected_programs program
    JOIN public.registrations registration ON registration.item_id = program.item_id
      AND registration.festival_id = p_festival_id
      AND (registration.tenant_id = p_tenant_id OR registration.tenant_id IS NULL)
      AND registration.status IS DISTINCT FROM 'rejected'
      AND registration.status IS DISTINCT FROM 'cancelled'
    JOIN public.group_members member ON member.registration_id = registration.id
    JOIN public.participants person ON person.id = member.participant_id
      AND person.festival_id = p_festival_id
      AND person.organisation_id IN (SELECT id FROM visible_organisations)
    WHERE program_read_private.matches_category(person.category_code, program.category, person.is_post_hs_religious)
  ), memberships AS MATERIALIZED (
    SELECT DISTINCT ON (member.item_id, member.category, member.participant_id)
      member.*
    FROM (
      SELECT * FROM direct_members
      UNION ALL
      SELECT * FROM group_members
    ) member
    ORDER BY member.item_id, member.category, member.participant_id, member.group_member DESC
  ), shared_people AS (
    SELECT participant_id,
      max(participant_name) AS participant_name,
      max(chest_number) AS chest_number,
      count(DISTINCT (item_id, category)) AS program_count,
      jsonb_agg(jsonb_build_object(
        'item_id', item_id,
        'item_code', item_code,
        'item_name', item_name,
        'category', category,
        'kind', kind,
        'group_member', group_member
      ) ORDER BY item_name, item_code, category) AS programs
    FROM memberships
    GROUP BY participant_id
    HAVING count(DISTINCT (item_id, category)) > 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'participant_id', participant_id,
    'participant_name', participant_name,
    'chest_number', chest_number,
    'program_count', program_count,
    'programs', programs
  ) ORDER BY chest_number NULLS LAST, participant_name, participant_id), '[]'::jsonb)
  INTO result
  FROM shared_people;

  RETURN result;
END;
$function$;

ALTER FUNCTION public.admin_program_comparison_options(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.admin_program_participant_comparison(uuid, uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_program_comparison_options(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_program_participant_comparison(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_program_comparison_options(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_program_participant_comparison(uuid, uuid, jsonb) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
