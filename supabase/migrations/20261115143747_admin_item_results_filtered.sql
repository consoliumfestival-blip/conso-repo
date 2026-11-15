-- Page-specific read model. The existing admin RPC remains the authorization and
-- published-result source for all callers; only this page applies these filters.
CREATE FUNCTION public.admin_item_results_filtered(
  p_tenant_id uuid, p_festival_id uuid, p_search text DEFAULT '',
  p_category text DEFAULT 'all', p_type text DEFAULT 'all', p_status text DEFAULT 'all'
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH all_results AS MATERIALIZED (
    SELECT r.*, COALESCE(r.item_id::text, 'result:' || r.result_id::text) AS group_key
    FROM public.get_admin_published_results(p_tenant_id, p_festival_id) r
  ), item_stats AS (
    SELECT group_key, array_agg(result_id ORDER BY result_id) AS result_ids,
      bool_and(public_visible) AS all_public, bool_and(NOT public_visible) AS all_hidden,
      min(published_at) FILTER (WHERE public_visible) AS earliest_public
    FROM all_results GROUP BY group_key
  ), ordered AS (
    SELECT group_key, row_number() OVER (ORDER BY earliest_public, group_key) AS public_order
    FROM item_stats WHERE earliest_public IS NOT NULL
  ), filtered AS (
    SELECT r.* FROM all_results r
    LEFT JOIN public.items i ON i.id = r.item_id AND i.festival_id = p_festival_id AND i.tenant_id = p_tenant_id
    WHERE r.points_awarded > 0
      AND (p_type = 'all' OR (p_type = 'group' AND r.is_group) OR (p_type = 'individual' AND NOT r.is_group))
      AND (p_status = 'all' OR (p_status = 'published' AND r.public_visible)
        OR (p_status = 'unpublished' AND NOT r.public_visible)
        OR (p_status NOT IN ('published', 'unpublished') AND r.result_status = p_status))
      AND (p_category = 'all' OR EXISTS (SELECT 1 FROM pg_catalog.unnest(i.category_codes) c WHERE pg_catalog.lower(c) = pg_catalog.lower(p_category)))
      AND (pg_catalog.btrim(COALESCE(p_search, '')) = '' OR
        pg_catalog.strpos(pg_catalog.lower(COALESCE(r.item_name, '')), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0 OR
        pg_catalog.strpos(pg_catalog.lower(COALESCE(r.item_name_ml, '')), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0 OR
        pg_catalog.strpos(pg_catalog.lower(COALESCE(r.organisation_name, '')), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0 OR
        pg_catalog.strpos(pg_catalog.lower(COALESCE(r.participant_name, '')), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0 OR
        pg_catalog.strpos(pg_catalog.lower(COALESCE(r.chest_number, '')), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0)
  )
  SELECT pg_catalog.jsonb_build_object(
    'rows', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) - 'group_key') FROM filtered f), '[]'::jsonb),
    'items', COALESCE((SELECT pg_catalog.jsonb_object_agg(s.group_key, pg_catalog.jsonb_build_object(
      'result_ids', s.result_ids, 'all_public', s.all_public, 'all_hidden', s.all_hidden, 'public_order', o.public_order))
      FROM item_stats s LEFT JOIN ordered o USING (group_key)
      WHERE EXISTS (SELECT 1 FROM filtered f WHERE f.group_key = s.group_key)), '{}'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.admin_item_results_filtered(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_item_results_filtered(uuid, uuid, text, text, text, text) TO authenticated;
