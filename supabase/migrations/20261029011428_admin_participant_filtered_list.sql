-- Read through the caller's table privileges and RLS policies.
CREATE OR REPLACE FUNCTION public.admin_filtered_participants(
  p_search text DEFAULT '', p_category text DEFAULT NULL,
  p_status text DEFAULT NULL, p_gender text DEFAULT NULL,
  p_festival_id uuid DEFAULT NULL, p_item_id uuid DEFAULT NULL,
  p_competition_category text DEFAULT NULL
) RETURNS SETOF public.participants
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT p.* FROM public.participants p
  WHERE (p_search = '' OR strpos(lower(p.name), lower(p_search)) > 0
         OR strpos(lower(coalesce(p.chest_number, '')), lower(p_search)) > 0)
    AND (p_category IS NULL OR p.category_code = p_category)
    AND (p_status IS NULL OR lower(coalesce(nullif(p.status, ''), 'pending')) = lower(p_status))
    AND (p_gender IS NULL OR lower(coalesce(p.gender, '')) = lower(p_gender))
    AND (p_item_id IS NULL OR (
      (p_competition_category IS NULL OR upper(btrim(coalesce(p.category_code, ''))) = upper(btrim(p_competition_category)))
      AND EXISTS (SELECT 1 FROM public.registrations r
        WHERE r.participant_id = p.id AND r.item_id = p_item_id
          AND r.festival_id = p_festival_id AND r.status IS DISTINCT FROM 'rejected')
    ));
$$;
REVOKE ALL ON FUNCTION public.admin_filtered_participants(text,text,text,text,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_filtered_participants(text,text,text,text,uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_participant_categories()
RETURNS TABLE(category_code text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT DISTINCT btrim(p.category_code) FROM public.participants p
  WHERE p.category_code IS NOT NULL AND btrim(p.category_code) <> '';
$$;
REVOKE ALL ON FUNCTION public.admin_participant_categories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_participant_categories() TO authenticated;
