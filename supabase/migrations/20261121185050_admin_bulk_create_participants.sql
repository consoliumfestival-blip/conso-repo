BEGIN;

CREATE OR REPLACE FUNCTION public.admin_bulk_create_participants(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_organisation_id uuid,
  p_category_code text,
  p_gender text,
  p_names text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_name text;
  v_count integer;
  v_gender_mode text;
  v_festival_template text;
  v_category_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to add participants.';
  END IF;
  IF p_tenant_id IS NULL OR p_festival_id IS NULL OR p_organisation_id IS NULL
     OR NULLIF(pg_catalog.btrim(p_category_code), '') IS NULL THEN
    RAISE EXCEPTION 'Festival, team, and category are required.';
  END IF;
  IF p_gender IS NULL OR p_gender NOT IN ('boys', 'girls') THEN
    RAISE EXCEPTION 'Choose boys or girls for this batch.';
  END IF;
  IF p_names IS NULL OR pg_catalog.cardinality(p_names) = 0 THEN
    RAISE EXCEPTION 'Enter at least one participant name.';
  END IF;

  SELECT f.gender_mode, f.festival_template INTO v_gender_mode, v_festival_template
  FROM public.festival_calendar f
  WHERE f.id = p_festival_id AND f.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected festival does not belong to this tenant.';
  END IF;
  IF v_gender_mode = 'boys_only' AND p_gender <> 'boys'
     OR v_gender_mode = 'girls_only' AND p_gender <> 'girls' THEN
    RAISE EXCEPTION 'The selected gender is not allowed for this festival.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.festival_categories fc
    WHERE fc.tenant_id = p_tenant_id AND fc.festival_id = p_festival_id
      AND fc.is_active AND pg_catalog.lower(pg_catalog.btrim(fc.code)) = pg_catalog.lower(pg_catalog.btrim(p_category_code))
  ) INTO v_category_exists;
  IF NOT v_category_exists AND (
    v_festival_template = 'college_fest'
    OR pg_catalog.upper(pg_catalog.btrim(p_category_code)) NOT IN ('SBJ', 'LP', 'UP', 'HS', 'HSS', 'JR', 'SR', 'GN', 'CA', 'CG', 'CGP')
  ) THEN
    RAISE EXCEPTION 'Choose an active category belonging to this festival.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_names) AS supplied(name)
    WHERE supplied.name IS NULL OR NULLIF(pg_catalog.btrim(supplied.name), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Participant names cannot be blank.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_names) AS supplied(name)
    GROUP BY pg_catalog.lower(pg_catalog.btrim(supplied.name))
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate participant names are not allowed in one batch.';
  END IF;
  v_count := pg_catalog.cardinality(p_names);
  FOREACH v_name IN ARRAY p_names LOOP
    PERFORM public.create_participant_with_chest_number(
      p_tenant_id, p_festival_id, p_organisation_id, pg_catalog.btrim(v_name),
      p_category_code, 'approved', NULL, NULL, NULL, p_gender, true, true
    );
  END LOOP;
  RETURN v_count;
END
$function$;

REVOKE ALL ON FUNCTION public.admin_bulk_create_participants(uuid, uuid, uuid, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_create_participants(uuid, uuid, uuid, text, text, text[]) TO authenticated;

COMMIT;
