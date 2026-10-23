-- Team Leader reads stay scoped to the authenticated assignment. These RPCs
-- add no write path and do not relax group_entry_private.validate_roster.

CREATE OR REPLACE FUNCTION public.get_team_leader_eligible_group_member_ids(p_item_id uuid)
RETURNS TABLE(participant_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_context record;
  v_member record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) visible
    JOIN public.organisations organisation ON organisation.id = visible.id
    WHERE visible.id = v_context.organisation_id
      AND visible.tenant_id = organisation.tenant_id
  ) THEN
    RAISE EXCEPTION 'An active Team Leader assignment is required.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.items item
    JOIN public.festival_calendar festival ON festival.id = item.festival_id
    WHERE item.id = p_item_id AND item.festival_id = v_context.festival_id
      AND item.tenant_id = festival.tenant_id
      AND festival.tenant_id = v_context.parent_tenant_id
      AND item.is_active IS TRUE AND item.participation_type = 'group'
      AND pg_catalog.cardinality(item.category_codes) = 1
  ) THEN
    RAISE EXCEPTION 'Select an active group competition in your festival.' USING ERRCODE = '23514';
  END IF;

  -- The same validator that creates a group entry decides which students the
  -- picker may show. A singleton roster checks individual eligibility without
  -- applying the competition's minimum group size.
  FOR v_member IN SELECT id FROM public.get_team_leader_participants() LOOP
    BEGIN
      PERFORM group_entry_private.validate_roster(
        v_context.festival_id, p_item_id, v_context.organisation_id,
        ARRAY[v_member.id]::uuid[]
      );
      participant_id := v_member.id;
      RETURN NEXT;
    EXCEPTION WHEN check_violation THEN
      -- This student is outside one of the validator's eligibility rules.
      NULL;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.get_team_leader_eligible_group_member_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_eligible_group_member_ids(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_team_leader_program_group_roster(p_item_id uuid)
RETURNS TABLE (
  registration_id uuid,
  entry_chest_number text,
  participant_id uuid,
  participant_name text,
  participant_chest_number text,
  member_order integer,
  is_leader boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT entry.id, COALESCE(leader.chest_number, entry.entry_chest_number),
         member.participant_id, person.name, person.chest_number,
         member.member_order, member.participant_id = entry.group_leader_participant_id
  FROM public.get_team_leader_context() context
  JOIN public.festival_calendar festival
    ON festival.id = context.festival_id AND festival.tenant_id = context.parent_tenant_id
  JOIN public.organisations organisation ON organisation.id = context.organisation_id
  JOIN public.get_visible_organisations(context.parent_tenant_id) visible
    ON visible.id = organisation.id AND visible.tenant_id = organisation.tenant_id
  JOIN public.registrations entry
    ON entry.festival_id = context.festival_id
   AND entry.tenant_id = context.parent_tenant_id
   AND entry.organisation_id = context.organisation_id
   AND entry.item_id = p_item_id
   AND entry.entry_kind = 'general_team'
  JOIN public.group_members member ON member.registration_id = entry.id
  JOIN public.participants person ON person.id = member.participant_id
    AND person.festival_id = context.festival_id
    AND person.tenant_id IN (context.parent_tenant_id, organisation.tenant_id)
  LEFT JOIN public.participants leader ON leader.id = entry.group_leader_participant_id
    AND leader.festival_id = context.festival_id
    AND leader.tenant_id IN (context.parent_tenant_id, organisation.tenant_id)
  WHERE auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.items item
      WHERE item.id = p_item_id AND item.festival_id = context.festival_id
        AND item.tenant_id = context.parent_tenant_id)
  ORDER BY entry.created_at DESC, member.member_order NULLS LAST, member.participant_id;
$$;
REVOKE ALL ON FUNCTION public.get_team_leader_program_group_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_program_group_roster(uuid) TO authenticated;
