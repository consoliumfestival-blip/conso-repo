-- Allow anonymous/public visitors to read published Poster Studio posters alongside manual uploads
-- without opening SELECT access on public.results.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_public_published_poster_result(
  p_event_id uuid,
  p_result_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.results r
    WHERE (
      (p_event_id IS NOT NULL AND r.item_id = p_event_id)
      OR (p_result_id IS NOT NULL AND r.id = p_result_id)
    )
      AND r.published IS TRUE
      AND COALESCE(r.result_status, 'draft') = 'published'
      AND r.public_visible IS TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_public_published_poster_result(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_published_poster_result(uuid, uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view generated_assets" ON public.generated_assets;
CREATE POLICY "Public can view generated_assets"
  ON public.generated_assets
  FOR SELECT
  TO anon, authenticated
  USING (
    is_current = true
    AND visibility_status = 'published'
    AND (
      (event_id IS NULL AND result_id IS NULL)
      OR public.is_public_published_poster_result(event_id, result_id)
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
