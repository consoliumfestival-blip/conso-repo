-- Count distinct core-published items regardless of public visibility.
-- Authorization and festival scope are inherited from the existing admin RPC.
CREATE FUNCTION public.admin_core_published_item_count(p_tenant_id uuid, p_festival_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT count(DISTINCT r.item_id)
  FROM public.get_admin_published_results(p_tenant_id, p_festival_id) r;
$$;
REVOKE ALL ON FUNCTION public.admin_core_published_item_count(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_core_published_item_count(uuid, uuid) TO authenticated;
