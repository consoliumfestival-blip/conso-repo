-- Read-only Team Leader progress for the core Programs page. Completion uses
-- the same current-roster comparison as get_team_leader_completed_program_ids().
CREATE OR REPLACE FUNCTION public.get_admin_team_program_progress(p_festival_id uuid)
RETURNS TABLE (
  festival_team_id uuid,
  organisation_id uuid,
  team_name text,
  participant_count bigint,
  assigned_participant_count bigint,
  item_id uuid,
  item_code text,
  item_name text,
  assigned_count bigint,
  is_completed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_festival_tenant_id uuid;
BEGIN
  SELECT * INTO v_actor
  FROM public.profiles AS actor
  WHERE actor.id = auth.uid();

  IF v_actor.id IS NULL
     OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;

  SELECT festival.tenant_id INTO v_festival_tenant_id
  FROM public.festival_calendar AS festival
  WHERE festival.id = p_festival_id;

  IF v_festival_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Festival not found.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH visible_festival_orgs AS (
    SELECT visible.id, visible.tenant_id
    FROM public.get_visible_organisations(v_festival_tenant_id) AS visible
  ), scoped_teams AS (
    SELECT ft.id AS team_id, ft.organisation_id AS org_id,
           org.name AS name, org.tenant_id AS org_tenant_id
    FROM public.festival_teams AS ft
    JOIN public.organisations AS org ON org.id = ft.organisation_id
    JOIN visible_festival_orgs AS visible
      ON visible.id = org.id AND visible.tenant_id = org.tenant_id
    WHERE ft.festival_id = p_festival_id
      AND ft.parent_tenant_id = v_festival_tenant_id
      AND ft.is_active IS TRUE
      AND (
        v_actor.is_superadmin IS TRUE
        OR v_actor.tenant_id = v_festival_tenant_id
        OR public.is_org_visible(ft.organisation_id)
      )
  ), team_participants AS (
    SELECT team.team_id, count(*) AS total_count
    FROM scoped_teams AS team
    JOIN public.participants AS participant
      ON participant.festival_id = p_festival_id
     AND participant.organisation_id = team.org_id
     AND participant.tenant_id IN (v_festival_tenant_id, team.org_tenant_id)
     AND participant.status IS DISTINCT FROM 'rejected'
    GROUP BY team.team_id
  ), current_entries AS (
    SELECT DISTINCT team.team_id, registration.item_id, registration.participant_id
    FROM scoped_teams AS team
    JOIN public.registrations AS registration
      ON registration.festival_id = p_festival_id
     AND registration.organisation_id = team.org_id
     AND registration.tenant_id IN (v_festival_tenant_id, team.org_tenant_id)
     AND registration.entry_kind = 'participant'
     AND registration.status IS DISTINCT FROM 'rejected'
     AND registration.status IS DISTINCT FROM 'cancelled'
    JOIN public.participants AS participant
      ON participant.id = registration.participant_id
     AND participant.festival_id = p_festival_id
     AND participant.organisation_id = team.org_id
     AND participant.tenant_id IN (v_festival_tenant_id, team.org_tenant_id)
     AND participant.status IS DISTINCT FROM 'rejected'
    JOIN public.items AS item
      ON item.id = registration.item_id
     AND item.festival_id = p_festival_id
     AND (item.tenant_id IS NULL OR item.tenant_id = v_festival_tenant_id)
     AND item.is_active IS TRUE
     AND lower(coalesce(item.participation_type, '')) = 'individual'
  ), current_rosters AS (
    SELECT entry.team_id, entry.item_id,
           count(*) AS member_count,
           array_agg(entry.participant_id ORDER BY entry.participant_id) AS participant_ids
    FROM current_entries AS entry
    GROUP BY entry.team_id, entry.item_id
  ), team_assigned AS (
    SELECT entry.team_id, count(DISTINCT entry.participant_id) AS unique_count
    FROM current_entries AS entry
    GROUP BY entry.team_id
  )
  SELECT team.team_id, team.org_id, team.name,
         coalesce(members.total_count, 0::bigint),
         coalesce(assigned.unique_count, 0::bigint),
         roster.item_id, item.item_code,
         coalesce(item.item_name_en, item.item_name_ml, item.item_code),
         coalesce(roster.member_count, 0::bigint),
         coalesce(completion.assigned_participant_ids = roster.participant_ids, false)
  FROM scoped_teams AS team
  LEFT JOIN team_participants AS members ON members.team_id = team.team_id
  LEFT JOIN team_assigned AS assigned ON assigned.team_id = team.team_id
  LEFT JOIN current_rosters AS roster ON roster.team_id = team.team_id
  LEFT JOIN public.items AS item ON item.id = roster.item_id
  LEFT JOIN public.team_leader_program_completions AS completion
    ON completion.tenant_id = v_festival_tenant_id
   AND completion.festival_id = p_festival_id
   AND completion.organisation_id = team.org_id
   AND completion.item_id = roster.item_id
  ORDER BY team.name, item.item_name_en NULLS LAST, item.item_code;
END;
$$;

ALTER FUNCTION public.get_admin_team_program_progress(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_admin_team_program_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_team_program_progress(uuid) TO authenticated;
