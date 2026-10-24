-- Keep individual eligibility in the existing participant RPC. Discover every
-- single-category group item for this team, including non-General categories.
CREATE OR REPLACE FUNCTION public.get_team_leader_programs_for_team()
RETURNS TABLE (
  item_id uuid, item_code text, item_name_en text, item_name_ml text,
  category_codes text[], gender text, participation_type text,
  group_min_members integer, group_max_members integer, entry_kind text,
  is_assigned boolean, is_eligible boolean, team_entry_count integer,
  eligible_participant_ids uuid[], assigned_participant_ids uuid[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH context AS (
    SELECT c.parent_tenant_id, c.festival_id, c.organisation_id,
           festival.general_category_enabled
    FROM public.get_team_leader_context() AS c
    JOIN public.festival_calendar AS festival
      ON festival.id = c.festival_id AND festival.tenant_id = c.parent_tenant_id
    JOIN public.organisations AS organisation ON organisation.id = c.organisation_id
    JOIN public.get_visible_organisations(c.parent_tenant_id) AS visible
      ON visible.id = organisation.id AND visible.tenant_id = organisation.tenant_id
    WHERE auth.uid() IS NOT NULL
  ), participant_programs AS (
    SELECT member.id AS participant_id, program.*
    FROM public.get_team_leader_participants() AS member
    CROSS JOIN LATERAL public.get_team_leader_programs(member.id) AS program
    WHERE member.status IS DISTINCT FROM 'rejected' AND program.entry_kind = 'participant'
  ), individual_programs AS (
    SELECT pp.item_id, pp.item_code, pp.item_name_en, pp.item_name_ml,
           pp.category_codes, pp.gender, pp.participation_type,
           pp.group_min_members, pp.group_max_members, pp.entry_kind,
           bool_or(pp.is_assigned) AS is_assigned,
           bool_or(pp.is_eligible AND NOT pp.is_assigned) AS is_eligible,
           max(pp.team_entry_count) AS team_entry_count,
           COALESCE(array_agg(DISTINCT pp.participant_id) FILTER (WHERE pp.is_eligible), ARRAY[]::uuid[]) AS eligible_participant_ids,
           COALESCE(array_agg(DISTINCT pp.participant_id) FILTER (WHERE pp.is_assigned), ARRAY[]::uuid[]) AS assigned_participant_ids
    FROM participant_programs AS pp
    GROUP BY pp.item_id, pp.item_code, pp.item_name_en, pp.item_name_ml,
             pp.category_codes, pp.gender, pp.participation_type,
             pp.group_min_members, pp.group_max_members, pp.entry_kind
  ), group_programs AS (
    SELECT item.id AS item_id, item.item_code, item.item_name_en, item.item_name_ml,
           item.category_codes, item.gender, item.participation_type,
           item.group_min_members, item.group_max_members, 'general_team'::text AS entry_kind,
           entries.entry_count > 0 AS is_assigned,
           item.is_active IS TRUE AND entries.entry_count = 0
             AND (context.general_category_enabled IS TRUE
               OR NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(item.category_codes) AS code
                 WHERE pg_catalog.upper(pg_catalog.btrim(code)) IN ('GN', 'GENERAL')))
             AND EXISTS (SELECT 1 FROM public.get_team_leader_eligible_group_member_ids(item.id)) AS is_eligible,
           entries.entry_count AS team_entry_count,
           ARRAY[]::uuid[] AS eligible_participant_ids,
           ARRAY[]::uuid[] AS assigned_participant_ids
    FROM context
    JOIN public.items AS item ON item.festival_id = context.festival_id
      AND item.tenant_id = context.parent_tenant_id
      AND pg_catalog.lower(COALESCE(item.participation_type, '')) = 'group'
      AND pg_catalog.cardinality(item.category_codes) = 1
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS entry_count FROM public.registrations AS entry
      WHERE entry.festival_id = context.festival_id
        AND entry.tenant_id = context.parent_tenant_id
        AND entry.organisation_id = context.organisation_id
        AND entry.item_id = item.id AND entry.entry_kind = 'general_team'
    ) AS entries
    WHERE item.is_active IS TRUE OR entries.entry_count > 0
  )
  SELECT * FROM individual_programs
  UNION ALL
  SELECT * FROM group_programs
  ORDER BY item_name_en NULLS LAST, item_code;
$$;
ALTER FUNCTION public.get_team_leader_programs_for_team() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_team_leader_programs_for_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_programs_for_team() TO authenticated;

-- A direct RPC call must enforce the group size too; the picker already does.
CREATE OR REPLACE FUNCTION public.team_leader_create_general_entry(p_item_id uuid, p_participant_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_context record; v_item public.items; v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) AS visible
    JOIN public.organisations AS organisation ON organisation.id = visible.id
    WHERE visible.id = v_context.organisation_id AND visible.tenant_id = organisation.tenant_id
  ) THEN
    RAISE EXCEPTION 'An active Team Leader assignment is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_item FROM public.items AS item
  WHERE item.id = p_item_id AND item.festival_id = v_context.festival_id
    AND item.tenant_id = v_context.parent_tenant_id AND item.is_active IS TRUE
    AND item.participation_type = 'group' AND pg_catalog.cardinality(item.category_codes) = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an active group competition in your festival.' USING ERRCODE = '23514'; END IF;
  v_count := pg_catalog.cardinality(p_participant_ids);
  IF v_count IS NULL OR v_count < GREATEST(1, COALESCE(v_item.group_min_members, 1))
    OR (COALESCE(v_item.group_max_members, 0) > 0 AND v_count > v_item.group_max_members) THEN
    RAISE EXCEPTION 'The selected team size is outside this competition''s configured member range.' USING ERRCODE = '23514';
  END IF;
  RETURN group_entry_private.create_entry(v_context.festival_id, p_item_id, v_context.organisation_id, p_participant_ids);
END;
$$;
ALTER FUNCTION public.team_leader_create_general_entry(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.team_leader_create_general_entry(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_leader_create_general_entry(uuid, uuid[]) TO authenticated;
