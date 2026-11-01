-- Read-only, warning-only schedule planning aid. This does not block or
-- mutate schedule creation, registrations, check-in, code letters, or marks.
CREATE INDEX IF NOT EXISTS schedules_tenant_festival_time_range_idx
  ON public.schedules (tenant_id, festival_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS registrations_tenant_festival_item_person_active_idx
  ON public.registrations (tenant_id, festival_id, item_id, participant_id)
  WHERE status IS DISTINCT FROM 'rejected';

CREATE OR REPLACE FUNCTION public.preview_schedule_participant_conflicts(
  p_festival_id uuid,
  p_candidates jsonb
)
RETURNS TABLE (
  candidate_key text,
  candidate_item_id uuid,
  candidate_item_name text,
  participant_id uuid,
  participant_name text,
  chest_number text,
  conflicting_schedule_id uuid,
  conflicting_candidate_key text,
  conflicting_item_id uuid,
  conflicting_item_name text,
  conflicting_venue_name text,
  conflicting_start_time timestamptz,
  conflicting_end_time timestamptz,
  candidate_is_group_member boolean,
  conflict_is_group_member boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_festival_id IS NULL OR jsonb_typeof(p_candidates) <> 'array' THEN
    RAISE EXCEPTION 'A festival and candidate schedule list are required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id INTO v_tenant_id FROM public.festival_calendar WHERE id = p_festival_id;

  IF v_tenant_id IS NULL
    OR v_actor.id IS NULL
    OR (v_actor.is_superadmin IS NOT TRUE AND (
      v_actor.role IS DISTINCT FROM 'admin'
      OR v_actor.tenant_id IS DISTINCT FROM v_tenant_id
    )) THEN
    RAISE EXCEPTION 'Administrator access to this festival is required.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_array_length(p_candidates) > 1000 THEN
    RAISE EXCEPTION 'At most 1000 candidate schedules can be previewed at once.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_candidates) AS value(entry)
    WHERE nullif(btrim(entry ->> 'key'), '') IS NULL
      OR nullif(entry ->> 'item_id', '') IS NULL
      OR nullif(entry ->> 'start_time', '') IS NULL
      OR nullif(entry ->> 'end_time', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Every candidate needs a key, item, start time, and end time.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT
      btrim(entry ->> 'key') AS candidate_key,
      (entry ->> 'item_id')::uuid AS item_id,
      (entry ->> 'start_time')::timestamptz AS start_time,
      (entry ->> 'end_time')::timestamptz AS end_time,
      nullif(entry ->> 'exclude_schedule_id', '')::uuid AS exclude_schedule_id
    FROM jsonb_array_elements(p_candidates) AS value(entry)
  ),
  valid_candidates AS MATERIALIZED (
    SELECT c.*, i.item_name_en
    FROM candidates c
    JOIN public.items i
      ON i.id = c.item_id
      AND i.festival_id = p_festival_id
      AND i.tenant_id = v_tenant_id
    WHERE c.end_time > c.start_time
  ),
  candidate_people AS MATERIALIZED (
    SELECT DISTINCT ON (source.candidate_key, source.participant_id)
      source.candidate_key,
      source.item_id,
      source.start_time,
      source.end_time,
      source.exclude_schedule_id,
      source.item_name_en,
      source.participant_id,
      source.is_group_member
    FROM (
      SELECT c.candidate_key, c.item_id, c.start_time, c.end_time, c.exclude_schedule_id,
        c.item_name_en, r.participant_id, false AS is_group_member
      FROM valid_candidates c
      JOIN public.registrations r
        ON r.tenant_id = v_tenant_id
        AND r.festival_id = p_festival_id
        AND r.item_id = c.item_id
        AND r.status IS DISTINCT FROM 'rejected'
      WHERE r.participant_id IS NOT NULL

      UNION ALL

      SELECT c.candidate_key, c.item_id, c.start_time, c.end_time, c.exclude_schedule_id,
        c.item_name_en, gm.participant_id, true AS is_group_member
      FROM valid_candidates c
      JOIN public.registrations r
        ON r.tenant_id = v_tenant_id
        AND r.festival_id = p_festival_id
        AND r.item_id = c.item_id
        AND r.status IS DISTINCT FROM 'rejected'
      JOIN public.group_members gm ON gm.registration_id = r.id
      WHERE gm.participant_id IS NOT NULL
    ) source
    ORDER BY source.candidate_key, source.participant_id, source.is_group_member DESC
  ),
  overlapping_schedules AS MATERIALIZED (
    SELECT DISTINCT s.id, s.item_id, s.venue_id, s.start_time, s.end_time
    FROM public.schedules s
    JOIN valid_candidates c
      ON s.start_time < c.end_time
      AND s.end_time > c.start_time
      AND s.id IS DISTINCT FROM c.exclude_schedule_id
    WHERE s.tenant_id = v_tenant_id
      AND s.festival_id = p_festival_id
  ),
  scheduled_people AS MATERIALIZED (
    SELECT DISTINCT ON (source.schedule_id, source.participant_id)
      source.schedule_id,
      source.item_id,
      source.item_name_en,
      source.venue_name,
      source.start_time,
      source.end_time,
      source.participant_id,
      source.is_group_member
    FROM (
      SELECT s.id AS schedule_id, s.item_id, i.item_name_en, v.name AS venue_name,
        s.start_time, s.end_time, r.participant_id, false AS is_group_member
      FROM overlapping_schedules s
      JOIN public.items i ON i.id = s.item_id
      LEFT JOIN public.venues v ON v.id = s.venue_id
      JOIN public.registrations r
        ON r.tenant_id = v_tenant_id
        AND r.festival_id = p_festival_id
        AND r.item_id = s.item_id
        AND r.status IS DISTINCT FROM 'rejected'
      WHERE r.participant_id IS NOT NULL

      UNION ALL

      SELECT s.id AS schedule_id, s.item_id, i.item_name_en, v.name AS venue_name,
        s.start_time, s.end_time, gm.participant_id, true AS is_group_member
      FROM overlapping_schedules s
      JOIN public.items i ON i.id = s.item_id
      LEFT JOIN public.venues v ON v.id = s.venue_id
      JOIN public.registrations r
        ON r.tenant_id = v_tenant_id
        AND r.festival_id = p_festival_id
        AND r.item_id = s.item_id
        AND r.status IS DISTINCT FROM 'rejected'
      JOIN public.group_members gm ON gm.registration_id = r.id
      WHERE gm.participant_id IS NOT NULL
    ) source
    ORDER BY source.schedule_id, source.participant_id, source.is_group_member DESC
  ),
  persisted_conflicts AS (
    SELECT
      cp.candidate_key,
      cp.item_id AS candidate_item_id,
      cp.item_name_en AS candidate_item_name,
      cp.participant_id,
      person.name AS participant_name,
      person.chest_number,
      sp.schedule_id AS conflicting_schedule_id,
      NULL::text AS conflicting_candidate_key,
      sp.item_id AS conflicting_item_id,
      sp.item_name_en AS conflicting_item_name,
      sp.venue_name AS conflicting_venue_name,
      sp.start_time AS conflicting_start_time,
      sp.end_time AS conflicting_end_time,
      cp.is_group_member AS candidate_is_group_member,
      sp.is_group_member AS conflict_is_group_member
    FROM candidate_people cp
    JOIN scheduled_people sp ON sp.participant_id = cp.participant_id
      AND sp.schedule_id IS DISTINCT FROM cp.exclude_schedule_id
      AND sp.start_time < cp.end_time
      AND sp.end_time > cp.start_time
    JOIN public.participants person ON person.id = cp.participant_id
  ),
  draft_conflicts AS (
    SELECT
      left_side.candidate_key,
      left_side.item_id AS candidate_item_id,
      left_side.item_name_en AS candidate_item_name,
      left_side.participant_id,
      person.name AS participant_name,
      person.chest_number,
      NULL::uuid AS conflicting_schedule_id,
      right_side.candidate_key AS conflicting_candidate_key,
      right_side.item_id AS conflicting_item_id,
      right_side.item_name_en AS conflicting_item_name,
      NULL::text AS conflicting_venue_name,
      right_side.start_time AS conflicting_start_time,
      right_side.end_time AS conflicting_end_time,
      left_side.is_group_member AS candidate_is_group_member,
      right_side.is_group_member AS conflict_is_group_member
    FROM candidate_people left_side
    JOIN candidate_people right_side
      ON right_side.participant_id = left_side.participant_id
      AND right_side.candidate_key <> left_side.candidate_key
      AND right_side.start_time < left_side.end_time
      AND right_side.end_time > left_side.start_time
    JOIN public.participants person ON person.id = left_side.participant_id
  )
  SELECT DISTINCT * FROM (
    SELECT * FROM persisted_conflicts
    UNION ALL
    SELECT * FROM draft_conflicts
  ) conflicts
  ORDER BY candidate_key, participant_name, conflicting_start_time, conflicting_item_name;
END;
$function$;

ALTER FUNCTION public.preview_schedule_participant_conflicts(uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.preview_schedule_participant_conflicts(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_schedule_participant_conflicts(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_schedule_participant_conflicts(uuid, jsonb) TO authenticated;
