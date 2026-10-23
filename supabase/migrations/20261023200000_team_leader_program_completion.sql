-- Team Leader completion is an explicit team-level acknowledgement, separate
-- from participant registration and event schedule lifecycle status.
CREATE TABLE public.team_leader_program_completions (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  assigned_participant_ids uuid[] NOT NULL,
  completed_by uuid NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, festival_id, organisation_id, item_id),
  CONSTRAINT team_leader_program_completion_has_participants
    CHECK (cardinality(assigned_participant_ids) > 0)
);

ALTER TABLE public.team_leader_program_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_leader_program_completions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.team_leader_program_completions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_team_leader_completed_program_ids()
RETURNS TABLE (item_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH context AS (
    SELECT c.parent_tenant_id, c.festival_id, c.organisation_id, o.tenant_id AS organisation_tenant_id
    FROM public.get_team_leader_context() AS c
    JOIN public.organisations AS o ON o.id = c.organisation_id AND o.tenant_id IS NOT NULL
    WHERE EXISTS (
      SELECT 1 FROM public.get_visible_organisations(c.parent_tenant_id) AS visible
      WHERE visible.id = o.id AND visible.tenant_id = o.tenant_id
    )
  ), current_rosters AS (
    SELECT r.item_id,
           array_agg(DISTINCT r.participant_id ORDER BY r.participant_id) AS participant_ids
    FROM context AS c
    JOIN public.registrations AS r
      ON r.festival_id = c.festival_id
     AND r.organisation_id = c.organisation_id
     AND r.tenant_id IN (c.parent_tenant_id, c.organisation_tenant_id)
     AND r.entry_kind = 'participant'
     AND r.status IS DISTINCT FROM 'rejected'
     AND r.status IS DISTINCT FROM 'cancelled'
    JOIN public.participants AS p
      ON p.id = r.participant_id
     AND p.festival_id = c.festival_id
     AND p.organisation_id = c.organisation_id
     AND p.tenant_id IN (c.parent_tenant_id, c.organisation_tenant_id)
     AND p.status IS DISTINCT FROM 'rejected'
    GROUP BY r.item_id
  )
  SELECT completion.item_id
  FROM context AS c
  JOIN current_rosters AS roster ON true
  JOIN public.team_leader_program_completions AS completion
    ON completion.tenant_id = c.parent_tenant_id
   AND completion.festival_id = c.festival_id
   AND completion.organisation_id = c.organisation_id
   AND completion.item_id = roster.item_id
   AND completion.assigned_participant_ids = roster.participant_ids;
$$;

ALTER FUNCTION public.get_team_leader_completed_program_ids() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_team_leader_completed_program_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_completed_program_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.team_leader_mark_program_completed(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_context record;
  v_organisation_tenant_id uuid;
  v_participant_ids uuid[];
  v_completed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;

  SELECT o.tenant_id INTO v_organisation_tenant_id
  FROM public.organisations AS o
  WHERE o.id = v_context.organisation_id
    AND o.tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) AS visible
      WHERE visible.id = o.id AND visible.tenant_id = o.tenant_id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The assigned team is outside the festival tenant scope.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.items AS i
    WHERE i.id = p_item_id
      AND i.festival_id = v_context.festival_id
      AND (i.tenant_id IS NULL OR i.tenant_id = v_context.parent_tenant_id)
      AND lower(COALESCE(i.participation_type, '')) = 'individual'
  ) THEN
    RAISE EXCEPTION 'This individual program is unavailable.' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT r.participant_id ORDER BY r.participant_id)
  INTO v_participant_ids
  FROM public.registrations AS r
  JOIN public.participants AS p
    ON p.id = r.participant_id
   AND p.festival_id = v_context.festival_id
   AND p.organisation_id = v_context.organisation_id
   AND p.tenant_id IN (v_context.parent_tenant_id, v_organisation_tenant_id)
   AND p.status IS DISTINCT FROM 'rejected'
  WHERE r.item_id = p_item_id
    AND r.festival_id = v_context.festival_id
    AND r.organisation_id = v_context.organisation_id
    AND r.tenant_id IN (v_context.parent_tenant_id, v_organisation_tenant_id)
    AND r.entry_kind = 'participant'
    AND r.status IS DISTINCT FROM 'rejected'
    AND r.status IS DISTINCT FROM 'cancelled';

  IF COALESCE(cardinality(v_participant_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Add at least one participant before completing this program.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.team_leader_program_completions (
    tenant_id, festival_id, organisation_id, item_id,
    assigned_participant_ids, completed_by, completed_at
  ) VALUES (
    v_context.parent_tenant_id, v_context.festival_id, v_context.organisation_id, p_item_id,
    v_participant_ids, auth.uid(), now()
  )
  ON CONFLICT (tenant_id, festival_id, organisation_id, item_id)
  DO UPDATE SET
    assigned_participant_ids = EXCLUDED.assigned_participant_ids,
    completed_by = EXCLUDED.completed_by,
    completed_at = EXCLUDED.completed_at
  RETURNING completed_at INTO v_completed_at;

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'participant_count', cardinality(v_participant_ids),
    'completed_at', v_completed_at,
    'status', 'completed'
  );
END;
$$;

ALTER FUNCTION public.team_leader_mark_program_completed(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.team_leader_mark_program_completed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_leader_mark_program_completed(uuid) TO authenticated;
