-- Team-scoped discovery and atomic individual-program assignment for the
-- Team Leader Portal. The existing per-participant RPC remains the source of
-- truth for eligibility and ownership checks.

CREATE OR REPLACE FUNCTION public.get_team_leader_programs_for_team()
RETURNS TABLE (
  item_id uuid,
  item_code text,
  item_name_en text,
  item_name_ml text,
  category_codes text[],
  gender text,
  participation_type text,
  group_min_members integer,
  group_max_members integer,
  entry_kind text,
  is_assigned boolean,
  is_eligible boolean,
  team_entry_count integer,
  eligible_participant_ids uuid[],
  assigned_participant_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH participant_programs AS (
    SELECT team_member.id AS participant_id,
           program.item_id,
           program.item_code,
           program.item_name_en,
           program.item_name_ml,
           program.category_codes,
           program.gender,
           program.participation_type,
           program.group_min_members,
           program.group_max_members,
           program.entry_kind,
           program.is_assigned,
           program.is_eligible,
           program.team_entry_count
    FROM public.get_team_leader_participants() AS team_member
    CROSS JOIN LATERAL public.get_team_leader_programs(team_member.id) AS program
    WHERE team_member.status IS DISTINCT FROM 'rejected'
  )
  SELECT pp.item_id,
         pp.item_code,
         pp.item_name_en,
         pp.item_name_ml,
         pp.category_codes,
         pp.gender,
         pp.participation_type,
         pp.group_min_members,
         pp.group_max_members,
         pp.entry_kind,
         bool_or(pp.is_assigned),
         bool_or(pp.is_eligible AND NOT pp.is_assigned),
         max(pp.team_entry_count),
         COALESCE(array_agg(DISTINCT pp.participant_id) FILTER (WHERE pp.is_eligible), ARRAY[]::uuid[]),
         COALESCE(array_agg(DISTINCT pp.participant_id) FILTER (WHERE pp.is_assigned), ARRAY[]::uuid[])
  FROM participant_programs AS pp
  GROUP BY pp.item_id, pp.item_code, pp.item_name_en, pp.item_name_ml,
           pp.category_codes, pp.gender, pp.participation_type,
           pp.group_min_members, pp.group_max_members, pp.entry_kind
  ORDER BY pp.item_name_en NULLS LAST, pp.item_code;
$$;

ALTER FUNCTION public.get_team_leader_programs_for_team() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_team_leader_programs_for_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_programs_for_team() TO authenticated;

CREATE OR REPLACE FUNCTION public.team_leader_assign_program_participants(
  p_item_id uuid,
  p_participant_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_context record;
  v_participant_id uuid;
  v_assignment jsonb;
  v_assigned_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;

  IF p_participant_ids IS NULL OR cardinality(p_participant_ids) = 0
     OR array_position(p_participant_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Select at least one participant.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT selected.id) FROM unnest(p_participant_ids) AS selected(id))
     <> cardinality(p_participant_ids) THEN
    RAISE EXCEPTION 'A participant can only be selected once.' USING ERRCODE = '22023';
  END IF;

  -- Reuse the established server-side validation for each member. A failure
  -- raises inside this transaction and rolls back every earlier insert.
  FOR v_participant_id IN
    SELECT selected.id
    FROM unnest(p_participant_ids) AS selected(id)
    ORDER BY selected.id
  LOOP
    v_assignment := public.team_leader_assign_program(v_participant_id, p_item_id);
    v_assigned_ids := array_append(v_assigned_ids, (v_assignment->>'participant_id')::uuid);
  END LOOP;

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'assigned_participant_ids', v_assigned_ids,
    'assigned_count', cardinality(v_assigned_ids),
    'status', 'pending'
  );
END;
$$;

ALTER FUNCTION public.team_leader_assign_program_participants(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.team_leader_assign_program_participants(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_leader_assign_program_participants(uuid, uuid[]) TO authenticated;
