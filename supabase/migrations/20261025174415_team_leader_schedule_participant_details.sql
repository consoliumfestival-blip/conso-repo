-- Additive read only endpoint; existing reads, mutations and policies are untouched.
-- Requires 20261024130233_team_leader_participant_export_rows.sql.
CREATE OR REPLACE FUNCTION private.get_team_leader_schedule_participants(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_context record;
  v_schedule public.schedules%ROWTYPE;
  v_complete boolean;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;
  SELECT s.* INTO v_schedule FROM public.schedules s
  JOIN public.items i ON i.id = s.item_id AND i.festival_id = s.festival_id
    AND (i.tenant_id IS NULL OR i.tenant_id = v_context.parent_tenant_id)
  WHERE s.id = p_schedule_id AND s.tenant_id = v_context.parent_tenant_id
    AND s.festival_id = v_context.festival_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The event is unavailable in this festival.' USING ERRCODE = '42501';
  END IF;

  -- Match Admin card visibility and check-in: all non-rejected entries verified
  -- OR shuffle locked. Lifecycle and own-team counts do not imply completion.
  WITH visible AS MATERIALIZED (
    SELECT id, tenant_id FROM public.get_visible_organisations(v_context.parent_tenant_id)
  ), active AS (
    SELECT r.is_verified FROM public.registrations r
    LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = v_schedule.festival_id
    WHERE r.festival_id = v_schedule.festival_id AND r.item_id = v_schedule.item_id
      AND r.status IS DISTINCT FROM 'rejected'
      AND (r.organisation_id IN (SELECT id FROM visible)
        OR r.tenant_id IN (SELECT tenant_id FROM visible)
        OR p.organisation_id IN (SELECT id FROM visible))
      AND (r.entry_kind = 'general_team' OR p.id IS NOT NULL)
  )
  SELECT COALESCE(v_schedule.is_shuffle_locked, false)
    OR (count(*) > 0 AND COALESCE(bool_and(is_verified IS TRUE), false))
  INTO v_complete FROM active;

  -- Existing own-team source validates visibility and includes rejected/cancelled
  -- assignments plus all general-group members. No other team's rows are returned.
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.chest_number, e.participant_name, e.participant_id), '[]'::jsonb)
  INTO v_rows FROM private.get_team_leader_participant_export_rows() e
  WHERE e.item_id = v_schedule.item_id AND e.registration_id IS NOT NULL
    AND e.organisation_id = v_context.organisation_id;
  RETURN jsonb_build_object('schedule_id', v_schedule.id, 'item_id', v_schedule.item_id,
    'checkin_complete', v_complete, 'participants', v_rows);
END;
$$;
ALTER FUNCTION private.get_team_leader_schedule_participants(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.get_team_leader_schedule_participants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_team_leader_schedule_participants(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_team_leader_schedule_participants(p_schedule_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.get_team_leader_schedule_participants(p_schedule_id); $$;
REVOKE ALL ON FUNCTION public.get_team_leader_schedule_participants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_schedule_participants(uuid) TO authenticated;
