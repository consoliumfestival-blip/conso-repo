CREATE OR REPLACE FUNCTION public.get_team_leader_programs_page(
  p_entry_kind text DEFAULT 'participant',
  p_search text DEFAULT '',
  p_category_code text DEFAULT 'All categories',
  p_stage_filter text DEFAULT 'All stages',
  p_completion_filter text DEFAULT 'All statuses',
  p_sort text DEFAULT 'default',
  p_category_order text[] DEFAULT ARRAY[]::text[],
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_category text := CASE
    WHEN upper(btrim(coalesce(p_category_code, ''))) IN ('GN', 'GENERAL') THEN 'GENERAL'
    ELSE upper(btrim(coalesce(p_category_code, '')))
  END;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_entry_kind IS NULL OR p_entry_kind NOT IN ('participant', 'general_team') THEN
    RAISE EXCEPTION 'Invalid entry kind' USING ERRCODE = '22023';
  END IF;
  IF p_stage_filter NOT IN ('All stages', 'On Stage', 'Off Stage') THEN
    RAISE EXCEPTION 'Invalid stage filter' USING ERRCODE = '22023';
  END IF;
  IF p_completion_filter NOT IN ('All statuses', 'Fully assigned', 'Not fully assigned') THEN
    RAISE EXCEPTION 'Invalid completion filter' USING ERRCODE = '22023';
  END IF;
  IF p_sort NOT IN ('default', 'name_asc', 'name_desc', 'code_asc', 'category_asc') THEN
    RAISE EXCEPTION 'Invalid sort order' USING ERRCODE = '22023';
  END IF;

  WITH completed_programs AS MATERIALIZED (
    SELECT item_id FROM public.get_team_leader_completed_program_ids()
  ),
  source_programs AS MATERIALIZED (
    SELECT program.*, (done.item_id IS NOT NULL) AS is_completed
    FROM public.get_team_leader_programs_for_team_with_locks() AS program
    LEFT JOIN completed_programs AS done
      ON done.item_id = program.item_id
  ),
  available_programs AS MATERIALIZED (
    SELECT *
    FROM source_programs
    WHERE entry_kind = p_entry_kind
      AND (is_eligible OR is_assigned)
  ),
  filtered_programs AS MATERIALIZED (
    SELECT *
    FROM available_programs AS program
    WHERE (v_search = '' OR strpos(
            lower(concat_ws(' ', item_code, item_name_en, item_name_ml,
              array_to_string(category_codes, ' '))), v_search
          ) > 0)
      AND (v_category = '' OR v_category = 'ALL CATEGORIES' OR EXISTS (
        SELECT 1 FROM unnest(coalesce(category_codes, ARRAY[]::text[])) AS category(code)
        WHERE CASE
          WHEN upper(btrim(category.code)) IN ('GN', 'GENERAL') THEN 'GENERAL'
          ELSE upper(btrim(category.code))
        END = v_category
      ))
      AND (p_stage_filter = 'All stages' OR lower(btrim(coalesce(nullif(item_type, ''), 'stage'))) =
        CASE WHEN p_stage_filter = 'On Stage' THEN 'stage' ELSE 'offstage' END)
      AND (p_entry_kind <> 'participant' OR p_completion_filter = 'All statuses'
        OR is_completed = (p_completion_filter = 'Fully assigned'))
  ),
  counts AS (
    SELECT count(*)::integer AS available_count,
           count(*) FILTER (WHERE
             CASE WHEN p_entry_kind = 'participant' THEN is_completed ELSE is_assigned END
           )::integer AS active_count
    FROM available_programs
  ),
  filtered_count AS (
    SELECT count(*)::integer AS row_count FROM filtered_programs
  ),
  page_number AS (
    SELECT CASE WHEN row_count = 0 THEN 1
      ELSE least(v_page, greatest(ceil(row_count::numeric / v_page_size)::integer, 1))
    END AS value
    FROM filtered_count
  ),
  ordered_page AS MATERIALIZED (
    SELECT program.*,
           row_number() OVER (ORDER BY
             CASE WHEN p_sort = 'default' THEN item_name_en END ASC NULLS LAST,
             CASE WHEN p_sort = 'default' THEN item_code END ASC NULLS LAST,
             CASE WHEN p_sort = 'name_asc' THEN lower(coalesce(item_name_en, item_name_ml, item_code, '')) END ASC,
             CASE WHEN p_sort = 'name_desc' THEN lower(coalesce(item_name_en, item_name_ml, item_code, '')) END DESC,
             CASE WHEN p_sort = 'code_asc' THEN lower(coalesce(item_code, '')) END ASC,
             CASE WHEN p_sort = 'category_asc' THEN (
               SELECT min(array_position(p_category_order, CASE
                 WHEN upper(btrim(category.code)) IN ('GN', 'GENERAL') THEN 'GENERAL'
                 ELSE upper(btrim(category.code)) END))
               FROM unnest(coalesce(category_codes, ARRAY[]::text[])) AS category(code)
             ) END ASC NULLS LAST,
             CASE WHEN p_sort = 'category_asc' THEN lower(coalesce(item_name_en, item_name_ml, item_code, '')) END ASC,
             item_id
           ) AS ordinal
    FROM filtered_programs AS program
  ),
  page_rows AS (
    SELECT ordered_page.* FROM ordered_page CROSS JOIN page_number
    WHERE ordinal > (page_number.value - 1) * v_page_size
      AND ordinal <= page_number.value * v_page_size + 1
  ),
  category_codes AS (
    SELECT coalesce(array_agg(DISTINCT normalized ORDER BY normalized), ARRAY[]::text[]) AS codes
    FROM source_programs AS program
    CROSS JOIN LATERAL unnest(coalesce(program.category_codes, ARRAY[]::text[])) AS category(code)
    CROSS JOIN LATERAL (SELECT CASE
      WHEN upper(btrim(category.code)) IN ('GN', 'GENERAL') THEN 'GENERAL'
      ELSE upper(btrim(category.code)) END AS normalized) AS category_code
    WHERE category_code.normalized <> ''
  )
  SELECT jsonb_build_object(
    'rows', coalesce((
      SELECT jsonb_agg(to_jsonb(page_rows) - 'ordinal' ORDER BY ordinal)
      FROM page_rows
      WHERE ordinal <= (SELECT value FROM page_number) * v_page_size
    ), '[]'::jsonb),
    'page', (SELECT value FROM page_number),
    'page_size', v_page_size,
    'has_more', (SELECT row_count > (SELECT value FROM page_number) * v_page_size FROM filtered_count),
    'has_previous', (SELECT value > 1 FROM page_number),
    'available_count', counts.available_count,
    'active_count', counts.active_count,
    'category_codes', category_codes.codes
  )
  INTO v_result
  FROM counts CROSS JOIN category_codes;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_team_leader_programs_page(text, text, text, text, text, text, text[], integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_programs_page(text, text, text, text, text, text, text[], integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
