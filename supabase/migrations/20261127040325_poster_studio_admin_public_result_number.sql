-- Preserve the existing admin result contract while exposing the stored
-- public result number to Poster Studio.
CREATE OR REPLACE FUNCTION public.get_admin_published_results_with_public_number(
  p_tenant_id uuid DEFAULT NULL,
  p_festival_id uuid DEFAULT NULL
)
RETURNS TABLE (
  result_id uuid,
  registration_id uuid,
  schedule_id uuid,
  item_id uuid,
  item_name text,
  item_name_ml text,
  is_group boolean,
  organisation_id uuid,
  organisation_name text,
  participant_id uuid,
  participant_name text,
  chest_number text,
  rank integer,
  grade text,
  points_awarded integer,
  total_score numeric,
  published boolean,
  result_status text,
  public_visible boolean,
  collection_method text,
  published_at timestamptz,
  festival_id uuid,
  tenant_id uuid,
  public_result_no integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
  SELECT
    admin_result.result_id,
    admin_result.registration_id,
    admin_result.schedule_id,
    admin_result.item_id,
    admin_result.item_name,
    admin_result.item_name_ml,
    admin_result.is_group,
    admin_result.organisation_id,
    admin_result.organisation_name,
    admin_result.participant_id,
    admin_result.participant_name,
    admin_result.chest_number,
    admin_result.rank,
    admin_result.grade,
    admin_result.points_awarded,
    admin_result.total_score,
    admin_result.published,
    admin_result.result_status,
    admin_result.public_visible,
    admin_result.collection_method,
    admin_result.published_at,
    admin_result.festival_id,
    admin_result.tenant_id,
    result.public_result_no
  FROM public.get_admin_published_results(p_tenant_id, p_festival_id) AS admin_result
  JOIN public.results AS result ON result.id = admin_result.result_id;
$function$;

-- This privileged wrapper is only callable by authenticated clients. The
-- delegated admin RPC applies its existing auth and tenant result filtering.
REVOKE ALL ON FUNCTION public.get_admin_published_results_with_public_number(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_published_results_with_public_number(uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
